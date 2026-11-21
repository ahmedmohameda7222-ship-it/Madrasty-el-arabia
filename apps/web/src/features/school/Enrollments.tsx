"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import {
  enrollmentSchema, rosterRowSchema, rolloverInput, rolloverPreviewSchema, schoolClassSchema,
  studentSchema, yearSchema, type Locale, type SchoolClass, type SchoolYear, type Enrollment,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { AsyncSurface } from "@/ui/AsyncSurface";

const labels = {
  ar: {
    title: "الفصول وقيد الطلبة", year: "السنة الدراسية", choose: "اختر سنة", classes: "الفصول",
    newClass: "إضافة فصل", code: "كود الفصل", ar: "الاسم بالعربية", de: "الاسم بالألمانية", capacity: "عدد المقاعد",
    roster: "كشف القيد", date: "التاريخ", open: "فتح الكشف", closed: "يوم بلا تدريس", place: "تسكين الطلبة",
    from: "تاريخ السريان", query: "ابحث عن طالب بالاسم أو الرقم", search: "بحث", selected: "الطلبة المختارون",
    move: "نقل", withdraw: "إنهاء القيد", destination: "الفصل الجديد", reason: "السبب",
    save: "حفظ", history: "سجل القيد", voided: "أُلغي القيد", rollover: "ترحيل السنة",
    targetYear: "السنة المستهدفة", preview: "معاينة الترحيل", confirm: "اعتماد الترحيل وإغلاق السنة",
    changes: "تسكين", conflicts: "تعارضات", noPlacement: "بدون تسكين", override: "استثناء الطالب",
    default: "حسب الفصل", repeat: "إعادة السنة", skip: "تخطي", target: "اختيار فصل مختلف", more: "عرض المزيد",
    already_enrolled: "له قيد في السنة المستهدفة", student_inactive: "الطالب غير نشط", target_missing: "الفصل المستهدف غير محدد", class_full: "الفصل ممتلئ",
  },
  de: {
    title: "Klassen und Einschreibungen", year: "Schuljahr", choose: "Jahr auswählen", classes: "Klassen",
    newClass: "Klasse hinzufügen", code: "Klassencode", ar: "Name auf Arabisch", de: "Name auf Deutsch", capacity: "Plätze",
    roster: "Klassenliste", date: "Datum", open: "Liste öffnen", closed: "Unterrichtsfrei", place: "Schüler zuweisen",
    from: "Gültig ab", query: "Nach Name oder Schülernummer suchen", search: "Suchen", selected: "Ausgewählte Schüler",
    move: "Versetzen", withdraw: "Einschreibung beenden", destination: "Zielklasse", reason: "Grund",
    save: "Speichern", history: "Einschreibungsverlauf", voided: "Zuordnung storniert", rollover: "Schuljahreswechsel",
    targetYear: "Zielschuljahr", preview: "Übernahme prüfen", confirm: "Übernahme bestätigen und Schuljahr abschließen",
    changes: "Zuordnungen", conflicts: "Konflikte", noPlacement: "Ohne Zuordnung", override: "Ausnahme für Schüler",
    default: "Nach Klasse", repeat: "Jahr wiederholen", skip: "Überspringen", target: "Andere Klasse", more: "Weitere anzeigen",
    already_enrolled: "Bereits im Zieljahr eingeschrieben", student_inactive: "Schüler inaktiv", target_missing: "Zielklasse fehlt", class_full: "Klasse ausgelastet",
  },
} as const;

const classesSchema = schoolClassSchema.array();
const yearsSchema = yearSchema.array();
const rosterSchema = z.object({ schoolClass: schoolClassSchema, rows: rosterRowSchema.array(), date: z.string(), teachingDay: z.boolean() });
const resultSchema = z.object({ schoolClass: schoolClassSchema, enrollments: enrollmentSchema.array() });
const moveSchema = z.object({ ended: enrollmentSchema, next: enrollmentSchema.nullable() });
const historySchema = enrollmentSchema.array();
const studentsSchema = studentSchema.array();
type Preview = z.infer<typeof rolloverPreviewSchema>;
type Configuration = z.infer<typeof rolloverInput>;

function requestProblem(locale: Locale, error: unknown) {
  return error instanceof ApiResponseError ? localizedError(locale, error.messageKey) : dictionary(locale)["error.unavailable"];
}
function useAction(locale: Locale) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  return { pending, message, failed, run: async (action: () => Promise<void>) => {
    setPending(true); setMessage(""); setFailed(false);
    try { await action(); setMessage(dictionary(locale).saved); }
    catch (error) { setMessage(requestProblem(locale, error)); setFailed(true); }
    finally { setPending(false); }
  } };
}
const name = (item: SchoolClass, locale: Locale) => `${item.code} · ${locale === "ar" ? item.nameAr : item.nameDe}`;
const period = (year: SchoolYear) => `${year.startsOn} – ${year.endsExclusive}`;

export function ClassWorkspace({ locale, manageClasses, manageEnrollment }: {
  locale: Locale; manageClasses: boolean; manageEnrollment: boolean;
}) {
  const text = labels[locale];
  const [years, setYears] = useState<SchoolYear[]>();
  const [yearId, setYear] = useState("");
  const [classes, setClasses] = useState<SchoolClass[]>();
  const [classId, setClass] = useState("");
  const [failure, setFailure] = useState<unknown>();
  const [reload, setReload] = useState(0);
  const [rollover, showRollover] = useState(false);

  useEffect(() => {
    const request = new AbortController();
    requestApi("/school/years", yearsSchema, { signal: request.signal }).then(({ data }) => setYears(data))
      .catch((error) => { if (!request.signal.aborted) setFailure(error); });
    return () => request.abort();
  }, [reload]);
  useEffect(() => {
    if (!yearId) return;
    const request = new AbortController();
    requestApi(`/school/classes?yearId=${yearId}&limit=100`, classesSchema, { signal: request.signal })
      .then(({ data }) => setClasses(data)).catch((error) => {
        if (!request.signal.aborted) setFailure(error);
      });
    return () => request.abort();
  }, [yearId, reload]);
  const year = years?.find((row) => row.id === yearId);
  const current = classes?.find((row) => row.id === classId);
  let content: ReactNode = null;
  if (years) content = <>
    <section className="auth-card">
      <label className="auth-form">{text.year}<select value={yearId} onChange={(event) => {
        setYear(event.target.value); setClass(""); setClasses(undefined); showRollover(false);
      }}>
        <option value="">{text.choose}</option>{years.map((row) => <option value={row.id} key={row.id}>{period(row)}</option>)}
      </select></label>
      {year && classes && <div className="auth-form">
        <label>{text.classes}<select value={classId} onChange={(event) => setClass(event.target.value)}>
          <option value="">{manageClasses && year.state !== "closed" ? text.newClass : text.classes}</option>
          {classes.map((row) => <option value={row.id} key={row.id}>{name(row, locale)}</option>)}
        </select></label>
        {manageClasses && year.state !== "closed" && <ClassForm key={current?.id ?? "new"} locale={locale} initial={current} yearId={year.id}
          saved={(value) => {
            setClass(value.id);
            setClasses((rows) => [value, ...(rows ?? []).filter((row) => row.id !== value.id)]);
          }} />}
        {manageEnrollment && year.state !== "closed" && <button className="plain-button" onClick={() => showRollover(!rollover)}>{text.rollover}</button>}
      </div>}
    </section>
    {current && classes && manageEnrollment && <Roster key={current.id} locale={locale} schoolClass={current} classes={classes} editable={year?.state !== "closed"} />}
    {rollover && year && classes && <Rollover key={year.id} locale={locale} source={year} years={years}
      classes={classes} confirmable={manageClasses} onConfirmed={() => setReload(reload + 1)} />}
  </>;
  return <>
    <h1>{text.title}</h1>
    <AsyncSurface locale={locale} state={failure
      ? { kind: "error", message: requestProblem(locale, failure), retry: () => { setFailure(undefined); setReload(reload + 1); } }
      : content ? { kind: "ready", content } : { kind: "initialLoading" }} />
  </>;
}

function ClassForm({ locale, initial, yearId, saved }: {
  locale: Locale; initial?: SchoolClass; yearId: string; saved: (value: SchoolClass) => void;
}) {
  const text = labels[locale], action = useAction(locale), command = useAdminCommand();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action.run(async () => {
      const raw = { nameAr: form.get("ar"), nameDe: form.get("de"), capacity: form.get("cap") ? Number(form.get("cap")) : null };
      saved(await command(initial ? `/school/classes/${initial.id}` : "/school/classes", initial ? "PATCH" : "POST",
        { ...raw, ...(initial ? { revision: initial.revision } : { yearId, code: form.get("code") }) }, schoolClassSchema));
    });
  };
  return <form className="auth-form" onSubmit={submit} aria-busy={action.pending}>
    <label>{text.code}<input dir="ltr" name="code" defaultValue={initial?.code} pattern="[A-Z0-9][A-Z0-9_\-]{0,23}" required readOnly={Boolean(initial)} /></label>
    <label>{text.ar}<input name="ar" dir="rtl" defaultValue={initial?.nameAr} required maxLength={120} /></label>
    <label>{text.de}<input name="de" dir="ltr" defaultValue={initial?.nameDe} required maxLength={120} /></label>
    <label>{text.capacity}<input name="cap" type="number" min={1} max={1000} defaultValue={initial?.capacity ?? ""} /></label>
    <button className="primary-button" disabled={action.pending}>{text.save}</button><Feedback action={action} />
  </form>;
}

function Roster({ locale, schoolClass, classes, editable }: {
  locale: Locale; schoolClass: SchoolClass; classes: SchoolClass[]; editable: boolean;
}) {
  const text = labels[locale];
  const [date, setDate] = useState("");
  const [roster, setRoster] = useState<z.infer<typeof rosterSchema>>();
  const [cursor, setCursor] = useState<string>();
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<z.infer<typeof studentsSchema>>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [move, setMove] = useState<{ record: Enrollment; action: "transfer" | "withdraw" }>();
  const [history, setHistory] = useState<Enrollment[]>([]);
  const action = useAction(locale), command = useAdminCommand();

  async function load(day: string, nextCursor?: string) {
    const page = await requestApi(`/school/classes/${schoolClass.id}/roster?date=${day}${nextCursor ? `&cursor=${nextCursor}` : ""}`, rosterSchema);
    setRoster(nextCursor && roster ? { ...page.data, rows: [...roster.rows, ...page.data.rows] } : page.data);
    setCursor(page.meta?.nextCursor);
  }
  const runSubmit = (event: FormEvent<HTMLFormElement>, callback: (form: FormData) => Promise<void>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action.run(() => callback(form));
  };

  return <section className="auth-card">
    <h2>{text.roster}</h2>
    <form className="auth-form" onSubmit={(event) => runSubmit(event, () => load(date))}>
      <label>{text.date}<input type="date" value={date} required onChange={(event) => setDate(event.target.value)} /></label>
      <button className="plain-button" disabled={action.pending}>{text.open}</button>
    </form>
    {roster && <>
      <p><bdi>{roster.date}</bdi>{!roster.teachingDay && <> · {text.closed}</>}</p>
      {roster.rows.length === 0 && <p>{dictionary(locale).empty}</p>}
      <ul className="group-list">
        {roster.rows.map(({ displayName, studentNumber, enrollment }) => <li className="group-row" key={enrollment.id}>
          <bdi>{displayName}</bdi><bdi dir="ltr">{studentNumber}</bdi>
          <button className="plain-button" disabled={action.pending} onClick={() => void action.run(async () => {
            setHistory((await requestApi(`/school/students/${enrollment.studentId}/enrollments`, historySchema)).data);
          })}>{text.history}</button>
          {editable && <><button className="plain-button" onClick={() => setMove({ record: enrollment, action: "transfer" })}>{text.move}</button>
            <button className="plain-button" onClick={() => setMove({ record: enrollment, action: "withdraw" })}>{text.withdraw}</button></>}
        </li>)}
      </ul>
      {cursor && <button className="plain-button" onClick={() => void action.run(() => load(roster.date, cursor))}>{text.more}</button>}
    </>}
    {history.length > 0 && <ul>
      {history.map((row) => <li key={row.id}>
        <bdi>{row.effectiveFrom} – {row.effectiveUntil}</bdi>
        {" · "}{classes.find((item) => item.id === row.classId)?.code ?? ""}
        {row.voided && <> · {text.voided}</>}{row.endingReason && <> · <bdi>{row.endingReason}</bdi></>}
      </li>)}
    </ul>}
    {move && <form key={move.record.id + move.action} className="auth-form" onSubmit={(event) => runSubmit(event, async (form) => {
      await command(`/school/enrollments/${move.record.id}/${move.action}`, "POST", {
        effectiveDate: form.get("date"), reason: form.get("reason"), revision: move.record.revision,
        ...(move.action === "transfer" && { toClassId: form.get("class") }),
      }, moveSchema);
      setMove(undefined);
      if (roster) await load(roster.date);
    })}>
      <h3>{move.action === "transfer" ? text.move : text.withdraw}</h3>
      <label>{text.from}<input name="date" type="date" required /></label>
      {move.action === "transfer" && <label>{text.destination}<select name="class" required>
        <option value="">{text.destination}</option>{classes.filter((value) => value.id !== schoolClass.id).map((value) =>
          <option value={value.id} key={value.id}>{name(value, locale)}</option>)}
      </select></label>}
      <label>{text.reason}<input name="reason" required maxLength={400} /></label>
      <button className="primary-button" disabled={action.pending}>{text.save}</button>
      <button type="button" className="plain-button" onClick={() => setMove(undefined)}>{dictionary(locale).close}</button>
    </form>}
    {editable && <>
      <h3>{text.place}</h3>
      <form className="auth-form" onSubmit={(event) => runSubmit(event, async () => {
        setStudents((await requestApi(`/school/students?query=${encodeURIComponent(query)}&limit=100`, studentsSchema)).data);
      })}>
        <label>{text.query}<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button className="plain-button" disabled={action.pending}>{text.search}</button>
      </form>
      {students.filter((row) => row.state === "active").map((row) => <label className="access-check" key={row.id}>
        <input type="checkbox" checked={picked.includes(row.id)} onChange={(event) => setPicked(event.target.checked ? [...picked, row.id] : picked.filter((id) => id !== row.id))} />
        <bdi>{row.displayName}</bdi> · <bdi dir="ltr">{row.studentNumber}</bdi>
      </label>)}
      <form className="auth-form" onSubmit={(event) => runSubmit(event, async (form) => {
        await command(`/school/classes/${schoolClass.id}/enrollments`, "POST", {
          studentIds: picked, from: form.get("from"), revision: schoolClass.revision,
        }, resultSchema);
        setPicked([]);
        if (roster) await load(roster.date);
      })}>
        <p>{text.selected} · {picked.length}</p>
        <label>{text.from}<input name="from" type="date" required /></label>
        <button className="primary-button" disabled={action.pending || picked.length === 0 || picked.length > 100}>{text.place}</button>
      </form>
    </>}
    <Feedback action={action} />
  </section>;
}

function Rollover({ locale, source, years, classes, confirmable, onConfirmed }: {
  locale: Locale; source: SchoolYear; years: SchoolYear[]; classes: SchoolClass[]; confirmable: boolean; onConfirmed: () => void;
}) {
  const text = labels[locale], action = useAction(locale), command = useAdminCommand();
  const [target, setTarget] = useState("");
  const [targetClasses, setTargetClasses] = useState<SchoolClass[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [exceptions, setExceptions] = useState<Configuration["exceptions"]>([]);
  const [preview, setPreview] = useState<Preview>();
  const [dirty, setDirty] = useState(true);

  function chooseTarget(id: string) {
    setTarget(id); setMapping({}); setExceptions([]); setPreview(undefined); setDirty(true);
    if (!id) { setTargetClasses([]); return; }
    void action.run(async () => setTargetClasses((await requestApi(`/school/classes?yearId=${id}&limit=100`, classesSchema)).data));
  }
  function modifyException(studentId: string, choice: "repeat" | "withdraw" | "skip" | "target" | "default", targetClass?: string) {
    const filtered = exceptions.filter((row) => row.studentId !== studentId);
    setExceptions(choice === "default" ? filtered : [...filtered, { studentId, action: choice, toClassId: targetClass }]);
    setDirty(true);
  }
  return <section className="auth-card">
    <h2>{text.rollover}</h2>
    <div className="auth-form">
      <label>{text.targetYear}<select value={target} disabled={action.pending} onChange={(event) => chooseTarget(event.target.value)}>
        <option value="">{text.choose}</option>{years.filter((year) => year.startsOn >= source.endsExclusive && year.state !== "closed")
          .map((year) => <option key={year.id} value={year.id}>{period(year)}</option>)}
      </select></label>
      {target && classes.map((row) => <label key={row.id}>{name(row, locale)}<select value={mapping[row.id] ?? ""}
        onChange={(event) => { setMapping({ ...mapping, [row.id]: event.target.value }); setDirty(true); }}>
        <option value="">{text.destination}</option>{targetClasses.map((option) => <option key={option.id} value={option.id}>{name(option, locale)}</option>)}
      </select></label>)}
      <button className="plain-button" disabled={!target || action.pending} onClick={() => void action.run(async () => {
        const payload = rolloverInput.safeParse({ targetYearId: target, classMap: Object.entries(mapping).filter(([,to]) => to)
          .map(([fromClassId,toClassId]) => ({ fromClassId,toClassId })), exceptions });
        if (!payload.success) throw new ApiResponseError(422, "validation", "error.validation");
        setPreview(await command(`/school/years/${source.id}/rollovers/preview`, "POST", payload.data, rolloverPreviewSchema));
        setDirty(false);
      })}>{text.preview}</button>
      {preview && <>
        <p>{text.changes} {preview.counts.changes} · {text.conflicts} {preview.counts.conflicts} · {text.noPlacement} {preview.counts.noPlacement}</p>
        <ul className="group-list">
          {preview.rows.map((row) => {
            const entry = exceptions.find(({ studentId }) => studentId === row.studentId);
            return <li key={row.studentId} className="group-row">
              <bdi>{row.displayName}</bdi>
              {row.conflict && <span>{text[row.conflict as "already_enrolled"] ?? text.conflicts}</span>}
              <label>{text.override}<select value={entry?.action ?? "default"} disabled={preview.confirmed} onChange={(event) =>
                modifyException(row.studentId, event.target.value as "repeat", entry?.toClassId)}>
                {(["default","repeat","withdraw","skip","target"] as const).map((option) => <option key={option} value={option}>{text[option]}</option>)}
              </select></label>
              {entry && ["repeat","target"].includes(entry.action) && <label>{text.destination}<select value={entry.toClassId ?? ""}
                onChange={(event) => modifyException(row.studentId, entry.action, event.target.value || undefined)}>
                <option value="">{text.destination}</option>{targetClasses.map((option) => <option key={option.id} value={option.id}>{name(option, locale)}</option>)}
              </select></label>}
            </li>;
          })}
        </ul>
        {confirmable && !preview.confirmed && <button className="primary-button" disabled={action.pending || dirty || preview.counts.conflicts > 0}
          onClick={() => void action.run(async () => {
            setPreview(await command(`/school/rollovers/${preview.id}/confirm`, "POST", { revision: preview.revision }, rolloverPreviewSchema));
            onConfirmed();
          })}>{text.confirm}</button>}
      </>}
    </div>
    <Feedback action={action} />
  </section>;
}

function Feedback({ action }: { action: ReturnType<typeof useAction> }) {
  return action.message ? <p role={action.failed ? "alert" : "status"}>{action.message}</p> : null;
}
