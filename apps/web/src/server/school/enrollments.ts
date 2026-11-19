import "server-only";
import {
  schoolClassSchema, enrollmentSchema, rosterRowSchema,
  type classInput, type classChangeInput, type classListing,
  type enrollmentMoveInput, type placeStudentsInput,
} from "@madrasty/contracts";
import type { z } from "zod";
import { ApiError } from "@/server/http";
import { requireCapability } from "@/server/access/policies";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";
import { commitCommand, hashCommand, requireRevision } from "@/server/db/commands";
import { appendAudit, appendEvent } from "@/server/db/outbox";

const manageClass = (ctx: ActorContext) => (tx: Transaction) => requireCapability(tx, ctx, "school.manage");
const manageEnrollment = (ctx: ActorContext) => (tx: Transaction) => requireCapability(tx, ctx, "students.manage");

export async function classOffice(tx: Transaction, actor: ActorContext) {
  if (actor.persona !== "admin") throw new ApiError("forbidden");
  const [access] = await tx<{ allowed: boolean }[]>`
    select app.has_capability('school.manage') or app.has_capability('students.manage') as allowed
  `;
  if (!access.allowed) throw new ApiError("forbidden");
}

const classFields = (tx: Transaction) => tx`
  id, year_id as "yearId", code, name_ar as "nameAr", name_de as "nameDe", capacity, revision
`;

export async function classRecord(tx: Transaction, id: string) {
  const [row] = await tx`select ${classFields(tx)} from app.school_class where id = ${id}`;
  if (!row) throw new ApiError("not_found");
  return schoolClassSchema.parse(row);
}

export async function yearRecord(tx: Transaction, id: string) {
  const [row] = await tx<{ starts: string; ends: string; state: string; revision: number }[]>`
    select starts_on::text as starts, ends_exclusive::text as ends, state, revision::integer
    from app.school_year where id = ${id}
  `;
  if (!row) throw new ApiError("not_found");
  return row;
}

const enrollmentFields = (tx: Transaction) => tx`
  e.id, e.class_id as "classId", e.student_id as "studentId", e.year_id as "yearId",
  e.effective_from::text as "effectiveFrom", e.effective_until::text as "effectiveUntil",
  e.ending_reason as "endingReason", e.voided_at is not null as voided, e.revision
`;

async function enrollmentRecord(tx: Transaction, id: string) {
  const [row] = await tx`select ${enrollmentFields(tx)} from app.enrollment e where e.id = ${id}`;
  if (!row) throw new ApiError("not_found");
  return enrollmentSchema.parse(row);
}

export function listClasses(ctx: ActorContext, query: z.infer<typeof classListing>) {
  return withActor(ctx, async (tx) => {
    await classOffice(tx, ctx);
    const rows = schoolClassSchema.array().parse(await tx`
      select ${classFields(tx)} from app.school_class
      where (${query.yearId ?? null}::uuid is null or year_id = ${query.yearId ?? null}::uuid)
        and (${query.cursor ?? null}::uuid is null or id > ${query.cursor ?? null}::uuid)
      order by id limit ${query.limit + 1}
    `);
    return { rows: rows.slice(0, query.limit), nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : undefined };
  });
}

export function readClass(ctx: ActorContext, id: string) {
  return withActor(ctx, async (tx) => {
    await classOffice(tx, ctx);
    return classRecord(tx, id);
  });
}

export function createClass(ctx: ActorContext, key: string | null, input: z.infer<typeof classInput>) {
  return commitCommand(ctx, "school.class.create", key, hashCommand(input), {
    authorize: async (tx) => { await manageClass(ctx)(tx); await yearRecord(tx, input.yearId); },
    mutate: async (tx) => {
      await tx`select app.lock_school_calendar()`;
      if ((await yearRecord(tx, input.yearId)).state === "closed") throw new ApiError("conflict");
      const [row] = await tx<{ id: string }[]>`
        insert into app.school_class (year_id, code, name_ar, name_de, capacity)
        values (${input.yearId}, ${input.code}, ${input.nameAr}, ${input.nameDe}, ${input.capacity}) returning id
      `;
      await appendAudit(tx, { action: "school.class_created", aggregateId: row.id });
      return classRecord(tx, row.id);
    },
  });
}

export function changeClass(ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof classChangeInput>) {
  return commitCommand(ctx, "school.class.change", key, hashCommand({ id, ...input }), {
    authorize: async (tx) => { await manageClass(ctx)(tx); await classRecord(tx, id); },
    mutate: async (tx) => {
      await tx`select app.lock_school_calendar(), app.lock_classes(${id})`;
      const schoolClass = await classRecord(tx, id);
      if ((await yearRecord(tx, schoolClass.yearId)).state === "closed") throw new ApiError("conflict");
      requireRevision(schoolClass.revision, input.revision);
      await tx`
        update app.school_class set name_ar = ${input.nameAr}, name_de = ${input.nameDe},
          capacity = ${input.capacity}, revision = revision + 1 where id = ${id}
      `;
      await appendAudit(tx, { action: "school.class_changed", aggregateId: id, metadata: { revision: input.revision + 1 } });
      return classRecord(tx, id);
    },
  });
}

export function readRoster(ctx: ActorContext, id: string, date: string, limit: number, cursor?: string) {
  return withActor(ctx, async (tx) => {
    await manageEnrollment(ctx)(tx);
    const schoolClass = await classRecord(tx, id);
    const [status] = await tx<{ teaching: boolean }[]>`select app.is_teaching_day(${id}, ${date}::date) as teaching`;
    const records = await tx`
      select s.display_name as "displayName", s.student_number as "studentNumber", p.enrollment
      from app.roster_on(${id}, ${date}::date) r
      join app.student s on s.id = r.student_id
      join lateral (
        select row_to_json(d) as enrollment from (
          select ${enrollmentFields(tx)} from app.enrollment e where e.id = r.enrollment_id
        ) d
      ) p on true
      where (${cursor ?? null}::uuid is null or r.student_id > ${cursor ?? null}::uuid)
      order by r.student_id limit ${limit + 1}
    `;
    const rows = rosterRowSchema.array().parse(records);
    return { data: { schoolClass, date, teachingDay: status.teaching, rows: rows.slice(0, limit) },
      nextCursor: rows.length > limit ? rows[limit - 1].enrollment.studentId : undefined };
  });
}

export async function insertEnrollment(
  tx: Transaction, studentId: string, classId: string, yearId: string, starts: string, ends: string,
) {
  const [inserted] = await tx<{ id: string }[]>`
    insert into app.enrollment (student_id, class_id, year_id, effective_from, effective_until)
    values (${studentId}, ${classId}, ${yearId}, ${starts}::date, ${ends}::date) returning id
  `;
  return enrollmentRecord(tx, inserted.id);
}

export function placeStudents(ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof placeStudentsInput>) {
  return commitCommand(ctx, "school.enrollment.place", key, hashCommand({ id, ...input }), {
    authorize: async (tx) => {
      await manageEnrollment(ctx)(tx);
      await classRecord(tx, id);
      const allowed = await tx`select id from app.student where id = any(${tx.array(input.studentIds)}::uuid[])`;
      if (allowed.length !== input.studentIds.length) throw new ApiError("not_found");
    },
    mutate: async (tx) => {
      await tx`select app.lock_school_calendar(), app.lock_classes(${id})`;
      const schoolClass = await classRecord(tx, id);
      const year = await yearRecord(tx, schoolClass.yearId);
      requireRevision(schoolClass.revision, input.revision);
      if (input.from < year.starts || input.from >= year.ends || year.state === "closed") {
        throw new ApiError("validation", { from: "error.validation" });
      }
      const active = await tx`select id from app.student
        where id = any(${tx.array(input.studentIds)}::uuid[]) and state = 'active' order by id for share`;
      if (active.length !== input.studentIds.length) throw new ApiError("conflict");
      const changes = [];
      for (const student of active) changes.push(await insertEnrollment(tx, student.id, id, schoolClass.yearId, input.from, year.ends));
      await appendAudit(tx, { action: "school.enrollment_placed", aggregateId: id, metadata: { count: changes.length } });
      return { schoolClass, enrollments: changes };
    },
  });
}

export function moveEnrollment(
  ctx: ActorContext, id: string, action: "transfer" | "withdraw", key: string | null, input: z.infer<typeof enrollmentMoveInput>,
) {
  return commitCommand(ctx, `school.enrollment.${action}`, key, hashCommand({ id, ...input }), {
    authorize: async (tx) => {
      await manageEnrollment(ctx)(tx);
      await enrollmentRecord(tx, id);
      if (input.toClassId) await classRecord(tx, input.toClassId);
    },
    mutate: async (tx) => {
      await tx`select app.lock_school_calendar()`;
      const before = await enrollmentRecord(tx, id);
      requireRevision(before.revision, input.revision);
      if (before.voided || input.effectiveDate < before.effectiveFrom || input.effectiveDate >= before.effectiveUntil) {
        throw new ApiError("validation", { effectiveDate: "error.validation" });
      }
      const to = input.toClassId ? await classRecord(tx, input.toClassId) : null;
      if (action === "transfer" ? !to || to.id === before.classId || to.yearId !== before.yearId : Boolean(to)) {
        throw new ApiError("validation", { toClassId: "error.validation" });
      }
      await tx`select app.lock_classes(${before.classId}, ${to?.id ?? null})`;
      const start = input.effectiveDate === before.effectiveFrom;
      await tx`
        update app.enrollment set effective_until = case when ${start} then effective_until else ${input.effectiveDate}::date end,
          voided_at = case when ${start} then now() else null end,
          ending_reason = ${input.reason}, revision = revision + 1
        where id = ${id}
      `;
      const ended = await enrollmentRecord(tx, id);
      const next = to ? await insertEnrollment(tx, before.studentId, to.id, before.yearId, input.effectiveDate, before.effectiveUntil) : null;
      const event = action === "transfer" ? "school.enrollment_transferred" : "school.enrollment_withdrawn";
      await appendAudit(tx, { action: event, aggregateId: id,
        metadata: { date: input.effectiveDate, fromClassId: before.classId, toClassId: to?.id ?? null, revision: ended.revision } });
      await appendEvent(tx, { type: event, aggregateId: id, actorId: ctx.accountId,
        payload: { date: input.effectiveDate, studentId: before.studentId, revisedEnrollmentId: next?.id ?? null } });
      return { ended, next };
    },
  });
}

export function readEnrollmentHistory(ctx: ActorContext, studentId: string) {
  return withActor(ctx, async (tx) => {
    await manageEnrollment(ctx)(tx);
    if (!(await tx`select id from app.student where id = ${studentId}`)[0]) throw new ApiError("not_found");
    const rows = await tx`select ${enrollmentFields(tx)} from app.enrollment e
      where e.student_id = ${studentId} order by e.effective_from desc, e.id`;
    return enrollmentSchema.array().parse(rows);
  });
}
