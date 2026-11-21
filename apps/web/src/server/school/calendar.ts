import "server-only";
import type { z } from "zod";
import { dayExceptionSchema, settingsSchema, yearSchema,
  type dayInput, type settingsInput, type yearChangeInput, type yearInput } from "@madrasty/contracts";
import { ApiError } from "@/server/http";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";
import { commitCommand, hashCommand, requireRevision } from "@/server/db/commands";
import { appendAudit } from "@/server/db/outbox";
import { classOffice, classRecord } from "./enrollments";
import { requireCapability } from "@/server/access/policies";

const settingsId = "b084ff88-7242-4ff0-8cee-d0ad1e04e5f6";
const currencies = new Set(Intl.supportedValuesOf("currency"));

const permitsCalendar = (ctx: ActorContext) => (tx: Transaction) => requireCapability(tx, ctx, "school.manage");

async function selectSettings(tx: Transaction) {
  return (await tx`
    select timezone, name_ar as "nameAr", name_de as "nameDe", currency, due_day as "dueDay", revision::integer
    from app.school_settings where singleton
  `)[0];
}

export function readSettings(ctx: ActorContext) {
  return withActor(ctx, async (tx) => {
    await permitsCalendar(ctx)(tx);
    const settings = await selectSettings(tx);
    return settings ? settingsSchema.parse(settings) : null;
  });
}

export function writeSettings(ctx: ActorContext, key: string | null, input: z.infer<typeof settingsInput>) {
  return commitCommand(ctx, "school.settings.replace", key, hashCommand(input), {
    authorize: permitsCalendar(ctx),
    mutate: async (tx) => {
      if (!currencies.has(input.currency)) throw new ApiError("validation", { currency: "error.validation" });
      const [zone] = await tx`select name from pg_timezone_names where name = ${input.timezone}`;
      if (!zone) throw new ApiError("validation", { timezone: "error.validation" });
      await tx`select app.lock_school_calendar()`;
      const current = await selectSettings(tx);
      requireRevision(current?.revision ?? 0, input.revision);
      await tx`
        insert into app.school_settings as s (timezone, name_ar, name_de, currency, due_day)
        values (${input.timezone}, ${input.nameAr}, ${input.nameDe}, ${input.currency}, ${input.dueDay})
        on conflict (singleton) do update set timezone = excluded.timezone, name_ar = excluded.name_ar,
          name_de = excluded.name_de, currency = excluded.currency, due_day = excluded.due_day, revision = s.revision + 1
      `;
      const saved = settingsSchema.parse(await selectSettings(tx));
      await appendAudit(tx, { action: "school.settings_updated", aggregateId: settingsId, metadata: { revision: saved.revision } });
      return saved;
    },
  });
}

async function selectYear(tx: Transaction, id: string) {
  const [row] = await tx`
    select id, starts_on::text as "startsOn", ends_exclusive::text as "endsExclusive",
      teaching_weekdays as "teachingWeekdays", state, revision::integer
    from app.school_year where id = ${id}
  `;
  if (!row) throw new ApiError("not_found");
  return yearSchema.parse(row);
}

export function readYears(ctx: ActorContext) {
  return withActor(ctx, async (tx) => {
    await classOffice(tx, ctx);
    const rows = await tx`
      select id, starts_on::text as "startsOn", ends_exclusive::text as "endsExclusive",
        teaching_weekdays as "teachingWeekdays", state, revision::integer
      from app.school_year order by starts_on desc, id
    `;
    return yearSchema.array().parse(rows);
  });
}

export function createYear(ctx: ActorContext, key: string | null, input: z.infer<typeof yearInput>) {
  return commitCommand(ctx, "school.year.create", key, hashCommand(input), {
    authorize: permitsCalendar(ctx),
    mutate: async (tx) => {
      if (input.state === "closed") throw new ApiError("validation", { state: "error.validation" });
      await tx`select app.lock_school_calendar()`;
      const [row] = await tx<{ id: string }[]>`
        insert into app.school_year (starts_on, ends_exclusive, teaching_weekdays, state)
        values (${input.startsOn}::date, ${input.endsExclusive}::date,
          ${tx.array([...input.teachingWeekdays].sort())}::smallint[], ${input.state})
        returning id
      `;
      await appendAudit(tx, { action: "school.year_created", aggregateId: row.id });
      return selectYear(tx, row.id);
    },
  });
}

export function changeYear(ctx: ActorContext, id: string, key: string | null, input: z.infer<typeof yearChangeInput>) {
  return commitCommand(ctx, "school.year.change", key, hashCommand({ id, ...input }), {
    authorize: async (tx) => { await permitsCalendar(ctx)(tx); await selectYear(tx, id); },
    mutate: async (tx) => {
      await tx`select app.lock_school_calendar()`;
      const current = await selectYear(tx, id);
      requireRevision(current.revision, input.revision);
      await tx`
        update app.school_year set starts_on = ${input.startsOn}::date, ends_exclusive = ${input.endsExclusive}::date,
          teaching_weekdays = ${tx.array([...input.teachingWeekdays].sort())}::smallint[], state = ${input.state},
          revision = revision + 1 where id = ${id}
      `;
      await appendAudit(tx, { action: "school.year_changed", aggregateId: id, metadata: { revision: current.revision + 1 } });
      return selectYear(tx, id);
    },
  });
}

export function readDays(ctx: ActorContext, yearId: string) {
  return withActor(ctx, async (tx) => {
    await permitsCalendar(ctx)(tx);
    await selectYear(tx, yearId);
    const rows = await tx`
      select id, year_id as "yearId", class_id as "classId", school_date::text as "schoolDate", teaching, reason, revision::integer
      from app.day_exception where year_id = ${yearId} order by school_date, id
    `;
    return dayExceptionSchema.array().parse(rows);
  });
}

export function putDay(ctx: ActorContext, yearId: string, date: string, key: string | null, input: z.infer<typeof dayInput>) {
  return commitCommand(ctx, "school.day.put", key, hashCommand({ ...input, date, yearId }), {
    authorize: async (tx) => { await permitsCalendar(ctx)(tx); await selectYear(tx, yearId); },
    mutate: async (tx) => {
      if (input.classId && (await classRecord(tx, input.classId)).yearId !== yearId) throw new ApiError("validation", { classId: "error.validation" });
      await tx`select app.lock_school_calendar()`;
      const [current] = await tx<{ revision: number }[]>`
        select revision::integer from app.day_exception
        where year_id = ${yearId} and school_date = ${date}::date and class_id is not distinct from ${input.classId ?? null}::uuid
      `;
      requireRevision(current?.revision ?? 0, input.revision);
      const [saved] = await tx`
        insert into app.day_exception as day (year_id, class_id, school_date, teaching, reason)
        values (${yearId}, ${input.classId ?? null}, ${date}::date, ${input.teaching}, ${input.reason})
        on conflict on constraint day_exception_scope do update
        set teaching = excluded.teaching, reason = excluded.reason, revision = day.revision + 1
        returning id, year_id as "yearId", class_id as "classId", school_date::text as "schoolDate",
          teaching, reason, revision::integer
      `;
      const day = dayExceptionSchema.parse(saved);
      await appendAudit(tx, { action: "school.day_changed", aggregateId: day.id, metadata: { revision: day.revision } });
      return day;
    },
  });
}
