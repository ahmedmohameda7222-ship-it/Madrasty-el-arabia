import "server-only";
import type { z } from "zod";
import { normalizedImportSchema, importPreviewRowSchema, type importColumns, type NormalizedFamilyImport,
  type ImportReason, type importDecision } from "@madrasty/contracts";
import { hashCommand } from "@/server/db/commands";
import type { Transaction } from "@/server/db/scoped";
import type { ParsedImport } from "./import-reader";

export const familyImportNamespace = "school-family-import";
export type Decision = z.infer<typeof importDecision>;
type Preview = z.infer<typeof importPreviewRowSchema>;

export type ReviewRow = {
  rowNo: number;
  fields: NormalizedFamilyImport | null;
  issue: ImportReason | null;
  issueColumn: string | null;
  decision: Decision | null;
  matchedOverride: string | null;
  payerOverride: boolean | null;
};

type StudentMatch = { id: string; number: string; name: string; external: string | null; state: string; revision: number };
type GuardianMatch = { id: string; name: string; email: string | null; locale: string; accountId: string | null; revision: number };
type LinkMatch = { id: string; state: string; revision: number };

export type Reviewed = {
  preview: Preview;
  student: StudentMatch | null;
  guardian: GuardianMatch | null;
  link: LinkMatch | null;
};

const identifiers = new Set(["childKey", "guardianKey", "studentNumber"]);

function payer(value: string) {
  if (!value) return null;
  if (["yes", "true", "ja", "نعم", "1"].includes(value.toLowerCase())) return true;
  if (["no", "false", "nein", "لا", "0"].includes(value.toLowerCase())) return false;
  return undefined;
}

export function normalizeRows(parsed: ParsedImport, columns: z.infer<typeof importColumns>): ReviewRow[] {
  return parsed.rows.map(({ rowNo, cells }) => {
    const review: ReviewRow = { rowNo, fields: null, issue: null, issueColumn: null,
      decision: null, matchedOverride: null, payerOverride: null };
    const fields: Record<string, unknown> = {};
    for (const [key, index] of Object.entries(columns)) {
      const cell = cells.get(index);
      const value = cell?.value.trim() ?? "";
      if (cell?.kind === "formula" || (identifiers.has(key) && /^[=+@]/.test(value))) {
        return { ...review, issue: "formula", issueColumn: key };
      }
      if (identifiers.has(key) && cell?.kind === "number") {
        return { ...review, issue: "identifier_needs_text", issueColumn: key };
      }
      fields[key] = value;
    }
    const candidate = payer(typeof fields.payerCandidate === "string" ? fields.payerCandidate : "");
    const parsedRow = normalizedImportSchema.safeParse({
      ...fields, studentNumber: fields.studentNumber || null, payerCandidate: candidate,
    });
    return parsedRow.success ? { ...review, fields: parsedRow.data }
      : { ...review, issue: "invalid_value", issueColumn: String(parsedRow.error.issues[0]?.path[0] ?? "") };
  });
}

async function findStudent(tx: Transaction, source: NormalizedFamilyImport, override: string | null) {
  const [row] = await tx<StudentMatch[]>`
    select id, student_number as number, display_name as name, external_key as external, state, revision
    from app.student
    where (${override}::uuid is not null and id = ${override}::uuid)
      or (${override}::uuid is null and (
        (${source.studentNumber}::text is not null and student_number = ${source.studentNumber})
        or (source_namespace = ${familyImportNamespace} and external_key = ${source.childKey})))
    order by (student_number = ${source.studentNumber}) desc nulls last, id limit 1
  `;
  return row ?? null;
}

async function findGuardian(tx: Transaction, source: NormalizedFamilyImport, override: string | null) {
  const [row] = await tx<GuardianMatch[]>`
    select id, display_name as name, contact_email as email, correspondence_locale as locale, account_id as "accountId", revision
    from app.guardian_profile
    where (${override}::uuid is not null and id = ${override}::uuid) or
      (${override}::uuid is null and source_namespace = ${familyImportNamespace} and external_key = ${source.guardianKey})
    limit 1
  `;
  return row ?? null;
}

export async function reviewRows(tx: Transaction, rows: ReviewRow[]) {
  const seenPairs = new Map<string, string>();
  const children = new Map<string, string>();
  const adults = new Map<string, string>();
  const emailKeys = new Map<string, Set<string>>();
  const inconsistent = new Set<string>();
  for (const item of rows) {
    if (!item.fields || item.decision === "skip") continue;
    const fields = item.fields;
    const child = hashCommand([fields.childName, fields.studentNumber]);
    const guardian = hashCommand([fields.guardianName, fields.email, fields.communicationLocale]);
    if (children.has(fields.childKey) && children.get(fields.childKey) !== child) inconsistent.add("child:" + fields.childKey);
    if (adults.has(fields.guardianKey) && adults.get(fields.guardianKey) !== guardian) inconsistent.add("guardian:" + fields.guardianKey);
    children.set(fields.childKey, child);
    adults.set(fields.guardianKey, guardian);
    if (!emailKeys.has(fields.email)) emailKeys.set(fields.email, new Set());
    emailKeys.get(fields.email)!.add(fields.guardianKey);
  }

  const result: Reviewed[] = [];
  for (const item of rows) {
    const fields = item.fields;
    const candidate = item.payerOverride ?? fields?.payerCandidate ?? null;
    const preview: Preview = {
      rowNo: item.rowNo, display: fields && { ...fields, payerCandidate: candidate }, disposition: "new",
      reason: item.issue, column: item.issueColumn, decision: item.decision,
    };
    const current: Reviewed = { preview, student: null, guardian: null, link: null };
    result.push(current);
    if (item.decision === "skip") { preview.disposition = "skipped"; continue; }
    if (!fields || item.issue) { preview.disposition = "conflict"; continue; }
    if (inconsistent.has("child:" + fields.childKey) || inconsistent.has("guardian:" + fields.guardianKey)) {
      preview.disposition = "conflict"; preview.reason = "conflicting_rows"; continue;
    }

    const childOverride = item.decision === "match_student" ? item.matchedOverride : null;
    const adultOverride = item.decision === "match_guardian" ? item.matchedOverride : null;
    current.student = await findStudent(tx, fields, childOverride);
    current.guardian = await findGuardian(tx, fields, adultOverride);
    const { student, guardian } = current;
    if (childOverride && !student || adultOverride && !guardian) {
      preview.disposition = "conflict"; preview.reason = "decision_required"; continue;
    }
    if (!childOverride && fields.studentNumber && student?.number !== fields.studentNumber) {
      preview.disposition = "conflict"; preview.reason = "student_number_unknown"; preview.column = "studentNumber"; continue;
    }
    if (student && student.state !== "active") {
      preview.disposition = "conflict"; preview.reason = "inactive_student"; continue;
    }
    if (!childOverride && student?.external && student.external !== fields.childKey) {
      preview.disposition = "conflict"; preview.reason = "source_key_mismatch"; preview.column = "childKey"; continue;
    }
    if (!guardian) {
      const [collision] = await tx`select id from app.guardian_profile where contact_email = ${fields.email} limit 1`;
      if (collision || (emailKeys.get(fields.email)?.size ?? 0) > 1) { preview.disposition = "conflict"; preview.reason = "guardian_email_collision"; preview.column = "email"; continue; }
    }
    if (item.decision !== "approve" && ((!childOverride && student?.name && student.name !== fields.childName) ||
      (!adultOverride && guardian && (guardian.name !== fields.guardianName || guardian.email !== fields.email ||
      guardian.locale !== fields.communicationLocale)))) {
      preview.disposition = "conflict"; preview.reason = "identity_fields_differ"; continue;
    }

    if (student && guardian) {
      const [link] = await tx<LinkMatch[]>`
        select id, state, revision from app.child_link where student_id = ${student.id} and guardian_id = ${guardian.id}
        order by (state <> 'revoked') desc, created_at desc, id limit 1
      `;
      current.link = link ?? null;
      if (link?.state === "revoked" && item.decision !== "restore") {
        preview.disposition = "revoked"; preview.reason = "link_revoked"; continue;
      }
      if (link && link.state !== "revoked") preview.disposition = "existing";
    }

    const pair = JSON.stringify([student?.id ?? fields.childKey, guardian?.id ?? fields.guardianKey]);
    const fingerprint = hashCommand([fields.childName, fields.guardianName, fields.email, candidate]);
    if (seenPairs.has(pair)) {
      const same = seenPairs.get(pair) === fingerprint;
      preview.disposition = same ? "duplicate" : "conflict";
      preview.reason = same ? null : "conflicting_rows";
      continue;
    }
    seenPairs.set(pair, fingerprint);
  }

  const owners = new Map<string, Set<string>>();
  for (const item of result) {
    const { preview } = item;
    const display = preview.display;
    if (!display || !["new", "existing"].includes(preview.disposition)) continue;
    const child = item.student?.id ?? display.childKey;
    if (!owners.has(child)) owners.set(child, new Set());
    if (display.payerCandidate) owners.get(child)!.add(item.guardian?.id ?? display.guardianKey);
  }
  for (const item of result) {
    const display = item.preview.display;
    if (!display || !["new", "existing"].includes(item.preview.disposition)) continue;
    const count = owners.get(item.student?.id ?? display.childKey)?.size ?? 0;
    if (count > 1 && display.payerCandidate) {
      item.preview.disposition = "conflict";
      item.preview.reason = "payer_conflict";
    } else if (count === 0) item.preview.reason = "payer_missing";
  }
  return result;
}
