"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import {
  dayExceptionSchema, daysSchema, schoolClassSchema, settingsSchema, yearChangeInput, yearInput, yearSchema,
  type Locale, type SchoolYear, type Settings,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { AsyncSurface } from "@/ui/AsyncSurface";
import {
  asExclusiveEnd, asInclusiveEnd, calendarDayState, calendarMonthCells,
  chooseCalendarYear, dateISO, directCalendarException, monthTeachingCount,
  schoolDateUTC, withinCalendarYear, yearTitle, type CalendarException,
} from "./calendar-model";
import styles from "./Calendar.module.css";

type SchoolClass = z.infer<typeof schoolClassSchema>;
type ModalName = "years" | "new" | "days" | "editPeriod" | "closeYear" | "activate" | "remove" | null;

const lexicon = {
  de: {
    title: "Schuljahr und Kalender", eyebrow: "SCHULORGANISATION",
    intro: "Unterrichtstage, Ferien und Ausnahmen auf einen Blick. Änderungen direkt im Kalender vornehmen.",
    years: "Schuljahre", newYear: "Neues Schuljahr", selectedYear: "Ausgewähltes Schuljahr",
    active: "Aktiv", draft: "Entwurf", closed: "Abgeschlossen",
    weekdayCaption: "Reguläre Unterrichtstage", editWeekdays: "Reguläre Unterrichtstage",
    thisMonth: "Unterrichtstage diesen Monat", freeExceptions: "Unterrichtsfreie Ausnahmen", classes: "Klassen",
    today: "Heute", selectedDay: "AUSGEWÄHLTER TAG", school: "Ganze Schule", scope: "Gilt für",
    action: "Was soll an diesem Tag gelten?", teaching: "Unterricht findet statt", free: "Unterricht fällt aus",
    regular: "Regulärer Unterricht", noTeaching: "Regulär unterrichtsfrei", additional: "Zusätzlicher Unterricht",
    closedDay: "Unterrichtsfrei", scoped: "Klassenbezogene Ausnahme", reason: "Grund / Notiz",
    reasonPlaceholder: "Zum Beispiel: Schulferien oder zusätzlicher Unterricht",
    saveChange: "Änderung speichern", remove: "Ausnahme entfernen", savedExceptions: "Gespeicherte Ausnahmen an diesem Tag",
    upcoming: "Nächste Ausnahmen", edit: "Bearbeiten", changeNote: "Änderungen am Schulkalender können den Stundenplan und die Anwesenheit beeinflussen.",
    clickHint: "Klicken Sie auf ein Datum, um Unterrichtstage oder Ausnahmen zu ändern.",
    from: "Beginn des Schuljahres", to: "Letzter Tag des Schuljahres", cancel: "Abbrechen",
    save: "Speichern", continue: "Weiter", back: "Zurück", create: "Schuljahr erstellen",
    newIntro: "Zuerst Zeitraum festlegen, danach die regelmäßigen Unterrichtstage auswählen.",
    periodStep: "Schritt 1 von 2 · Zeitraum", daysStep: "Schritt 2 von 2 · Unterrichtstage",
    chooseDays: "Mindestens einen Unterrichtstag auswählen.", chooseReason: "Bitte einen Grund eingeben.",
    invalidDates: "Das Ende muss nach dem Beginn liegen.", outsideYear: "Dieses Datum liegt außerhalb des ausgewählten Schuljahres.",
    emptyYears: "Noch kein Schuljahr vorhanden.", noExceptions: "Keine Ausnahmen eingetragen.",
    removeConfirm: "Ausnahme wirklich entfernen?", removeBody: "Der Tag übernimmt danach wieder den regulären Wochenplan bzw. eine schulweite Ausnahme.",
    confirmRemove: "Ausnahme entfernen", closeYear: "Schuljahr abschließen", closeTitle: "Schuljahr abschließen?",
    closeInfo: "Ein abgeschlossenes Schuljahr kann nicht mehr bearbeitet werden. Bitte alle offenen Arbeiten vorher prüfen.",
    closeCheck: "Ich habe die Folgen geprüft und möchte das Schuljahr endgültig abschließen.",
    activate: "Schuljahr aktivieren", activateInfo: "Dieses Schuljahr als aktives Schuljahr verwenden?",
    activeExists: "Ein anderes Schuljahr ist bereits aktiv. Schließen Sie es zuerst ab.",
    editPeriod: "Zeitraum ändern", editPeriodInfo: "Eine Datumsänderung kann bestehende Klassen, Stundenpläne und Anwesenheit betreffen.",
    editDaysInfo: "Diese Tage gelten normalerweise jede Woche. Individuelle Ausnahmen bleiben erhalten.",
    readonly: "Dieses Schuljahr ist abgeschlossen und schreibgeschützt.",
    noConfig: "Die Schule muss zuerst eingerichtet werden, bevor Schuljahre verwaltet werden können.",
    classLink: "Klassen für das Schuljahr einrichten", dayAll: "Schule und Klassen",
    error: "Der Vorgang konnte nicht abgeschlossen werden.", retry: "Erneut versuchen",
    saved: "Änderung gespeichert.", created: "Schuljahr erstellt.", removed: "Ausnahme entfernt.",
    mon: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"], weekdays: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
  },
  ar: {
    title: "السنة الدراسية والتقويم", eyebrow: "تنظيم المدرسة",
    intro: "كل أيام الدراسة والإجازات في مكان واحد. اضغط على أي يوم لتعديل حالته بسهولة.",
    years: "السنوات الدراسية", newYear: "سنة دراسية جديدة", selectedYear: "السنة الدراسية المختارة",
    active: "نشطة", draft: "مسودة", closed: "مغلقة",
    weekdayCaption: "أيام الدراسة الأسبوعية", editWeekdays: "تعديل أيام الدراسة",
    thisMonth: "أيام الدراسة هذا الشهر", freeExceptions: "استثناءات الإجازات", classes: "الفصول",
    today: "اليوم", selectedDay: "اليوم المحدد", school: "المدرسة كلها", scope: "ينطبق على",
    action: "إيه اللي هيحصل في اليوم ده؟", teaching: "يوجد دراسة", free: "لا توجد دراسة",
    regular: "يوم دراسة عادي", noTeaching: "إجازة أسبوعية", additional: "يوم دراسة إضافي",
    closedDay: "إجازة", scoped: "استثناء لفصل معين", reason: "السبب / ملاحظة",
    reasonPlaceholder: "مثلاً: إجازة رسمية أو حصة تعويضية",
    saveChange: "حفظ التغيير", remove: "إزالة الاستثناء", savedExceptions: "الاستثناءات المحفوظة في هذا اليوم",
    upcoming: "الاستثناءات القادمة", edit: "تعديل", changeNote: "تغيير أيام الدراسة ممكن يؤثر على الجدول والحضور المسجل.",
    clickHint: "اضغط على أي تاريخ لتحديد يوم دراسة أو إجازة.",
    from: "بداية السنة الدراسية", to: "آخر يوم في السنة الدراسية", cancel: "إلغاء",
    save: "حفظ", continue: "التالي", back: "السابق", create: "إنشاء السنة الدراسية",
    newIntro: "حدد بداية ونهاية السنة أولًا، وبعدها اختار أيام الدراسة الأسبوعية.",
    periodStep: "الخطوة ١ من ٢ · الفترة", daysStep: "الخطوة ٢ من ٢ · أيام الدراسة",
    chooseDays: "اختار يوم دراسة واحد على الأقل.", chooseReason: "اكتب سبب الاستثناء.",
    invalidDates: "تاريخ النهاية لازم يكون بعد تاريخ البداية.", outsideYear: "اليوم ده خارج السنة الدراسية المختارة.",
    emptyYears: "لسه مفيش سنة دراسية.", noExceptions: "مفيش استثناءات مسجلة.",
    removeConfirm: "متأكد إنك عايز تلغي الاستثناء؟", removeBody: "اليوم هيرجع لحالته في الجدول الأسبوعي، أو للاستثناء العام للمدرسة.",
    confirmRemove: "إزالة الاستثناء", closeYear: "إغلاق السنة الدراسية", closeTitle: "إغلاق السنة الدراسية؟",
    closeInfo: "بعد إغلاق السنة مش هتقدر تعدّلها. راجع أعمال السنة قبل التأكيد.",
    closeCheck: "راجعت النتائج وأوافق على إغلاق السنة نهائيًا.",
    activate: "تفعيل السنة الدراسية", activateInfo: "عايز تخلي السنة دي هي السنة النشطة؟",
    activeExists: "فيه سنة نشطة بالفعل. اقفلها الأول قبل تفعيل سنة تانية.",
    editPeriod: "تعديل فترة السنة", editPeriodInfo: "تغيير التواريخ ممكن يؤثر على الفصول والجداول والحضور.",
    editDaysInfo: "الأيام دي بتتكرر كل أسبوع، والاستثناءات المحفوظة بتفضل زي ما هي.",
    readonly: "السنة دي مغلقة ومش متاح تعديلها.",
    noConfig: "لازم تجهيز إعدادات المدرسة الأساسية الأول قبل إدارة السنوات الدراسية.",
    classLink: "تجهيز فصول السنة الدراسية", dayAll: "المدرسة والفصول",
    error: "تعذر إكمال العملية.", retry: "إعادة المحاولة",
    saved: "تم حفظ التغيير.", created: "تم إنشاء السنة الدراسية.", removed: "تم إزالة الاستثناء.",
    mon: ["إث", "ثل", "أر", "خم", "جم", "سب", "أح"], weekdays: ["الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"],
  },
} as const;

function errorMessage(locale: Locale, error: unknown) {
  return error instanceof ApiResponseError ? localizedError(locale, error.messageKey)
    : dictionary(locale)["error.unavailable"];
}
function apiPath(path: string): `/${string}` { return path as `/${string}`; }
function schoolNow(timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return get("year") + "-" + get("month") + "-" + get("day");
  } catch { return dateISO(new Date()); }
}
function formatDate(date: string, locale: Locale, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "de-DE", {
    day: "numeric", month: "long", year: "numeric", ...(options ?? {}),
    timeZone: "UTC",
  }).format(schoolDateUTC(date));
}
function monthName(y: number, m: number, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "de-DE", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, 1, 12)));
}
function shiftMonth(y: number, m: number, diff: number) {
  const date = new Date(Date.UTC(y, m - 1 + diff, 1));
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1 };
}
function Icon({ name, size = 17 }: { name: "calendar" | "users" | "clock" | "edit" | "trash" | "info" | "check"; size?: number }) {
  const path = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2c0-3 3-5 6-5s6 2 6 5v2"/><path d="M17 6a3 3 0 0 1 0 6M19 14c2 1 3 3 3 5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    edit: <><path d="M4 20h4l12-12-4-4L4 16v4Z"/><path d="m14 6 4 4"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6m4-6v6"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.5"/></>,
    check: <path d="m4 12 5 5L20 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">{path[name]}</svg>;
}
function Notice({ error, success }: { error: string; success: string }) {
  if (!error && !success) return null;
  return <p role={error ? "alert" : "status"} className={error ? styles.noticeError : styles.noticeGood}>
    {error || success}
  </p>;
}
function Modal({ title, sub, children, close }: { title: string; sub?: string; children: ReactNode; close: () => void }) {
  return <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.modalHeader}><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
        <button type="button" className={styles.iconButton} onClick={close} aria-label="Close">×</button>
      </div>
      {children}
    </section>
  </div>;
}
function WeekSelector({ locale, selected, change }: { locale: Locale; selected: number[]; change: (value: number[]) => void }) {
  return <div className={styles.weekSelector} role="group" aria-label={lexicon[locale].weekdayCaption}>
    {lexicon[locale].mon.map((label, i) => {
      const day = i + 1, active = selected.includes(day);
      return <button type="button" key={day} className={active ? styles.weekActive : styles.weekIdle}
        aria-pressed={active} title={lexicon[locale].weekdays[i]} onClick={() => change(active ? selected.filter((d) => d !== day) : [...selected, day].sort())}>
        {label}{active && <span>✓</span>}
      </button>;
    })}
  </div>;
}

export function SchoolCalendar({ locale }: { locale: Locale }) {
  const t = lexicon[locale], command = useAdminCommand();
  const [settings, setSettings] = useState<Settings | null>();
  const [years, setYears] = useState<SchoolYear[]>();
  const [settingsError, setSettingsError] = useState<unknown>();
  const [yearsError, setYearsError] = useState<unknown>();
  const [settingsRetry, setSettingsRetry] = useState(0);
  const [yearsRetry, setYearsRetry] = useState(0);
  const [yearId, setYearId] = useState("");
  const [rows, setRows] = useState<CalendarException[]>();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [calendarError, setCalendarError] = useState<unknown>();
  const [calendarRetry, setCalendarRetry] = useState(0);
  const [view, setView] = useState({ y: 2026, m: 11 });
  const [selectedDate, setSelectedDate] = useState("");
  const [scope, setScope] = useState("");
  const [draftTeaching, setDraftTeaching] = useState(false);
  const [draftReason, setDraftReason] = useState("");
  const [modal, setModal] = useState<ModalName>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalError, setModalError] = useState("");
  const [yearStart, setYearStart] = useState("2027-09-01");
  const [yearEnd, setYearEnd] = useState("2028-06-30");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 5, 6]);
  const [yearStep, setYearStep] = useState(1);
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const today = schoolNow(settings?.timezone ?? "Europe/Berlin");
  const chosen = years?.find(y => y.id === yearId) ?? chooseCalendarYear(years ?? [], today);
  const chosenId = chosen?.id;

  useEffect(() => {
    const controller = new AbortController();
    requestApi("/school/settings", settingsSchema.nullable(), { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setSettings(data); })
      .catch((cause) => { if (!controller.signal.aborted) setSettingsError(cause); });
    return () => controller.abort();
  }, [settingsRetry]);
  useEffect(() => {
    if (!settings) return;
    const controller = new AbortController();
    requestApi("/school/years", yearSchema.array(), { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setYears(data); })
      .catch((cause) => { if (!controller.signal.aborted) setYearsError(cause); });
    return () => controller.abort();
  }, [settings, yearsRetry]);
  useEffect(() => {
    if (!chosenId) return;
    const controller = new AbortController();
    setRows(undefined); setCalendarError(undefined); setClasses([]);
    Promise.all([
      requestApi(apiPath("/school/years/" + chosenId + "/days"), daysSchema, { signal: controller.signal }),
      requestApi(apiPath("/school/classes?yearId=" + chosenId + "&limit=100"), schoolClassSchema.array(), { signal: controller.signal }),
    ]).then(([days, schoolClasses]) => {
      if (!controller.signal.aborted) { setRows(days.data); setClasses(schoolClasses.data); }
    }).catch((cause) => { if (!controller.signal.aborted) setCalendarError(cause); });
    return () => controller.abort();
  }, [chosenId, calendarRetry]);
  useEffect(() => {
    if (!chosenId || !chosen) return;
    const date = withinCalendarYear(today, chosen) ? today : chosen.startsOn;
    setView({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) });
    setSelectedDate(date);
    setScope("");
    // selected year changes reset the editor to a concrete day.
  }, [chosenId]); // eslint-disable-line react-hooks/exhaustive-deps

  const direct = rows && selectedDate ? directCalendarException(selectedDate, rows, scope) : undefined;
  const selectedState = chosen && selectedDate ? calendarDayState(selectedDate, chosen, rows ?? [], scope) : undefined;
  const dayExceptions = rows?.filter(e => e.schoolDate === selectedDate) ?? [];
  useEffect(() => {
    if (!selectedState) return;
    setDraftTeaching(selectedState.teaching);
    setDraftReason(direct?.reason ?? "");
    setError(""); setSuccess("");
  }, [selectedDate, scope, direct?.id, direct?.revision, selectedState?.teaching]); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseYear(year: SchoolYear) {
    setYearId(year.id); setModal(null); setModalError(""); setError(""); setSuccess("");
    const date = withinCalendarYear(today, year) ? today : year.startsOn;
    setView({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) });
    setSelectedDate(date); setScope("");
  }
  function pickDay(date: string) { setSelectedDate(date); setError(""); setSuccess(""); }
  function saveYear(year: SchoolYear) {
    setYears(current => [year, ...(current ?? []).filter(entry => entry.id !== year.id)]
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn)));
    chooseYear(year);
  }
  async function execute(action: () => Promise<void>, dialog = false) {
    setError(""); setSuccess(""); setModalError("");
    if (dialog) setDialogBusy(true); else setSubmitBusy(true);
    try { await action(); if (!dialog) setSuccess(t.saved); }
    catch (cause) { if (dialog) setModalError(errorMessage(locale, cause)); else setError(errorMessage(locale, cause)); }
    finally { if (dialog) setDialogBusy(false); else setSubmitBusy(false); }
  }

  async function saveDay(event: FormEvent) {
    event.preventDefault();
    if (!chosen || !selectedDate || !selectedState?.valid || chosen.state === "closed" || !rows) return;
    if (!draftReason.trim()) { setError(t.chooseReason); return; }
    await execute(async () => {
      const saved = await command(apiPath("/school/years/" + chosen.id + "/days/" + selectedDate), "PUT", {
        classId: scope || null, revision: direct?.revision ?? 0, teaching: draftTeaching, reason: draftReason.trim(),
      }, dayExceptionSchema);
      setRows(current => [...(current ?? []).filter(entry => entry.id !== saved.id), saved]
        .sort((a, b) => a.schoolDate.localeCompare(b.schoolDate)));
    });
  }
  function removeDay() {
    if (!chosen || !direct || !selectedDate) return;
    void execute(async () => {
      await command(apiPath("/school/years/" + chosen.id + "/days/" + selectedDate), "DELETE", {
        classId: scope || null, revision: direct.revision,
      }, z.object({ id: z.uuid(), deleted: z.literal(true) }));
      setRows(current => (current ?? []).filter(entry => entry.id !== direct.id));
      setModal(null); setSuccess(t.removed);
    }, true);
  }
  function showNewYear() {
    if (chosen) {
      const next = Number(chosen.startsOn.slice(0, 4)) + 1;
      setYearStart(next + chosen.startsOn.slice(4));
      setYearEnd((next + 1) + asInclusiveEnd(chosen.endsExclusive).slice(4));
      setWeekdays([...chosen.teachingWeekdays]);
    } else {
      setYearStart(today.slice(0, 4) + "-09-01");
      setYearEnd((Number(today.slice(0, 4)) + 1) + "-06-30");
      setWeekdays([1, 2, 5, 6]);
    }
    setYearStep(1); setModalError(""); setModal("new");
  }
  async function createNewYear() {
    if (!yearStart || !yearEnd || yearEnd <= yearStart) { setModalError(t.invalidDates); return; }
    const payload = { startsOn: yearStart, endsExclusive: asExclusiveEnd(yearEnd), teachingWeekdays: weekdays, state: "draft" as const };
    if (!yearInput.safeParse(payload).success) { setModalError(t.invalidDates); return; }
    await execute(async () => {
      const saved = await command("/school/years", "POST", payload, yearSchema);
      saveYear(saved); setSuccess(t.created);
    }, true);
  }
  async function updateYear(changes: Partial<Pick<SchoolYear, "startsOn" | "endsExclusive" | "teachingWeekdays" | "state">>) {
    if (!chosen || chosen.state === "closed") return;
    if (changes.endsExclusive !== undefined && (!yearEnd || yearEnd <= yearStart)) { setModalError(t.invalidDates); return; }
    const payload = { startsOn: changes.startsOn ?? chosen.startsOn, endsExclusive: changes.endsExclusive ?? chosen.endsExclusive,
      teachingWeekdays: changes.teachingWeekdays ?? chosen.teachingWeekdays, state: changes.state ?? chosen.state,
      revision: chosen.revision };
    if (!yearChangeInput.safeParse(payload).success) { setModalError(t.invalidDates); return; }
    await execute(async () => {
      const saved = await command(apiPath("/school/years/" + chosen.id), "PATCH", payload, yearSchema);
      saveYear(saved); setSuccess(t.saved);
    }, true);
  }
  const isEditable = chosen?.state !== "closed";
  const monthDays = useMemo(() => calendarMonthCells(view.y, view.m), [view.y, view.m]);
  const teachingDays = chosen && rows ? monthTeachingCount(view.y, view.m, chosen, rows, scope) : 0;
  const monthPrefix = view.y + "-" + String(view.m).padStart(2, "0");
  const monthOff = rows?.filter(entry => entry.schoolDate.startsWith(monthPrefix) && !entry.teaching).length ?? 0;
  const upcoming = [...(rows ?? [])].filter(entry => entry.schoolDate >= today)
    .sort((a, b) => a.schoolDate.localeCompare(b.schoolDate)).slice(0, 5);

  const forbidden = settingsError instanceof ApiResponseError && [401, 403].includes(settingsError.status);
  if (forbidden) return <AsyncSurface locale={locale} state={{ kind: "forbidden" }} />;
  if (settingsError) return <AsyncSurface locale={locale} state={{ kind: "error",
    message: errorMessage(locale, settingsError), retry: () => { setSettingsError(undefined); setSettingsRetry(n => n + 1); } }} />;
  if (settings === undefined) return <AsyncSurface locale={locale} state={{ kind: "initialLoading" }} />;
  if (!settings) return <div className={styles.root}><h1>{t.title}</h1><p role="status">{t.noConfig}</p></div>;
  if (yearsError) return <AsyncSurface locale={locale} state={{ kind: "error",
    message: errorMessage(locale, yearsError), retry: () => { setYearsError(undefined); setYearsRetry(n => n + 1); } }} />;
  if (!years) return <AsyncSurface locale={locale} state={{ kind: "initialLoading" }} />;

  return <div className={styles.root} dir={locale === "ar" ? "rtl" : "ltr"}>
    <div className={styles.head}>
      <div className={styles.headline}><div className={styles.eyebrow}>{t.eyebrow}</div>
        <h1>{t.title}</h1><p>{t.intro}</p></div>
      <div className={styles.headActions}>
        <button className={styles.secondary} type="button" onClick={() => { setModalError(""); setModal("years"); }}>
          {t.years} <span aria-hidden="true">⌄</span></button>
        <button className={styles.primary} type="button" onClick={showNewYear}><span aria-hidden="true">＋</span>{t.newYear}</button>
      </div>
    </div>

    {!chosen ? <section className={styles.card}><p>{t.emptyYears}</p>
      <button className={styles.primary} type="button" onClick={showNewYear}>＋ {t.newYear}</button></section>
      : <>
        <section className={styles.summary} aria-label={t.selectedYear}>
          <div className={styles.yearCard}>
            <p className={styles.smallLabel}>{t.selectedYear}</p>
            <h2>{yearTitle(chosen)} <span className={styles["tag" + chosen.state]}>{t[chosen.state]}</span></h2>
            <p className={styles.yearRange}>{formatDate(chosen.startsOn, locale)} – {formatDate(asInclusiveEnd(chosen.endsExclusive), locale)}</p>
            <div className={styles.yearFooter}><span>{t.weekdayCaption}: <strong>{chosen.teachingWeekdays.map(i => t.mon[i - 1]).join(" · ")}</strong></span>
              {isEditable && <button type="button" className={styles.textAction} onClick={() => {
                setWeekdays([...chosen.teachingWeekdays]); setModal("days"); setModalError("");
              }}><Icon name="edit" size={14}/>{t.editWeekdays}</button>}
            </div>
          </div>
          <div className={styles.statCard}><span className={styles.iconGreen}><Icon name="calendar"/></span>
            <strong>{rows ? teachingDays : "—"}</strong><span>{t.thisMonth}</span></div>
          <div className={styles.statCard}><span className={styles.iconRed}><Icon name="clock"/></span>
            <strong>{rows ? monthOff : "—"}</strong><span>{t.freeExceptions}</span></div>
          <div className={styles.statCard}><span className={styles.iconGreen}><Icon name="users"/></span>
            <strong>{rows ? classes.length : "—"}</strong><span>{t.classes}</span></div>
        </section>

        {calendarError ? <div className={styles.card}><p role="alert">{errorMessage(locale, calendarError)}</p>
          <button className={styles.secondary} onClick={() => { setCalendarError(undefined); setCalendarRetry(n => n + 1); }}>{t.retry}</button></div>
          : rows === undefined ? <AsyncSurface locale={locale} state={{ kind: "initialLoading" }} />
          : <div className={styles.columns}>
            <section className={styles.calendarCard} aria-label={t.title}>
              <div className={styles.monthHead}>
                <div><h2>{monthName(view.y, view.m, locale)}</h2>
                  <p>{yearTitle(chosen)} · {t.weekdayCaption}: {chosen.teachingWeekdays.map(i => t.mon[i - 1]).join(", ")}</p></div>
                <div className={styles.monthActions}>
                  <button className={styles.smallButton} onClick={() => {
                    const day = withinCalendarYear(today, chosen) ? today : chosen.startsOn;
                    setView({ y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)) }); pickDay(day);
                  }}>{t.today}</button>
                  <button className={styles.arrowButton} aria-label={locale === "de" ? "Vorheriger Monat" : "الشهر السابق"}
                    onClick={() => setView(v => shiftMonth(v.y, v.m, -1))}>‹</button>
                  <button className={styles.arrowButton} aria-label={locale === "de" ? "Nächster Monat" : "الشهر التالي"}
                    onClick={() => setView(v => shiftMonth(v.y, v.m, 1))}>›</button>
                </div>
              </div>
              <div className={styles.weekHead}>{t.mon.map((label, index) => <span key={index}>{label}</span>)}</div>
              <div className={styles.calendarGrid}>
                {monthDays.map((date, index) => {
                  if (!date) return <span key={"empty" + index} aria-hidden="true" className={styles.emptyDay}/>;
                  const day = calendarDayState(date, chosen, rows, scope);
                  const hasClass = rows.some(entry => entry.schoolDate === date && entry.classId);
                  const selected = date === selectedDate, currentDay = date === today;
                  const stateClass = !day.valid ? styles.outOfYear : day.exception && !day.teaching ? styles.dayHoliday
                    : day.exception && day.teaching ? styles.dayExtra : day.teaching ? styles.dayRegular : styles.dayOff;
                  return <button type="button" key={date} className={[styles.day, stateClass, selected ? styles.daySelected : ""].join(" ")}
                    aria-current={currentDay ? "date" : undefined} aria-pressed={selected}
                    disabled={!day.valid} onClick={() => pickDay(date)}
                    aria-label={formatDate(date, locale) + " · " + (day.teaching ? t.teaching : t.free)}>
                    <span className={currentDay ? styles.todayNumber : styles.number}>{Number(date.slice(8))}</span>
                    <span className={styles.dayBottom}>
                      {day.valid && <span className={[styles.dot,
                        day.exception ? (day.teaching ? styles.dotExtra : styles.dotHoliday) : (day.teaching ? styles.dotRegular : styles.dotOff)].join(" ")}/>}
                      {hasClass && <span className={styles.dotClass}/>}
                      <span className={styles.dayText}>{day.exception ? (day.teaching ? t.additional : t.closedDay) : (day.teaching ? t.regular : "")}</span>
                    </span>
                  </button>;
                })}
              </div>
              <div className={styles.legend}>
                <span><i className={styles.dotRegular}/>{t.regular}</span>
                <span><i className={styles.dotHoliday}/>{t.closedDay}</span>
                <span><i className={styles.dotExtra}/>{t.additional}</span>
                <span><i className={styles.dotClass}/>{t.scoped}</span>
              </div>
              <p className={styles.hint}>{t.clickHint}</p>
            </section>
            <div className={styles.side}>
              <section className={styles.dayPanel}>
                <p className={styles.eyebrow}>{t.selectedDay}</p>
                <div className={styles.dayHeader}><div><h2>{formatDate(selectedDate, locale, { year: undefined })}</h2>
                  <p>{formatDate(selectedDate, locale, { weekday: "long", month: undefined, day: undefined })} · {yearTitle(chosen)}</p>
                </div><span className={styles.tagMuted}>{t[chosen.state]}</span></div>
                {selectedState?.valid ? <>
                  <div className={selectedState.teaching ? styles.dayStatusGood : styles.dayStatusBad}>
                    <Icon name={selectedState.teaching ? "check" : "clock"}/>
                    <div><strong>{selectedState.exception ? (selectedState.teaching ? t.additional : t.closedDay)
                      : selectedState.teaching ? t.regular : t.noTeaching}</strong>
                      {selectedState.exception && <span>{selectedState.exception.reason}</span>}</div>
                  </div>
                  <form onSubmit={saveDay} className={styles.dayForm}>
                    <label>{t.scope}<select className={styles.field} value={scope} disabled={!isEditable || submitBusy}
                      onChange={(event) => setScope(event.target.value)}>
                      <option value="">{t.school}</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.code} · {locale === "ar" ? c.nameAr : c.nameDe}</option>)}
                    </select></label>
                    {isEditable ? <>
                      <fieldset disabled={submitBusy} className={styles.dayChoices}><legend>{t.action}</legend>
                        <div className={styles.actionGrid}>
                          <button type="button" aria-pressed={!draftTeaching} className={!draftTeaching ? styles.actionRedActive : styles.actionRed}
                            onClick={() => setDraftTeaching(false)}><span>×</span>{t.free}</button>
                          <button type="button" aria-pressed={draftTeaching} className={draftTeaching ? styles.actionGreenActive : styles.actionGreen}
                            onClick={() => setDraftTeaching(true)}><Icon name="check"/>{t.teaching}</button>
                        </div>
                      </fieldset>
                      <label>{t.reason}<input className={styles.field} value={draftReason} maxLength={400}
                        onChange={e => setDraftReason(e.target.value)} placeholder={t.reasonPlaceholder} disabled={submitBusy}/></label>
                      <button type="submit" disabled={submitBusy || !draftReason.trim()}
                        className={styles.saveButton}><Icon name="check"/>{t.saveChange}</button>
                      {direct && <button type="button" className={styles.removeButton}
                        onClick={() => { setModalError(""); setModal("remove"); }}><Icon name="trash" size={15}/>{t.remove}</button>}
                      <p className={styles.softNote}><Icon name="info" size={14}/>{t.changeNote}</p>
                    </> : <p className={styles.softNote}>{t.readonly}</p>}
                    <Notice error={error} success={success}/>
                  </form>
                  {dayExceptions.length > 0 && <div className={styles.savedDay}>
                    <h3>{t.savedExceptions}</h3>
                    {dayExceptions.map(x => <button className={styles.savedException} type="button" key={x.id}
                      onClick={() => { setScope(x.classId ?? ""); pickDay(x.schoolDate); }}>
                      <span><strong>{x.classId ? classes.find(c => c.id === x.classId)?.code ?? t.scope : t.school}
                        {" · "}{x.teaching ? t.additional : t.closedDay}</strong>
                        <small>{x.reason}</small></span><b>{t.edit}</b>
                    </button>)}
                  </div>}
                </> : <p className={styles.softNote}>{t.outsideYear}</p>}
              </section>
              <section className={styles.upcomingPanel}>
                <h3>{t.upcoming}</h3>
                {upcoming.length === 0 ? <p className={styles.softNote}>{t.noExceptions}</p> :
                  upcoming.map(entry => <button key={entry.id} type="button" className={styles.upcomingItem}
                    onClick={() => { setView({ y: Number(entry.schoolDate.slice(0, 4)), m: Number(entry.schoolDate.slice(5, 7)) });
                      setSelectedDate(entry.schoolDate); setScope(entry.classId ?? ""); }}>
                    <span className={styles.dateBadge}><strong>{Number(entry.schoolDate.slice(8))}</strong>
                      <small>{new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "de-DE", { month: "short", timeZone: "UTC" })
                        .format(schoolDateUTC(entry.schoolDate))}</small></span>
                    <span className={styles.upcomingDetail}><strong>{entry.teaching ? t.additional : t.closedDay}</strong>
                      <small>{entry.classId ? classes.find(c => c.id === entry.classId)?.code ?? t.scope : t.school} · {entry.reason}</small>
                    </span><Icon name="edit" size={15}/>
                  </button>)}
              </section>
            </div>
          </div>}
      </>}

    {modal === "years" && <Modal title={t.years} close={() => setModal(null)}>
      <div className={styles.yearList}>{years.map(y => <button key={y.id} type="button" className={styles.yearChoice}
        onClick={() => chooseYear(y)}>
        <span><strong>{yearTitle(y)}</strong><small>{formatDate(y.startsOn, locale)} – {formatDate(asInclusiveEnd(y.endsExclusive), locale)}</small></span>
        <span className={styles["tag" + y.state]}>{t[y.state]}</span>
      </button>)}</div>
      {chosen && <div className={styles.modalActions}>
        {chosen.state !== "closed" && <button className={styles.secondary} onClick={() => {
          setYearStart(chosen.startsOn); setYearEnd(asInclusiveEnd(chosen.endsExclusive)); setModal("editPeriod");
        }}>{t.editPeriod}</button>}
        {chosen.state === "draft" && <button className={styles.primary} onClick={() => setModal("activate")}>{t.activate}</button>}
        {chosen.state === "active" && <button className={styles.removeButton} onClick={() => {
          setCloseConfirmed(false); setModal("closeYear");
        }}>{t.closeYear}</button>}
        {chosen.state !== "closed" && <Link className={styles.secondary} href={"/" + locale + "/school/more/classes?year=" + chosen.id}>{t.classLink}</Link>}
      </div>}
    </Modal>}

    {modal === "days" && chosen && <Modal title={t.editWeekdays} sub={t.editDaysInfo} close={() => setModal(null)}>
      <WeekSelector locale={locale} selected={weekdays} change={setWeekdays}/>
      <p className={styles.warning}><Icon name="info"/>{t.changeNote}</p>
      <Notice error={modalError} success=""/>
      <div className={styles.modalActions}><button className={styles.secondary} onClick={() => setModal(null)}>{t.cancel}</button>
        <button className={styles.primary} disabled={dialogBusy} onClick={() => {
          if (!weekdays.length) { setModalError(t.chooseDays); return; }
          void updateYear({ teachingWeekdays: weekdays });
        }}>{t.save}</button></div>
    </Modal>}

    {modal === "new" && <Modal title={t.newYear} sub={t.newIntro} close={() => setModal(null)}>
      <p className={styles.stepLabel}>{yearStep === 1 ? t.periodStep : t.daysStep}</p>
      {yearStep === 1 ? <div className={styles.formFields}>
        <label>{t.from}<input type="date" className={styles.field} value={yearStart} onChange={e => setYearStart(e.target.value)} /></label>
        <label>{t.to}<input type="date" className={styles.field} value={yearEnd} onChange={e => setYearEnd(e.target.value)}/></label>
      </div> : <><WeekSelector locale={locale} selected={weekdays} change={setWeekdays}/>
        <p className={styles.softNote}>{t.editDaysInfo}</p></>}
      <Notice error={modalError} success=""/>
      <div className={styles.modalActions}>
        <button className={styles.secondary} onClick={() => { if (yearStep === 2) setYearStep(1); else setModal(null); }}>{yearStep === 2 ? t.back : t.cancel}</button>
        {yearStep === 1 ? <button className={styles.primary} onClick={() => {
          if (!yearStart || !yearEnd || yearEnd <= yearStart) { setModalError(t.invalidDates); return; }
          setModalError(""); setYearStep(2);
        }}>{t.continue}</button> : <button className={styles.primary} disabled={dialogBusy} onClick={() => {
          if (!weekdays.length) { setModalError(t.chooseDays); return; }
          void createNewYear();
        }}>{t.create}</button>}
      </div>
    </Modal>}

    {modal === "editPeriod" && chosen && <Modal title={t.editPeriod} sub={t.editPeriodInfo} close={() => setModal(null)}>
      <div className={styles.formFields}>
        <label>{t.from}<input type="date" className={styles.field} value={yearStart} onChange={e => setYearStart(e.target.value)}/></label>
        <label>{t.to}<input type="date" className={styles.field} value={yearEnd} onChange={e => setYearEnd(e.target.value)}/></label>
      </div>
      <Notice error={modalError} success=""/>
      <div className={styles.modalActions}><button className={styles.secondary} onClick={() => setModal(null)}>{t.cancel}</button>
        <button className={styles.primary} disabled={dialogBusy} onClick={() => { if (!yearStart || !yearEnd || yearEnd <= yearStart) { setModalError(t.invalidDates); return; } void updateYear({ startsOn: yearStart, endsExclusive: asExclusiveEnd(yearEnd) }); }}>{t.save}</button></div>
    </Modal>}

    {modal === "activate" && chosen && <Modal title={t.activate} sub={t.activateInfo} close={() => setModal(null)}>
      {years.some(y => y.id !== chosen.id && y.state === "active") && <p className={styles.warning}>{t.activeExists}</p>}
      <Notice error={modalError} success=""/>
      <div className={styles.modalActions}><button className={styles.secondary} onClick={() => setModal(null)}>{t.cancel}</button>
        <button className={styles.primary} disabled={dialogBusy || years.some(y => y.id !== chosen.id && y.state === "active")}
          onClick={() => void updateYear({ state: "active" })}>{t.activate}</button></div>
    </Modal>}

    {modal === "closeYear" && chosen && <Modal title={t.closeTitle} sub={t.closeInfo} close={() => setModal(null)}>
      <p className={styles.warning}>{yearTitle(chosen)} · {formatDate(chosen.startsOn, locale)} – {formatDate(asInclusiveEnd(chosen.endsExclusive), locale)}</p>
      <label className={styles.confirm}><input type="checkbox" checked={closeConfirmed}
        onChange={e => setCloseConfirmed(e.target.checked)}/>{t.closeCheck}</label>
      <Notice error={modalError} success=""/>
      <div className={styles.modalActions}><button className={styles.secondary} onClick={() => setModal(null)}>{t.cancel}</button>
        <button className={styles.dangerButton} disabled={!closeConfirmed || dialogBusy}
          onClick={() => void updateYear({ state: "closed" })}>{t.closeYear}</button></div>
    </Modal>}

    {modal === "remove" && direct && <Modal title={t.removeConfirm} sub={t.removeBody} close={() => setModal(null)}>
      <p className={styles.warning}>{formatDate(selectedDate, locale)} · {direct.classId ? classes.find(c => c.id === direct.classId)?.code : t.school} · {direct.reason}</p>
      <Notice error={modalError} success=""/>
      <div className={styles.modalActions}><button className={styles.secondary} onClick={() => setModal(null)}>{t.cancel}</button>
        <button className={styles.dangerButton} disabled={dialogBusy} onClick={removeDay}><Icon name="trash"/>{t.confirmRemove}</button></div>
    </Modal>}
  </div>;
}
