import "server-only";
import {
  childLinkSchema, childSummarySchema, guardianDetailSchema, guardianSchema, studentSchema,
  createFamilyInput, createFamilyChildInput, createdFamilySchema,
  type createGuardianInput, type createLinkInput, type createStudentInput, type changeLinkInput,
  type updateGuardianInput, type updateStudentInput, type familyQuerySchema,
} from "@madrasty/contracts";
import type { z } from "zod";
import { requireCapability } from "@/server/access/policies";
import { commitCommand, hashCommand, requireRevision } from "@/server/db/commands";
import { appendAudit, appendEvent } from "@/server/db/outbox";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";
import { classRecord, yearRecord, insertEnrollment } from "./enrollments";

type Query = z.infer<typeof familyQuerySchema>;
const office = (ctx: ActorContext) => (tx: Transaction) => requireCapability(tx, ctx, "students.manage");
const accessError = () => new ApiError("not_found");

async function student(tx: Transaction, id: string, lock = false) {
  const [row] = await tx`
    select id, student_number as "studentNumber", display_name as "displayName", state, revision
    from app.student where id = ${id} ${lock ? tx`for update` : tx``}
  `;
  if (!row) throw accessError();
  return studentSchema.parse(row);
}

async function guardian(tx: Transaction, id: string, lock = false) {
  const [row] = await tx`
    select id, display_name as "displayName", contact_email as "contactEmail", contact_phone as "contactPhone",
      correspondence_locale as "correspondenceLocale", account_id is not null as "linkedAccount", revision
    from app.guardian_profile where id = ${id} ${lock ? tx`for update` : tx``}
  `;
  if (!row) throw accessError();
  return guardianSchema.parse(row);
}

async function link(tx: Transaction, id: string, lock = false) {
  const [row] = await tx`
    select l.id, l.guardian_id as "guardianId", l.student_id as "studentId", l.state, l.reason, l.revision,
      s.display_name as "studentName", s.student_number as "studentNumber"
    from app.child_link l join app.student s on s.id = l.student_id where l.id = ${id}
    ${lock ? tx`for update of l` : tx``}
  `;
  if (!row) throw accessError();
  return childLinkSchema.parse(row);
}

function slice<T extends { id: string }>(rows: T[], limit: number) {
  return { rows: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : undefined };
}

export function listStudents(ctx: ActorContext, query: Query) {
  return withActor(ctx, async (tx) => {
    await office(ctx)(tx);
    const term = (query.query ?? "").toLowerCase();
    const rows = await tx`
      select id, student_number as "studentNumber", display_name as "displayName", state, revision
      from app.student where (${query.cursor ?? null}::uuid is null or id > ${query.cursor ?? null}::uuid)
        and (${term} = '' or strpos(lower(display_name), ${term}) > 0 or strpos(lower(student_number), ${term}) > 0)
      order by id limit ${query.limit + 1}
    `;
    return slice(studentSchema.array().parse(rows), query.limit);
  });
}

export function readStudent(ctx: ActorContext, id: string) {
  return withActor(ctx, async (tx) => {
    await office(ctx)(tx);
    const record=await student(tx,id);
    const [profile]=await tx<{birthDate:string|null}[]>`select birth_date::text as "birthDate" from app.student where id=${id}`;
    return studentSchema.parse({...record,...profile});
  });
}

export function createStudent(ctx: ActorContext, key: string | null, input: z.infer<typeof createStudentInput>) {
  return commitCommand(ctx, "school.student.create", key, hashCommand(input), {
    authorize: office(ctx),
    mutate: async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into app.student (display_name, source_namespace, external_key)
        values (${input.displayName}, ${input.source?.namespace ?? null}, ${input.source?.key ?? null}) returning id
      `;
      await appendAudit(tx, { action: "school.student_created", aggregateId: row.id });
      return student(tx, row.id);
    },
  });
}

export function updateStudent(ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof updateStudentInput>) {
  return commitCommand(ctx, "school.student.update", key, hashCommand({ id, ...input }), {
    authorize: async (tx) => { await office(ctx)(tx); await student(tx, id); },
    mutate: async (tx) => {
      const current = await student(tx, id, true);
      requireRevision(current.revision, input.revision);
      await tx`
        update app.student set display_name = ${input.displayName}, state = ${input.state},
          revision = revision + 1 where id = ${id}
      `;
      await appendAudit(tx, { action: "school.student_updated", aggregateId: id, metadata: { revision: current.revision + 1 } });
      return student(tx, id);
    },
  });
}

export function listGuardians(ctx: ActorContext, query: Query) {
  return withActor(ctx, async (tx) => {
    await office(ctx)(tx);
    const term = (query.query ?? "").toLowerCase();
    const rows = await tx`
      select id, display_name as "displayName", contact_email as "contactEmail", contact_phone as "contactPhone",
        correspondence_locale as "correspondenceLocale", account_id is not null as "linkedAccount", revision
      from app.guardian_profile where (${query.cursor ?? null}::uuid is null or id > ${query.cursor ?? null}::uuid)
        and (${term} = '' or strpos(lower(display_name), ${term}) > 0)
      order by id limit ${query.limit + 1}
    `;
    return slice(guardianSchema.array().parse(rows), query.limit);
  });
}

export function readGuardian(ctx: ActorContext, id: string) {
  return withActor(ctx, async (tx) => {
    await office(ctx)(tx);
    const adult = await guardian(tx, id);
    const rows = await tx`
      select l.id, l.guardian_id as "guardianId", l.student_id as "studentId", l.state, l.reason, l.revision,
        s.display_name as "studentName", s.student_number as "studentNumber"
      from app.child_link l join app.student s on s.id = l.student_id
      where l.guardian_id = ${id} order by l.created_at desc, l.id
    `;
    const [profile]=await tx<{birthDate:string|null;emergencyAddress:string|null}[]>`select birth_date::text as "birthDate",emergency_address as "emergencyAddress" from app.guardian_profile where id=${id}`;
    return guardianDetailSchema.parse({ ...adult, ...profile, links: rows });
  });
}

export function createGuardian(ctx: ActorContext, key: string | null, input: z.infer<typeof createGuardianInput>) {
  return commitCommand(ctx, "school.guardian.create", key, hashCommand(input), {
    authorize: office(ctx),
    mutate: async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into app.guardian_profile (display_name, contact_email, contact_phone, correspondence_locale, source_namespace, external_key)
        values (${input.displayName}, ${input.contactEmail}, ${input.contactPhone}, ${input.correspondenceLocale},
          ${input.source?.namespace ?? null}, ${input.source?.key ?? null}) returning id
      `;
      await appendAudit(tx, { action: "school.guardian_created", aggregateId: row.id });
      return guardian(tx, row.id);
    },
  });
}

export function updateGuardian(ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof updateGuardianInput>) {
  return commitCommand(ctx, "school.guardian.update", key, hashCommand({ id, ...input }), {
    authorize: async (tx) => { await office(ctx)(tx); await guardian(tx, id); },
    mutate: async (tx) => {
      const current = await guardian(tx, id, true);
      requireRevision(current.revision, input.revision);
      if (current.linkedAccount && current.contactEmail !== input.contactEmail) {
        throw new ApiError("validation", { contactEmail: "error.validation" });
      }
      await tx`
        update app.guardian_profile set display_name = ${input.displayName}, contact_email = ${input.contactEmail},
          contact_phone = ${input.contactPhone}, correspondence_locale = ${input.correspondenceLocale},
          revision = revision + 1 where id = ${id}
      `;
      await appendAudit(tx, { action: "school.guardian_updated", aggregateId: id, metadata: { revision: current.revision + 1 } });
      return guardian(tx, id);
    },
  });
}

async function publishLinkEvent(tx: Transaction, ctx: ActorContext, id: string) {
  const saved = await link(tx, id);
  await appendAudit(tx, { action: `family.link_${saved.state}`, aggregateId: id, metadata: { revision: saved.revision } });
  const adult = await guardian(tx, saved.guardianId);
  if (saved.state === "revoked" || (saved.state === "approved" && adult.linkedAccount)) {
    await appendEvent(tx, { type: `family.link_${saved.state}`, actorId: ctx.accountId, aggregateId: id,
      payload: { revision: saved.revision, studentId: saved.studentId, guardianId: saved.guardianId } });
  }
  return saved;
}

export function createLink(ctx: ActorContext, key: string | null, input: z.infer<typeof createLinkInput>) {
  return commitCommand(ctx, "school.guardian_link.create", key, hashCommand(input), {
    authorize: async (tx) => {
      await office(ctx)(tx);
      await guardian(tx, input.guardianId);
      await student(tx, input.studentId);
    },
    mutate: async (tx) => {
      const child = await student(tx, input.studentId, true);
      if (child.state !== "active") throw new ApiError("validation");
      const approved = input.approvalReason !== undefined;
      const [row] = await tx<{ id: string }[]>`
        insert into app.child_link (guardian_id, student_id, state, effective_from, changed_by, reason)
        values (${input.guardianId}, ${input.studentId}, ${approved ? "approved" : "pending"},
          case when ${approved} then now() else null end, ${ctx.accountId}, ${input.approvalReason ?? ""}) returning id
      `;
      return publishLinkEvent(tx, ctx, row.id);
    },
  });
}

export function changeLink(
  ctx: ActorContext, id: string, action: "approve" | "revoke", key: string | null, input: z.infer<typeof changeLinkInput>,
) {
  return commitCommand(ctx, `school.guardian_link.${action}`, key, hashCommand({ id, ...input }), {
    authorize: async (tx) => { await office(ctx)(tx); await link(tx, id); },
    mutate: async (tx) => {
      const current = await link(tx, id, true);
      requireRevision(current.revision, input.revision);
      if (current.state === "revoked" || (action === "approve" && current.state !== "pending")) throw new ApiError("conflict");
      if (action === "approve" && (await student(tx, current.studentId, true)).state !== "active") throw new ApiError("validation");
      await tx`
        update app.child_link set state = ${action === "approve" ? "approved" : "revoked"},
          effective_from = case when ${action === "approve"} then now() else effective_from end,
          effective_until = case when ${action === "revoke"} then greatest(now(), effective_from) else null end,
          changed_by = ${ctx.accountId}, reason = ${input.reason}, revision = revision + 1 where id = ${id}
      `;
      return publishLinkEvent(tx, ctx, id);
    },
  });
}

export function listChildren(ctx: ActorContext, query: Pick<Query, "cursor" | "limit">) {
  if (ctx.persona !== "guardian") throw new ApiError("forbidden");
  return withActor(ctx, async (tx) => {
    const rows = await tx`
      select id, student_number as "studentNumber", display_name as "displayName", app.child_current_class(id) as "currentClass"
      from app.student where app.has_child_link(id)
        and (${query.cursor ?? null}::uuid is null or id > ${query.cursor ?? null}::uuid)
      order by id limit ${query.limit + 1}
    `;
    return slice(childSummarySchema.array().parse(rows), query.limit);
  });
}

export function readChild(ctx: ActorContext, id: string) {
  if (ctx.persona !== "guardian") throw new ApiError("forbidden");
  return withActor(ctx, async (tx) => {
    const [row] = await tx`
      select id, student_number as "studentNumber", display_name as "displayName", app.child_current_class(id) as "currentClass"
      from app.student where id = ${id} and app.has_child_link(id)
    `;
    if (!row) throw accessError();
    return childSummarySchema.parse(row);
  });
}

/**
 * Class placement is optional per child. A selected class starts on the
 * first eligible day of its school year, or today if already in progress.
 * The existing enrollment trigger enforces capacity and non-overlap.
 */
async function placeFamilyChild(tx: Transaction, studentId: string, classId: string | null | undefined) {
  if (!classId) return;
  const classroom = await classRecord(tx, classId);
  const year = await yearRecord(tx, classroom.yearId);
  const [school] = await tx<{ today: string }[]>`select app.school_today()::text as today`;
  const from = school.today < year.starts ? year.starts : school.today;
  if (year.state === "closed" || from >= year.ends) throw new ApiError("validation", { classId: "error.validation" });
  await insertEnrollment(tx, studentId, classId, classroom.yearId, from, year.ends);
}

async function addFamilyStudent(tx: Transaction, actor: ActorContext, child: z.infer<typeof createFamilyChildInput>, guardianIds: string[]) {
  const [created] = await tx<{ id: string }[]>`
    insert into app.student(display_name) values (${child.displayName}) returning id
  `;
  for (const guardianId of guardianIds) {
    const [relation] = await tx<{ id: string }[]>`
      insert into app.child_link(guardian_id,student_id,state,effective_from,changed_by,reason)
      values (${guardianId},${created.id},'approved',now(),${actor.accountId},'School registration') returning id
    `;
    await appendAudit(tx, { action: "family.link_approved", aggregateId: relation.id });
  }
  await placeFamilyChild(tx, created.id, child.classId);
  await appendAudit(tx, { action: "school.student_created", aggregateId: created.id });
  return student(tx, created.id);
}

export function createFamily(ctx: ActorContext, key: string | null, input: z.infer<typeof createFamilyInput>) {
  return commitCommand(ctx, "school.family.create", key, hashCommand(input), {
    authorize: office(ctx),
    mutate: async (tx) => {
      // Duplicate contacts should be selected from existing family records, not cloned.
      for (const adult of input.guardians) {
        if (adult.contactEmail) {
          const existing = await tx`select id from app.guardian_profile where contact_email = ${adult.contactEmail}`;
          if (existing.length) throw new ApiError("conflict");
        }
      }
      const guardianIds: string[] = [];
      for (const adult of input.guardians) {
        const [saved] = await tx<{ id: string }[]>`
          insert into app.guardian_profile(display_name,contact_email,contact_phone,correspondence_locale)
          values (${adult.displayName},${adult.contactEmail},${adult.contactPhone},${adult.correspondenceLocale})
          returning id
        `;
        guardianIds.push(saved.id);
        await appendAudit(tx, { action: "school.guardian_created", aggregateId: saved.id });
      }
      const children = [];
      for (const child of input.children) children.push(await addFamilyStudent(tx, ctx, child, guardianIds));
      return createdFamilySchema.parse({ guardianIds, children });
    },
  });
}

export function createFamilyChild(ctx: ActorContext, guardianId: string, key: string | null, input: z.infer<typeof createFamilyChildInput>) {
  return commitCommand(ctx, "school.family.child.create", key, hashCommand({ guardianId, ...input }), {
    authorize: async (tx) => { await office(ctx)(tx); await guardian(tx, guardianId); },
    mutate: async (tx) => {
      // Do not guess co-guardian links from siblings: blended families may
      // have different adults. New links require explicit verified selection.
      return addFamilyStudent(tx, ctx, input, [guardianId]);
    },
  });
}
