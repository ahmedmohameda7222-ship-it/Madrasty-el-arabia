import "server-only";
import {
  assignmentActions, assignmentSchema, assignmentWithSubstitutesSchema, staffAccountSchema, staffSchema, subjectSchema, substituteSchema, teachingViewSchema,
  type assignmentChangeInput, type assignmentInput, type staffChangeInput, type staffInput, type staffListInput, type substituteInput,
} from "@madrasty/contracts";
import type { z } from "zod";
import { commitCommand, hashCommand, requireRevision } from "@/server/db/commands";
import { appendAudit, appendEvent } from "@/server/db/outbox";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";
import { classRecord } from "./enrollments";

async function editor(ctx: ActorContext, tx: Transaction) {
  if (ctx.persona !== "admin") throw new ApiError("forbidden");
  const [result] = await tx<{ allowed: boolean }[]>`select app.staff_editor() as allowed`;
  if (!result.allowed) throw new ApiError("forbidden");
}

const profileFields = (tx: Transaction) => tx`id, account_id as "accountId", display_name as "displayName", role,
  title_ar as "titleAr", title_de as "titleDe", work_email as "workEmail", work_phone as "workPhone",
  active_from::text as "activeFrom", active_until::text as "activeUntil", disabled_at is not null as disabled, revision`;

async function profile(tx: Transaction, id: string, lock = false) {
  const [row] = await tx`select ${profileFields(tx)} from app.staff_profile where id = ${id} ${lock ? tx`for update` : tx``}`;
  if (!row) throw new ApiError("not_found");
  return staffSchema.parse(row);
}

async function activeAccount(tx: Transaction, accountId: string | null, role: string) {
  if (!accountId) return;
  const [row] = await tx<{ matched: boolean }[]>`select (${role === "teacher" ? "teacher" : "admin"}::app.persona
    = any(roles)) as matched from app.staff_accounts() where account_id = ${accountId}`;
  if (!row?.matched) throw new ApiError("validation", { accountId: "error.validation" });
}

export function listStaff(ctx: ActorContext, input: z.infer<typeof staffListInput>) {
  return withActor(ctx, async (tx) => {
    await editor(ctx, tx);
    const term = (input.query ?? "").toLowerCase();
    const records = await tx`
      select ${profileFields(tx)} from app.staff_profile where
        (${input.cursor ?? null}::uuid is null or id > ${input.cursor ?? null}::uuid)
        and (${term} = '' or strpos(lower(display_name), ${term}) > 0)
      order by id limit ${input.limit + 1}`;
    const rows = staffSchema.array().parse(records);
    return { rows: rows.slice(0, input.limit), nextCursor: rows.length > input.limit ? rows[input.limit - 1].id : undefined };
  });
}

export function readStaff(ctx: ActorContext, id: string) {
  return withActor(ctx, async (tx) => { await editor(ctx, tx); return profile(tx, id); });
}

export function createStaff(ctx: ActorContext, key: string | null, input: z.infer<typeof staffInput>) {
  return commitCommand(ctx, "school.staff.create", key, hashCommand(input), {
    authorize: async (tx) => {
      await editor(ctx, tx);
      // All new accounts must be provisioned through the Auth-backed flow.
      throw new ApiError("forbidden");
    },
    mutate: async (tx) => {
      await activeAccount(tx, input.accountId, input.role);
      const [row] = await tx<{ id: string }[]>`
        insert into app.staff_profile(account_id, display_name, role, title_ar, title_de, work_email, work_phone, active_from, active_until)
        values (${input.accountId}, ${input.displayName}, ${input.role}, ${input.titleAr}, ${input.titleDe},
          ${input.workEmail}, ${input.workPhone}, ${input.activeFrom}::date, ${input.activeUntil}::date) returning id`;
      await appendAudit(tx, { action: "school.staff_created", aggregateId: row.id });
      return profile(tx, row.id);
    },
  });
}

export function changeStaff(ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof staffChangeInput>) {
  return commitCommand(ctx, "school.staff.change", key, hashCommand({ id, ...input }), {
    authorize: async (tx) => {
      await editor(ctx, tx);
      const current = await profile(tx, id);
      if (current.role === "admin" || input.role === "admin" || current.role !== input.role
        || current.accountId !== input.accountId) {
        const [owner] = await tx<{ allowed: boolean }[]>`select app.is_hauptadmin() as allowed`;
        if (!owner?.allowed) throw new ApiError("forbidden");
      }
    },
    mutate: async (tx) => {
      await tx`select app.lock_school_calendar()`;
      const current = await profile(tx, id, true);
      if (current.role === "admin" || input.role === "admin" || current.role !== input.role
        || current.accountId !== input.accountId) {
        const [root] = await tx<{ allowed: boolean }[]>`select app.is_hauptadmin() as allowed`;
        if (!root?.allowed) throw new ApiError("forbidden");
      }
      requireRevision(current.revision, input.revision);
      if (input.accountId !== current.accountId || input.role !== current.role) await activeAccount(tx, input.accountId, input.role);
      await tx`update app.staff_profile set account_id = ${input.accountId}, display_name = ${input.displayName}, role = ${input.role},
        title_ar = ${input.titleAr}, title_de = ${input.titleDe}, work_email = ${input.workEmail}, work_phone = ${input.workPhone},
        active_from = ${input.activeFrom}::date, active_until = ${input.activeUntil}::date, revision = revision + 1 where id = ${id}`;
      await appendAudit(tx, { action: "school.staff_updated", aggregateId: id, metadata: { revision: input.revision + 1 } });
      return profile(tx, id);
    },
  });
}

export function staffAccounts(ctx: ActorContext) {
  return withActor(ctx, async (tx) => {
    await editor(ctx,tx);
    return staffAccountSchema.array().parse(await tx`select account_id as "accountId", display_name as "displayName",
      to_jsonb(roles) as roles from app.staff_accounts()`);
  });
}

export function listSubjects(ctx: ActorContext) {
  return withActor(ctx, async (tx) => {
    if (ctx.persona !== "teacher") await editor(ctx,tx);
    return subjectSchema.array().parse(await tx`select id, code, name_ar as "nameAr", name_de as "nameDe" from app.subject order by code`);
  });
}

const assigned = (tx: Transaction) => tx`select t.id, t.class_id as "classId", t.offering_id as "offeringId", t.staff_id as "staffId",
  t.kind, t.effective_from::text as "from", t.effective_until::text as "untilExclusive", t.capabilities, t.revision,
  t.revoked_at is not null as revoked, p.display_name as "staffName", c.code as "classCode",
  c.name_ar as "classNameAr",c.name_de as "classNameDe",s.id as "subjectId",s.name_ar as "subjectNameAr",s.name_de as "subjectNameDe"
  from app.teaching_assignment t join app.staff_profile p on p.id=t.staff_id
  join app.school_class c on c.id=t.class_id left join app.class_subject o on o.id=t.offering_id
  left join app.subject s on s.id=o.subject_id`;

async function assignment(tx: Transaction, id: string) {
  const [row] = await tx`${assigned(tx)} where t.id = ${id}`;
  if (!row) throw new ApiError("not_found");
  return assignmentSchema.parse(row);
}

async function delegates(tx: Transaction, ids: readonly string[]) {
  if (!ids.length) return [];
  return substituteSchema.array().parse(await tx`
    select d.id,d.staff_id as "staffId",d.assignment_id as "assignmentId",d.effective_from::text as "from",
      d.effective_until::text as "untilExclusive", d.capabilities,d.revision,d.revoked_at is not null as revoked,p.display_name as "staffName"
    from app.substitute_assignment d join app.staff_profile p on p.id=d.staff_id
    where d.assignment_id = any(${tx.array([...ids])}::uuid[]) order by d.effective_from,d.id`);
}

export function listAssignments(ctx: ActorContext, id: string) {
  return withActor(ctx, async (tx) => {
    if (ctx.persona === "teacher") return (await teachingOverview(tx)).filter((row) => row.classId === id);
    await editor(ctx,tx);
    await classRecord(tx,id);
    const rows = assignmentSchema.array().parse(await tx`${assigned(tx)} where t.class_id = ${id} order by t.effective_from,t.id`);
    const substitutes = await delegates(tx, rows.map(row => row.id));
    const byAssignment = new Map<string, typeof substitutes>();
    for (const substitute of substitutes) {
      const group = byAssignment.get(substitute.assignmentId);
      if (group) group.push(substitute);
      else byAssignment.set(substitute.assignmentId, [substitute]);
    }
    return rows.map(row => assignmentWithSubstitutesSchema.parse({
      ...row, substitutes: byAssignment.get(row.id) ?? [],
    }));
  });
}

function teachingOverview(tx: Transaction) {
  return tx`select id,class_id as "classId",offering_id as "offeringId",staff_id as "staffId",kind,
    effective_from::text as "from",effective_until::text as "untilExclusive",capabilities,revision,false as revoked,
    staff_name as "staffName", class_code as "classCode", class_name_ar as "classNameAr", class_name_de as "classNameDe",
    subject_id as "subjectId", subject_name_ar as "subjectNameAr",subject_name_de as "subjectNameDe",substitute
    from app.teacher_overview() order by effective_from,id`
    .then((rows) => teachingViewSchema.array().parse(rows));
}

export function myTeaching(ctx: ActorContext) {
  if (ctx.persona !== "teacher") throw new ApiError("forbidden");
  return withActor(ctx, teachingOverview);
}

type AssignmentFields = { staffId: string; kind: string; from: string; untilExclusive: string; capabilities: string[] };
async function insertAssignment(tx: Transaction, id: string, offeringId: string | null, values: AssignmentFields) {
  // A Klassenlehrkraft owns all educational responsibilities for the entire
  // class. Fachlehrkräfte keep explicitly delegated permission boundaries.
  const capabilities = values.kind === "primary" ? [...assignmentActions] : values.capabilities;
  const [row] = await tx<{ id: string }[]>`
    insert into app.teaching_assignment(class_id,offering_id,staff_id,kind,effective_from,effective_until,capabilities)
    values (${id},${offeringId},${values.staffId},${values.kind},${values.from}::date,${values.untilExclusive}::date,
      ${tx.array(capabilities)}::text[]) returning id`;
  return assignment(tx,row.id);
}

async function schoolDay(tx: Transaction) {
  const [now] = await tx<{ day: string | null }[]>`select app.school_today()::text as day`;
  if (!now.day) throw new ApiError("validation", { from: "error.validation" });
  return now.day;
}

export function createAssignment(ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof assignmentInput>) {
  return commitCommand(ctx, "school.assignment.create", key, hashCommand({ id,...input }), {
    authorize: async (tx) => { await editor(ctx,tx); await classRecord(tx,id); await profile(tx,input.staffId); },
    mutate: async (tx) => {
      await tx`select app.lock_school_calendar(), app.lock_classes(${id})`;
      let offeringId: string | null = null;
      if (input.subjectId) {
        const [offering] = await tx<{ id: string }[]>`insert into app.class_subject(class_id,subject_id)
          values (${id},${input.subjectId}) on conflict(class_id,subject_id) do update set subject_id=excluded.subject_id returning id`;
        offeringId = offering.id;
      }
      const created = await insertAssignment(tx,id,offeringId,input);
      await appendAudit(tx,{ action:"school.assignment_created", aggregateId:created.id });
      return created;
    },
  });
}

export function changeAssignment(ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof assignmentChangeInput>) {
  return commitCommand(ctx,"school.assignment.change",key,hashCommand({ id,...input }),{
    authorize: async (tx) => { await editor(ctx,tx); await assignment(tx,id); if(input.replacement) await profile(tx,input.replacement.staffId); },
    mutate: async (tx) => {
      await tx`select app.lock_school_calendar()`;
      const before = await assignment(tx,id);
      await tx`select app.lock_classes(${before.classId})`;
      requireRevision(before.revision,input.revision);
      if (before.revoked) throw new ApiError("conflict");
      let end = input.untilExclusive ?? before.untilExclusive;
      const today = await schoolDay(tx);
      if (input.replacement || input.revoke) {
        const cutoff = input.replacement?.from ?? today;
        if (cutoff < today || input.replacement && (cutoff < before.from || cutoff >= before.untilExclusive || end <= cutoff)) {
          throw new ApiError("validation",{ from:"error.validation" });
        }
        if (cutoff <= before.from) {
          await tx`update app.substitute_assignment set revoked_at=now(),revision=revision+1 where assignment_id=${id} and revoked_at is null`;
          await tx`update app.teaching_assignment set revoked_at=now(),revision=revision+1 where id=${id}`;
        } else {
          await tx`update app.substitute_assignment set revoked_at=now(),revision=revision+1
            where assignment_id=${id} and effective_until > ${cutoff}::date and revoked_at is null`;
          await tx`update app.teaching_assignment set effective_until=least(effective_until,${cutoff}::date),
            revision=revision+1 where id=${id}`;
        }
      } else {
        if (end <= before.from || end < today) throw new ApiError("validation",{ untilExclusive:"error.validation" });
        await tx`update app.teaching_assignment set effective_until=${end}::date,revision=revision+1 where id=${id}`;
      }
      const changed = await assignment(tx,id);
      const replacement = input.replacement ? await insertAssignment(tx,before.classId,before.offeringId,{
        ...input.replacement,kind:before.kind,untilExclusive:end,
      }) : null;
      await appendAudit(tx,{ action:"school.assignment_changed", aggregateId:id, metadata:{ revision:changed.revision,replacementId:replacement?.id ?? null } });
      await appendEvent(tx,{ type:"school.assignment_changed", aggregateId:id, actorId:ctx.accountId,
        payload:{ classId:before.classId,revision:changed.revision,replacementId:replacement?.id ?? null } });
      return { assignment:changed,replacement };
    },
  });
}

export function addSubstitute(ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof substituteInput>) {
  return commitCommand(ctx,"school.assignment.substitute",key,hashCommand({ id,...input }),{
    authorize: async (tx) => { await editor(ctx,tx); await assignment(tx,id); await profile(tx,input.staffId); },
    mutate: async (tx) => {
      await tx`select app.lock_school_calendar()`;
      const current = await assignment(tx,id);
      requireRevision(current.revision,input.revision);
      if (input.from < await schoolDay(tx)) throw new ApiError("validation",{ from:"error.validation" });
      const [created] = await tx<{ id: string }[]>`insert into app.substitute_assignment
        (assignment_id,staff_id,effective_from,effective_until,capabilities)
        values (${id},${input.staffId},${input.from}::date,${input.untilExclusive}::date,${tx.array(input.capabilities)}::text[]) returning id`;
      await tx`update app.teaching_assignment set revision=revision+1 where id=${id}`;
      const delegate = (await delegates(tx,[id])).find((row) => row.id===created.id);
      if (!delegate) throw new ApiError("internal");
      await appendAudit(tx,{ action:"school.substitute_assigned", aggregateId:created.id, metadata:{ assignmentId:id } });
      return delegate;
    },
  });
}
