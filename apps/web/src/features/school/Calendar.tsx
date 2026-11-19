"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import {
  dayExceptionSchema, daysSchema, settingsInput, settingsSchema, yearChangeInput, yearInput, yearSchema,
  type Locale, type SchoolYear, type Settings,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { formatSchoolDate } from "@/ui/RecordValues";

const copies = {
  ar: {
    title: "السنة الدراسية والتقويم", settings: "إعدادات المدرسة", ar: "اسم المدرسة بالعربية", de: "اسم المدرسة بالألمانية",
    timezone: "المنطقة الزمنية (IANA)", currency: "رمز العملة", dueDay: "يوم استحقاق الفاتورة",
    years: "السنوات الدراسية", newYear: "إضافة سنة دراسية", start: "تاريخ البداية", end: "أول يوم بعد نهاية السنة",
    weekdays: "أيام الدراسة الأسبوعية", state: "حالة السنة", draft: "مسودة", active: "نشطة", closed: "مغلقة",
    choose: "اختر سنة", exceptions: "استثناءات أيام الدراسة", date: "التاريخ", reason: "السبب",
    teaching: "يوم دراسة", closedDay: "يوم ملغى", save: "حفظ", dates: ["الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت","الأحد"],
  },
  de: {
    title: "Schuljahr und Kalender", settings: "Schuleinstellungen", ar: "Schulname auf Arabisch", de: "Schulname auf Deutsch",
    timezone: "Zeitzone (IANA)", currency: "Währungscode", dueDay: "Monatlicher Fälligkeitstag",
    years: "Schuljahre", newYear: "Schuljahr hinzufügen", start: "Erster Tag", end: "Erster Tag nach Schuljahresende",
    weekdays: "Reguläre Unterrichtstage", state: "Status", draft: "Entwurf", active: "Aktiv", closed: "Abgeschlossen",
    choose: "Jahr auswählen", exceptions: "Abweichende Unterrichtstage", date: "Datum", reason: "Grund",
    teaching: "Unterricht", closedDay: "Unterricht fällt aus", save: "Speichern", dates: ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"],
  },
} as const;

type SaveState = { pending: boolean; message: string; error: boolean };
const idle: SaveState = { pending: false, message: "", error: false };

function showError(locale: Locale, error: unknown) {
  return error instanceof ApiResponseError ? localizedError(locale, error.messageKey) : dictionary(locale)["error.unavailable"];
}

function FormNotice({ state }: { state: SaveState }) {
  return state.message ? <p role={state.error ? "alert" : "status"}>{state.message}</p> : null;
}

function useSave(locale: Locale) {
  const [state, setState] = useState<SaveState>(idle);
  async function save(action: () => Promise<void>) {
    setState({ ...idle, pending: true });
    try { await action(); setState({ ...idle, message: dictionary(locale).saved }); }
    catch (error) { setState({ ...idle, message: showError(locale, error), error: true }); }
  }
  return { state, save };
}

export function SchoolCalendar({ locale }: { locale: Locale }) {
  const text = copies[locale];
  const [data, setData] = useState<{ settings: Settings | null; years: SchoolYear[] }>();
  const [failure, setFailure] = useState<unknown>();
  const [generation, setGeneration] = useState(0);
  const [selection, setSelection] = useState<string>();

  useEffect(() => {
    const abort = new AbortController();
    Promise.all([
      requestApi("/school/settings", settingsSchema.nullable(), { signal: abort.signal }),
      requestApi("/school/years", yearSchema.array(), { signal: abort.signal }),
    ]).then(([settings, years]) => setData({ settings: settings.data, years: years.data }))
      .catch((error) => { if (!abort.signal.aborted) setFailure(error); });
    return () => abort.abort();
  }, [generation]);

  const selected = data?.years.find(({ id }) => id === selection);
  const content = data && (
    <div className="calendar-layout">
      <SettingsEditor locale={locale} initial={data.settings} />
      <section className="auth-card">
        <h2>{text.years}</h2>
        <div className="auth-form">
          <label>{text.choose}<select value={selection ?? ""} onChange={(event) => setSelection(event.target.value || undefined)}>
            <option value="">{text.newYear}</option>
            {data.years.map((year) => <option value={year.id} key={year.id}>
              {formatSchoolDate(year.startsOn, locale)} – {formatSchoolDate(year.endsExclusive, locale)} · {text[year.state]}
            </option>)}
          </select></label>
          <YearEditor key={selected?.id ?? "new"} locale={locale} initial={selected} onSaved={(saved) => {
            setData((current) => current && ({
              ...current, years: [saved, ...current.years.filter(({ id }) => id !== saved.id)],
            }));
            setSelection(saved.id);
          }} />
        </div>
      </section>
      {selected && <DaysEditor key={selected.id} locale={locale} year={selected} />}
    </div>
  );
  const forbidden = failure instanceof ApiResponseError && (failure.status === 403 || failure.status === 401);
  return <>
    <h1>{text.title}</h1>
    <AsyncSurface locale={locale} state={forbidden ? { kind: "forbidden" } : failure
      ? { kind: "error", retry: () => { setFailure(undefined); setGeneration(generation + 1); }, message: showError(locale, failure) }
      : data ? { kind: "ready", content } : { kind: "initialLoading" }} />
  </>;
}

function SettingsEditor({ locale, initial }: { locale: Locale; initial: Settings | null }) {
  const text = copies[locale];
  const command = useAdminCommand();
  const { state, save } = useSave(locale);
  const [revision, setRevision] = useState(initial?.revision ?? 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    await save(async () => {
      const values = settingsInput.safeParse({ ...fields, dueDay: Number(fields.dueDay), revision });
      if (!values.success) throw new ApiResponseError(422, "validation", "error.validation");
      const result = await command("/school/settings", "PATCH", values.data, settingsSchema);
      setRevision(result.revision);
    });
  }
  return (
    <section className="auth-card">
      <h2>{text.settings}</h2>
      <form className="auth-form" onSubmit={submit} aria-busy={state.pending}>
        <label>{text.ar}<input name="nameAr" dir="rtl" defaultValue={initial?.nameAr} required maxLength={200} /></label>
        <label>{text.de}<input name="nameDe" dir="ltr" defaultValue={initial?.nameDe} required maxLength={200} /></label>
        <label>{text.timezone}<input name="timezone" dir="ltr" defaultValue={initial?.timezone} required maxLength={128} /></label>
        <label>{text.currency}<input name="currency" dir="ltr" defaultValue={initial?.currency} required maxLength={3} pattern="[A-Z]{3}" /></label>
        <label>{text.dueDay}<input name="dueDay" type="number" min={1} max={31} defaultValue={initial?.dueDay} required /></label>
        <FormNotice state={state} />
        <button className="primary-button" disabled={state.pending}>{text.save}</button>
      </form>
    </section>
  );
}

function YearEditor({ locale, initial, onSaved }: { locale: Locale; initial?: SchoolYear; onSaved: (saved: SchoolYear) => void }) {
  const text = copies[locale];
  const { state, save } = useSave(locale);
  const command = useAdminCommand();
  const editable = initial?.state !== "closed";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = {
      startsOn: form.get("startsOn"), endsExclusive: form.get("endsExclusive"), state: form.get("state"),
      teachingWeekdays: form.getAll("weekdays").map(Number), revision: initial?.revision,
    };
    await save(async () => {
      const valid = (initial ? yearChangeInput : yearInput).safeParse(raw);
      if (!valid.success) throw new ApiResponseError(422, "validation", "error.validation");
      const result = await command(initial ? `/school/years/${initial.id}` : "/school/years",
        initial ? "PATCH" : "POST", valid.data, yearSchema);
      onSaved(result);
    });
  }

  return <form className="auth-form" onSubmit={submit} aria-busy={state.pending}>
    <label>{text.start}<input name="startsOn" type="date" defaultValue={initial?.startsOn} disabled={!editable} required /></label>
    <label>{text.end}<input name="endsExclusive" type="date" defaultValue={initial?.endsExclusive} disabled={!editable} required /></label>
    <label>{text.state}<select name="state" defaultValue={initial?.state ?? "draft"} disabled={!editable}>
      {(["draft","active","closed"] as const).filter((item) =>
        initial ? initial.state === "draft" ? item !== "closed" : item !== "draft" : item !== "closed",
      ).map((item) => <option value={item} key={item}>{text[item]}</option>)}
    </select></label>
    <fieldset disabled={!editable || state.pending}>
      <legend>{text.weekdays}</legend>
      {text.dates.map((name, index) => <label key={name} className="access-check">
        <input type="checkbox" name="weekdays" value={index + 1} defaultChecked={initial?.teachingWeekdays.includes(index + 1)} />
        {name}
      </label>)}
    </fieldset>
    {editable && <button className="primary-button" disabled={state.pending}>{text.save}</button>}
    <FormNotice state={state} />
  </form>;
}

function DaysEditor({ locale, year }: { locale: Locale; year: SchoolYear }) {
  const text = copies[locale];
  const [rows, setRows] = useState<z.infer<typeof daysSchema>>();
  const [failure, setFailure] = useState<unknown>();
  const [retry, setRetry] = useState(0);
  const [date, setDate] = useState("");
  const { state, save } = useSave(locale);
  const command = useAdminCommand();
  const current = rows?.find((day) => day.schoolDate === date && !day.classId);

  useEffect(() => {
    const abort = new AbortController();
    requestApi(`/school/years/${year.id}/days`, daysSchema, { signal: abort.signal })
      .then(({ data }) => setRows(data))
      .catch((error) => { if (!abort.signal.aborted) setFailure(error); });
    return () => abort.abort();
  }, [year.id, retry]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await save(async () => {
      const saved = await command(`/school/years/${year.id}/days/${date}`, "PUT", {
        revision: current?.revision ?? 0, teaching: form.get("teaching") === "yes", reason: form.get("reason"),
      }, dayExceptionSchema);
      setRows((previous) => [saved, ...(previous ?? []).filter(({ id }) => id !== saved.id)]
        .sort((a, b) => a.schoolDate.localeCompare(b.schoolDate)));
    });
  }

  const records: ReactNode = rows?.length ? (
    <ul className="group-list">
      {rows.map((record) => <li key={record.id}>
        <button className="group-row" onClick={() => setDate(record.schoolDate)}>
          {formatSchoolDate(record.schoolDate, locale)} · {record.teaching ? text.teaching : text.closedDay}
          <small><bdi>{record.reason}</bdi></small>
        </button>
      </li>)}
    </ul>
  ) : null;
  return <section className="auth-card">
    <h2>{text.exceptions}</h2>
    <AsyncSurface locale={locale} state={failure
      ? { kind: "error", retry: () => { setFailure(undefined); setRetry(retry + 1); }, message: showError(locale, failure) }
      : rows ? records ? { kind: "ready", content: records } : { kind: "empty" } : { kind: "initialLoading" }} />
    {year.state !== "closed" && rows && <form className="auth-form" onSubmit={submit} aria-busy={state.pending}>
      <label>{text.date}<input type="date" value={date} onChange={(event) => setDate(event.target.value)}
        min={year.startsOn} required disabled={state.pending} /></label>
      <div className="auth-form" key={date + (current?.revision ?? 0)}>
        <label>{text.state}<select name="teaching" defaultValue={current?.teaching ? "yes" : "no"}>
          <option value="yes">{text.teaching}</option><option value="no">{text.closedDay}</option>
        </select></label>
        <label>{text.reason}<input name="reason" defaultValue={current?.reason} required maxLength={400} /></label>
      </div>
      <FormNotice state={state} />
      <button className="primary-button" disabled={state.pending || !date}>{text.save}</button>
    </form>}
  </section>;
}
