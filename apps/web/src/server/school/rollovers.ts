import "server-only";
import { rolloverInput, rolloverPreviewSchema, rolloverRowSchema, type SchoolClass } from "@madrasty/contracts";
import type { z } from "zod";
import { ApiError } from "@/server/http";
import { requireCapability } from "@/server/access/policies";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";
import { commitCommand, hashCommand, requireRevision } from "@/server/db/commands";
import { appendAudit, appendEvent } from "@/server/db/outbox";
import { classRecord, insertEnrollment, yearRecord } from "./enrollments";

type Configuration = z.infer<typeof rolloverInput>;
type Entry = z.infer<typeof rolloverRowSchema>;

async function produceSnapshot(tx: Transaction, sourceId: string, input: Configuration) {
  const source = await yearRecord(tx, sourceId);
  const target = await yearRecord(tx, input.targetYearId);
  if (source.state === "closed" || target.state === "closed" || target.starts < source.ends) {
    throw new ApiError("validation", { targetYearId: "error.validation" });
  }
  const classMap = new Map(input.classMap.map((row) => [row.fromClassId, row.toClassId]));
  const exceptions = new Map(input.exceptions.map((item) => [item.studentId, item]));
  const targets = new Map<string, SchoolClass>();
  for (const [from, to] of classMap) {
    if ((await classRecord(tx, from)).yearId !== sourceId) throw new ApiError("validation");
    if (!targets.has(to)) targets.set(to, await classRecord(tx, to));
  }
  for (const exception of input.exceptions) {
    if (exception.toClassId && !targets.has(exception.toClassId)) {
      targets.set(exception.toClassId, await classRecord(tx, exception.toClassId));
    }
  }
  for (const item of targets.values()) {
    if (item.yearId !== input.targetYearId) throw new ApiError("validation", { classMap: "error.validation" });
  }
  const people = await tx<{
    studentId: string; displayName: string; active: boolean;
    enrollmentId: string; enrollmentRevision: number; classId: string; already: boolean;
  }[]>`
    select s.id as "studentId", s.display_name as "displayName", (s.state = 'active') as active,
      e.id as "enrollmentId", e.revision as "enrollmentRevision", e.class_id as "classId",
      exists (select 1 from app.enrollment t where t.student_id = e.student_id and
        t.year_id = ${input.targetYearId} and t.voided_at is null) as already
    from app.enrollment e join app.student s on s.id = e.student_id
    where e.year_id = ${sourceId} and e.voided_at is null and e.effective_until = ${source.ends}::date
      and e.effective_from < ${source.ends}::date
    order by s.id
  `;
  if (input.exceptions.some(({ studentId }) => !people.some((student) => student.studentId === studentId))) {
    throw new ApiError("validation", { exceptions: "error.validation" });
  }
  const rows: Entry[] = people.map(({ active, already, ...person }) => {
    const override = exceptions.get(person.studentId);
    const action = override?.action ?? "place";
    const targetClassId = action === "skip" || action === "withdraw" ? null
      : override?.toClassId ?? classMap.get(person.classId) ?? null;
    const conflict = action === "skip" || action === "withdraw" ? null : already ? "already_enrolled"
      : !active ? "student_inactive" : !targetClassId ? "target_missing" : null;
    return { ...person, action, conflict, targetClassId,
      targetClassRevision: targetClassId ? targets.get(targetClassId)!.revision : null };
  });

  for (const item of targets.values()) {
    if (item.capacity === null) continue;
    const assigned = rows.filter((row) => row.targetClassId === item.id && row.conflict === null);
    if (assigned.length === 0) continue;
    const [maximum] = await tx<{ maximum: number }[]>`
      select coalesce(max(t.seats), 0)::integer as maximum from (
        select (select count(*) from app.enrollment e where e.class_id = ${item.id} and e.voided_at is null
          and e.effective_from <= d.day and e.effective_until > d.day) as seats
        from (
          select ${target.starts}::date as day
          union select effective_from from app.enrollment where class_id = ${item.id} and voided_at is null
        ) d
      ) t
    `;
    if (assigned.length + maximum.maximum > item.capacity) {
      for (const row of assigned) row.conflict = "class_full";
    }
  }
  return { sourceRevision: source.revision, targetRevision: target.revision,
    rows, counts: {
      changes: rows.filter((row) => row.targetClassId && !row.conflict).length,
      conflicts: rows.filter(({ conflict }) => conflict !== null).length,
      noPlacement: rows.filter(({ action }) => action === "skip" || action === "withdraw").length,
    },
  };
}

async function readPlan(tx: Transaction, id: string) {
  const [row] = await tx<{
    id: string; revision: number; sourceYearId: string; targetYearId: string;
    configuration: unknown; snapshot: { rows: Entry[]; counts: { changes: number; conflicts: number; noPlacement: number } };
    confirmed: boolean;
  }[]>`select id, revision, source_year_id as "sourceYearId", target_year_id as "targetYearId",
    configuration, snapshot, confirmed_at is not null as confirmed from app.year_rollover where id = ${id}`;
  if (!row) throw new ApiError("not_found");
  return row;
}

async function view(tx: Transaction, id: string) {
  const row = await readPlan(tx, id);
  return rolloverPreviewSchema.parse({ ...row, rows: row.snapshot.rows, counts: row.snapshot.counts });
}

export function previewRollover(ctx: ActorContext, id: string, key: string | null, input: Configuration) {
  return commitCommand(ctx, "school.rollover.preview", key, hashCommand({ id, ...input }), {
    authorize: async (tx) => { await requireCapability(tx, ctx, "students.manage"); await yearRecord(tx, id); },
    mutate: async (tx) => {
      await tx`select app.lock_school_calendar()`;
      const snapshot = await produceSnapshot(tx, id, input);
      const [row] = await tx<{ id: string }[]>`
        insert into app.year_rollover(created_by, source_year_id, target_year_id, configuration, snapshot)
        values (${ctx.accountId}, ${id}, ${input.targetYearId}, ${tx.json(input)}, ${tx.json(snapshot)})
        returning id
      `;
      return view(tx, row.id);
    },
  });
}

export function readRollover(ctx: ActorContext, id: string) {
  return withActor(ctx, async (tx) => {
    await requireCapability(tx, ctx, "students.manage");
    return view(tx, id);
  });
}

export function confirmRollover(ctx: ActorContext, id: string, key: string | null, revision: number) {
  return commitCommand(ctx, "school.rollover.confirm", key, hashCommand({ id, revision }), {
    authorize: async (tx) => {
      await requireCapability(tx, ctx, "school.manage");
      await requireCapability(tx, ctx, "students.manage");
      await readPlan(tx, id);
    },
    mutate: async (tx) => {
      await tx`select app.lock_school_calendar()`;
      const plan = await readPlan(tx, id);
      requireRevision(plan.revision, revision);
      if (plan.confirmed || plan.snapshot.counts.conflicts > 0) throw new ApiError("conflict");
      const input = rolloverInput.parse(plan.configuration);
      const current = await produceSnapshot(tx, plan.sourceYearId, input);
      if (hashCommand(current) !== hashCommand(plan.snapshot)) throw new ApiError("stale_revision");
      const target = await yearRecord(tx, plan.targetYearId);

      for (const row of current.rows) {
        if (!row.targetClassId) continue;
        await insertEnrollment(tx, row.studentId, row.targetClassId, plan.targetYearId, target.starts, target.ends);
      }
      await tx`update app.school_year set state = 'closed', revision = revision + 1 where id = ${plan.sourceYearId}`;
      await tx`update app.year_rollover set revision = revision + 1, confirmed_at = now() where id = ${id}`;
      await appendAudit(tx, { action: "school.year_rolled_over", aggregateId: id,
        metadata: { sourceYearId: plan.sourceYearId, targetYearId: plan.targetYearId, count: current.counts.changes } });
      await appendEvent(tx, { type: "school.year_rolled_over", aggregateId: id, actorId: ctx.accountId,
        payload: { sourceYearId: plan.sourceYearId, targetYearId: plan.targetYearId } });
      return view(tx, id);
    },
  });
}
