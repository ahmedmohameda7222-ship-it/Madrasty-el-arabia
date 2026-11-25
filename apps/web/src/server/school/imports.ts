import "server-only";
import { createHash } from "node:crypto";
import {
  importInspectionSchema, importPreviewSchema, importReceiptSchema, importVersionSchema, maxFamilyUploadBytes,
  normalizedImportSchema, importMappingInput, type importDecisionInput, type importSheetOptions,
  type importUploadInput,
} from "@madrasty/contracts";
import type { z } from "zod";
import { requireCapability } from "@/server/access/policies";
import { commitCommand, hashCommand, requireRevision } from "@/server/db/commands";
import { appendAudit, appendEvent } from "@/server/db/outbox";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";
import { parseFamilyFile } from "./import-reader";
import { familyImportNamespace, normalizeRows, reviewRows, type ReviewRow, type Reviewed } from "./import-review";

type Job = {
  id: string; fileName: string; mime: string; state: string; revision: number; expiresAt: string;
  bytes: Buffer | null; receipt: unknown; mapping: unknown;
};
type StoredReview = {
  rowNo: number; fields: unknown; issue: ReviewRow["issue"]; column: string | null;
  disposition: Reviewed["preview"]["disposition"]; decision: ReviewRow["decision"];
  matchedOverride: string | null; payerOverride: boolean | null;
  studentId: string | null; studentRevision: number | null; guardianId: string | null;
  guardianRevision: number | null; linkId: string | null; linkRevision: number | null;
};

const allowed = (ctx: ActorContext) => (tx: Transaction) => requireCapability(tx, ctx, "students.manage");
const counts = (rows: Reviewed["preview"][]) => {
  const totals = { new: 0, existing: 0, duplicate: 0, conflict: 0, revoked: 0, skipped: 0 };
  rows.forEach(({ disposition }) => { totals[disposition]++; });
  return totals;
};

async function job(tx: Transaction, id: string, lock = false, source = false) {
  const [row] = await tx<Job[]>`
    select id, file_name as "fileName", file_mime as mime, state, revision,
      to_char(expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "expiresAt",
      ${source ? tx`source_bytes` : tx`null::bytea`} as bytes, receipt, mapping
    from app.family_import_job where id = ${id} ${lock ? tx`for update` : tx``}
  `;
  if (!row) throw new ApiError("not_found");
  return row;
}

function version(row: Job) {
  return importVersionSchema.parse(row);
}

function assertWritable(row: Job) {
  if (row.state === "committed") throw new ApiError("conflict");
}

async function storedRows(tx: Transaction, id: string) {
  return tx<StoredReview[]>`
    select row_no as "rowNo", fields, failure_code as issue, failure_column as "column", disposition, decision,
      matched_override as "matchedOverride", payer_override as "payerOverride",
      student_id as "studentId", student_revision as "studentRevision", guardian_id as "guardianId",
      guardian_revision as "guardianRevision", link_id as "linkId", link_revision as "linkRevision"
    from app.family_import_row where job_id = ${id} order by row_no
  `;
}

function asReview(stored: StoredReview): ReviewRow {
  const fields = stored.fields ? normalizedImportSchema.parse(stored.fields) : null;
  return { rowNo: stored.rowNo, fields, issue: fields ? null : stored.issue, issueColumn: fields ? null : stored.column,
    decision: stored.decision, matchedOverride: stored.matchedOverride, payerOverride: stored.payerOverride };
}

function fingerprint(reviewed: Reviewed) {
  return hashCommand([
    reviewed.preview.disposition, reviewed.preview.reason, reviewed.student?.id ?? null, reviewed.student?.revision ?? null,
    reviewed.guardian?.id ?? null, reviewed.guardian?.revision ?? null, reviewed.link?.id ?? null, reviewed.link?.revision ?? null,
  ]);
}

function storedFingerprint(row: StoredReview) {
  return hashCommand([row.disposition, row.issue, row.studentId, row.studentRevision,
    row.guardianId, row.guardianRevision, row.linkId, row.linkRevision]);
}

async function storeReviews(tx: Transaction, id: string, submitted: ReviewRow[], reviewed: Reviewed[]) {
  await tx`delete from app.family_import_row where job_id = ${id}`;
  const rows = reviewed.map((row, index) => {
    const base = submitted[index];
    return {
      row_no: base.rowNo, fields: base.fields, disposition: row.preview.disposition, failure_code: row.preview.reason,
      failure_column: row.preview.column, decision: base.decision, matched_override: base.matchedOverride,
      payer_override: base.payerOverride, student_id: row.student?.id ?? null, student_revision: row.student?.revision ?? null,
      guardian_id: row.guardian?.id ?? null, guardian_revision: row.guardian?.revision ?? null,
      link_id: row.link?.id ?? null, link_revision: row.link?.revision ?? null,
    };
  });
  await tx`
    insert into app.family_import_row (job_id, row_no, fields, disposition, failure_code, failure_column, decision,
      matched_override, payer_override, student_id, student_revision, guardian_id, guardian_revision, link_id, link_revision)
    select ${id}, r.* from jsonb_to_recordset(${tx.json(rows)}) r(
      row_no integer, fields jsonb, disposition text, failure_code text, failure_column text, decision text,
      matched_override uuid, payer_override boolean, student_id uuid, student_revision integer,
      guardian_id uuid, guardian_revision integer, link_id uuid, link_revision integer)
  `;
}

async function present(tx: Transaction, id: string) {
  const current = await job(tx, id);
  const rows = (await storedRows(tx, id)).map((row) => {
    const item = asReview(row);
    return {
      rowNo: row.rowNo, disposition: row.disposition, reason: row.issue, column: row.column,
      display: item.fields && { ...item.fields, payerCandidate: item.payerOverride ?? item.fields.payerCandidate },
      decision: row.decision,
    };
  });
  return importPreviewSchema.parse({ ...version(current), rows, counts: counts(rows) });
}

export async function uploadImport(ctx: ActorContext, key: string | null, upload: z.infer<typeof importUploadInput>) {
  const bytes = Buffer.from(upload.bytesBase64, "base64");
  if (bytes.length === 0 || bytes.length > maxFamilyUploadBytes ||
      bytes.toString("base64") !== upload.bytesBase64) throw new ApiError("validation", { file: "imports.invalidFile" });
  if ((upload.mime === "text/csv" && !/\.csv$/i.test(upload.fileName)) ||
      (upload.mime !== "text/csv" && !/\.xlsx$/i.test(upload.fileName))) {
    throw new ApiError("validation", { fileName: "imports.invalidFile" });
  }
  const fileName = upload.fileName.split(/[\\/]/).at(-1)!;
  const hash = createHash("sha256").update(bytes).digest("hex");
  return commitCommand(ctx, "school.import.upload", key, hashCommand({ mime: upload.mime, hash, fileName }), {
    authorize: allowed(ctx),
    mutate: async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into app.family_import_job (owner_id, file_name, file_mime, source_hash, source_bytes)
        values (${ctx.accountId}, ${fileName}, ${upload.mime}, ${hash}, ${bytes}) returning id
      `;
      await appendAudit(tx, { action: "school.import_uploaded", aggregateId: row.id, metadata: { bytes: bytes.length } });
      return version(await job(tx, row.id));
    },
  });
}

export async function inspectImport(ctx: ActorContext, id: string, options: z.infer<typeof importSheetOptions>) {
  const file = await withActor(ctx, async (tx) => { await allowed(ctx)(tx); return job(tx, id, false, true); });
  assertWritable(file);
  if (!file.bytes) throw new ApiError("not_found");
  const saved = importMappingInput.safeParse(file.mapping).data;
  const parsed = await parseFamilyFile(file.bytes, file.mime, {
    worksheet: options.worksheet ?? saved?.worksheet,
    delimiter: options.delimiter ?? saved?.delimiter,
  });
  const same = saved && (saved.worksheet ?? null) === parsed.worksheet && (saved.delimiter ?? null) === parsed.delimiter;
  return importInspectionSchema.parse({ ...version(file), columns: parsed.columns, worksheets: parsed.worksheets,
    worksheet: parsed.worksheet, delimiter: parsed.delimiter, savedColumnMap: same ? saved.columnMap : undefined });
}

export async function mapImport(ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof importMappingInput>) {
  return commitCommand(ctx, "school.import.map", key, hashCommand({ id, ...input }), {
    authorize: async (tx) => { await allowed(ctx)(tx); await job(tx, id); },
    mutate: async (tx) => {
      const stored = await job(tx, id, true, true);
      assertWritable(stored);
      requireRevision(stored.revision, input.revision);
      if (!stored.bytes) throw new ApiError("not_found");
      const parsed = await parseFamilyFile(stored.bytes, stored.mime, input);
      const columns = new Set(parsed.columns.map(({ index }) => index));
      if (Object.values(input.columnMap).some((column) => !columns.has(column))) throw new ApiError("validation", { columnMap: "error.validation" });
      const rows = normalizeRows(parsed, input.columnMap);
      const review = await reviewRows(tx, rows);
      await storeReviews(tx, id, rows, review);
      await tx`update app.family_import_job set state = 'review', mapping = ${tx.json(input)}, revision = revision + 1 where id = ${id}`;
      return present(tx, id);
    },
  });
}

export function previewImport(ctx: ActorContext, id: string) {
  return withActor(ctx, async (tx) => { await allowed(ctx)(tx); return present(tx, id); });
}

export function decideImport(ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof importDecisionInput>) {
  return commitCommand(ctx, "school.import.decide", key, hashCommand({ id, ...input }), {
    authorize: async (tx) => { await allowed(ctx)(tx); await job(tx, id); },
    mutate: async (tx) => {
      const current = await job(tx, id, true);
      if (current.state !== "review") throw new ApiError("conflict");
      requireRevision(current.revision, input.revision);
      const choices = new Map(input.rows.map((row) => [row.rowNo, row]));
      const rows = (await storedRows(tx, id)).map(asReview);
      if (input.rows.some(({ rowNo }) => !rows.some((row) => row.rowNo === rowNo))) throw new ApiError("validation");
      const updated = rows.map((row) => {
        const change = choices.get(row.rowNo);
        return change ? { ...row, decision: change.decision, matchedOverride: change.matchedId ?? null,
          payerOverride: change.payerCandidate ?? row.payerOverride } : row;
      });
      await storeReviews(tx, id, updated, await reviewRows(tx, updated));
      await tx`update app.family_import_job set revision = revision + 1 where id = ${id}`;
      return present(tx, id);
    },
  });
}

export function commitImport(ctx: ActorContext, id: string, key: string | null, reviewedRevision: number) {
  return commitCommand(ctx, "school.import.commit", key, hashCommand({ id, reviewedRevision }), {
    authorize: async (tx) => { await allowed(ctx)(tx); await job(tx, id); },
    mutate: async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended('madrasty:family-import', 0))`;
      const current = await job(tx, id, true);
      if (current.state === "committed") {
        if (current.revision !== reviewedRevision + 1) throw new ApiError("stale_revision");
        return importReceiptSchema.parse(current.receipt);
      }
      if (current.state !== "review") throw new ApiError("conflict");
      requireRevision(current.revision, reviewedRevision);

      const saved = await storedRows(tx, id);
      const ordered = (values: (string | null)[]) => [...new Set(values.filter((entry): entry is string => Boolean(entry)))].sort();
      await tx`select id from app.student where id = any(${tx.array(ordered(saved.map((row) => row.studentId)))}::uuid[])
        order by id for update`;
      await tx`select id from app.guardian_profile where id = any(${tx.array(ordered(saved.map((row) => row.guardianId)))}::uuid[])
        order by id for update`;
      await tx`select id from app.child_link where id = any(${tx.array(ordered(saved.map((row) => row.linkId)))}::uuid[])
        order by id for update`;
      const checked = await reviewRows(tx, saved.map(asReview));
      if (checked.some((row, index) => fingerprint(row) !== storedFingerprint(saved[index]))) throw new ApiError("stale_revision");
      if (checked.some(({ preview }) => preview.disposition === "conflict" || preview.disposition === "revoked")) {
        throw new ApiError("conflict");
      }

      const pupils = new Map<string, string>();
      const guardians = new Map<string, { id: string; linked: boolean }>();
      const eligible = new Set<string>();
      let linksCreated = 0;
      let rowsCommitted = 0;
      for (const row of checked) {
        const preview = row.preview;
        if (!preview.display || !["new", "existing"].includes(preview.disposition)) continue;
        const item = preview.display;
        let student = row.student?.id ?? pupils.get(item.childKey);
        if (!student) {
          const [inserted] = await tx<{ id: string }[]>`
            insert into app.student (display_name, source_namespace, external_key)
            values (${item.childName}, ${familyImportNamespace}, ${item.childKey}) returning id
          `;
          student = inserted.id;
          pupils.set(item.childKey, student);
        }
        let adult = row.guardian ? { id: row.guardian.id, linked: row.guardian.accountId != null } : guardians.get(item.guardianKey);
        if (!adult) {
          const [inserted] = await tx<{ id: string }[]>`
            insert into app.guardian_profile (display_name, contact_email, correspondence_locale, source_namespace, external_key)
            values (${item.guardianName}, ${item.email}, ${item.communicationLocale}, ${familyImportNamespace}, ${item.guardianKey}) returning id
          `;
          adult = { id: inserted.id, linked: false };
          guardians.set(item.guardianKey, adult);
        }

        const relation = row.link;
        if (!relation || relation.state === "revoked" || relation.state === "pending") {
          const reason = relation?.state === "revoked" ? "approved_import_restore" : "approved_import";
          const [link] = relation?.state === "pending"
            ? await tx<{ id: string; revision: number }[]>`update app.child_link set state = 'approved',
                effective_from = now(), reason = ${reason}, changed_by = ${ctx.accountId}, revision = revision + 1
                where id = ${relation.id} returning id, revision`
            : await tx<{ id: string; revision: number }[]>`insert into app.child_link
                (guardian_id, student_id, state, effective_from, changed_by, reason)
                values (${adult.id}, ${student}, 'approved', now(), ${ctx.accountId}, ${reason}) returning id, revision`;
          linksCreated++;
          if (adult.linked) await appendEvent(tx, { type: "family.link_approved", actorId: ctx.accountId,
            aggregateId: link.id, payload: { revision: link.revision, guardianId: adult.id, studentId: student } });
        }
        if (!adult.linked) eligible.add(adult.id);
        if (item.payerCandidate) await tx`
          insert into app.family_payer_candidate (student_id, guardian_id, proposed_by, origin_job_id)
          values (${student}, ${adult.id}, ${ctx.accountId}, ${id}) on conflict do nothing
        `;
        rowsCommitted++;
      }

      const receipt = importReceiptSchema.parse({
        id, revision: reviewedRevision + 1, rowsCommitted, linksCreated, eligibleGuardians: eligible.size,
      });
      await tx`update app.family_import_job set state = 'committed', receipt = ${tx.json(receipt)},
        revision = revision + 1, source_bytes = null where id = ${id}`;
      for (const guardianId of eligible) await tx`
        insert into app.family_import_recipient (job_id, guardian_id) values (${id}, ${guardianId})
        on conflict do nothing
      `;
      await appendAudit(tx, { action: "school.import_committed", aggregateId: id,
        metadata: { rowsCommitted, linksCreated, eligibleGuardians: eligible.size } });
      return receipt;
    },
  });
}

export function listFamilyImports(ctx: ActorContext) {
  return withActor(ctx, async tx => {
    await allowed(ctx)(tx);
    const rows=await tx<Job[]>`select id, file_name as "fileName", file_mime as mime, state, revision,
      to_char(expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "expiresAt",
      null::bytea as bytes, receipt, mapping
      from app.family_import_job where owner_id=${ctx.accountId} and (state='committed' or expires_at>now())
      order by expires_at desc,id limit 100`;
    return rows.map(version);
  });
}
export function familyImportStatus(ctx:ActorContext,id:string){
  return withActor(ctx,async tx=>{await allowed(ctx)(tx);const current=await job(tx,id);return version(current);});
}
export function familyImportReceipt(ctx:ActorContext,id:string){
  return withActor(ctx,async tx=>{await allowed(ctx)(tx);const current=await job(tx,id);if(current.state!=="committed")throw new ApiError("conflict");return importReceiptSchema.parse(current.receipt);});
}
