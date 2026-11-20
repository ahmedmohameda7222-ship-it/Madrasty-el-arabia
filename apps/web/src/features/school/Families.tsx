"use client";

import Link from "next/link";

import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  childLinkSchema, childSummarySchema, createGuardianInput, createStudentInput, guardianDetailSchema,
  guardianSchema, studentSchema, updateGuardianInput, updateStudentInput,
  type ChildLink, type Guardian, type Locale, type Student,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { InviteGuardianButton } from "@/features/identity/Invitations";
import { ScopeSheet } from "@/ui/Shell";

const copy = {
  ar: {
    family: "الأسر", pupil: "طالب", adult: "ولي أمر", createPupil: "إضافة طالب", createAdult: "إضافة ولي أمر",
    name: "الاسم", number: "رقم الطالب", email: "البريد الإلكتروني", phone: "رقم الهاتف", language: "لغة المراسلات",
    query: "بحث بالاسم أو رقم الطالب", guardianQuery: "بحث باسم ولي الأمر", search: "بحث", state: "الحالة", active: "نشط",
    inactive: "غير نشط", save: "حفظ", moreRows: "نتائج إضافية", attached: "حساب مفعّل",
    emailHelp: "تغيير بريد الحساب المفعّل من إعدادات أمان الحساب.", links: "روابط الأبناء",
    pending: "بانتظار المراجعة", approved: "معتمد", revoked: "ملغى", reason: "السبب",
    approve: "اعتماد الرابط", revoke: "إلغاء الرابط", newLink: "ربط طالب", submitLink: "إرسال الرابط للمراجعة",
    immediate: "اعتماد الرابط الآن", chosenChild: "الطفل المختار",
  },
  de: {
    family: "Familien", pupil: "Schüler", adult: "Sorgeberechtigte", createPupil: "Schüler hinzufügen", createAdult: "Sorgeberechtigte hinzufügen",
    name: "Name", number: "Schülernummer", email: "E-Mail-Adresse", phone: "Telefonnummer", language: "Sprache für Mitteilungen",
    query: "Nach Name oder Schülernummer suchen", guardianQuery: "Nach Name suchen", search: "Suchen", state: "Status", active: "Aktiv",
    inactive: "Inaktiv", save: "Speichern", moreRows: "Weitere Ergebnisse", attached: "Konto aktiviert",
    emailHelp: "Die E-Mail-Adresse eines aktiven Kontos wird in den Sicherheitseinstellungen geändert.", links: "Verknüpfte Kinder",
    pending: "Zur Prüfung", approved: "Bestätigt", revoked: "Widerrufen", reason: "Grund",
    approve: "Verknüpfung bestätigen", revoke: "Verknüpfung widerrufen", newLink: "Kind zuordnen",
    submitLink: "Zur Prüfung einreichen", immediate: "Verknüpfung sofort bestätigen", chosenChild: "Ausgewähltes Kind",
  },
} as const;

type Mode = "students" | "guardians";
type Resource<T> = { data?: T; error?: unknown };
function useRead<T>(path: `/${string}` | null, schema: z.ZodType<T>) {
  const [result, setResult] = useState<Resource<T>>({});
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    requestApi(path, schema, { signal: controller.signal }).then(({ data }) => setResult({ data }))
      .catch((error) => { if (!controller.signal.aborted) setResult({ error }); });
    return () => controller.abort();
  }, [path, schema, generation]);
  return { ...result, retry: () => { setResult({}); setGeneration(generation + 1); } };
}
function errorText(locale: Locale, error: unknown) {
  return error instanceof ApiResponseError ? localizedError(locale, error.messageKey) : dictionary(locale)["error.unavailable"];
}
function validation() { return new ApiResponseError(422, "validation", "error.validation"); }

const studentList = studentSchema.array();
const guardianList = guardianSchema.array();
const childrenSchema = childSummarySchema.array();
const studentReader = z.union([studentList, guardianList]);

export function Families({ locale, initialGuardian, initialStudent, initialLink }: { locale: Locale; initialGuardian?:string; initialStudent?:string; initialLink?:string }) {
  const text = copy[locale];
  const [mode, setMode] = useState<Mode>(initialGuardian?"guardians":"students");
  const [target, setTarget] = useState<string | "new" | null>(initialGuardian??initialStudent??null);
  const [refresh, setRefresh] = useState(0);
  return (
    <>
      <div className="header-actions family-tabs">
        <button type="button" className="plain-button" aria-pressed={mode === "students"}
          onClick={() => { setMode("students"); setTarget(null); }}>{dictionary(locale).students}</button>
        <button type="button" className="plain-button" aria-pressed={mode === "guardians"}
          onClick={() => { setMode("guardians"); setTarget(null); }}>{text.family}</button>
      </div>
      <div className="calendar-layout">
        <section className="auth-card">
          <h2>{mode === "students" ? dictionary(locale).students : text.family}</h2>
          <RecordPicker locale={locale} mode={mode} key={`${mode}:${refresh}`} select={setTarget} />
          <button className="primary-button" onClick={() => setTarget("new")}>{mode === "students" ? text.createPupil : text.createAdult}</button>
        </section>
        {target && <RecordEditor locale={locale} mode={mode} target={target} key={`${mode}:${target}`} initialLink={initialLink}
          saved={(id) => { setTarget(id); setRefresh(refresh + 1); }} />}
      </div>
    </>
  );
}

function RecordPicker({ locale, mode, select }: { locale: Locale; mode: Mode; select: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [state, setState] = useState<{ rows?: (Student | Guardian)[]; next?: string; error?: unknown }>({});
  const [generation, setGeneration] = useState(0);
  const text = copy[locale];
  const search = mode === "students" ? text.query : text.guardianQuery;
  const path = `/school/${mode}?query=${encodeURIComponent(filter)}` as const;

  useEffect(() => {
    const controller = new AbortController();
    requestApi(path, studentReader, { signal: controller.signal }).then(({ data, meta }) => {
      setState({ rows: data, next: meta?.nextCursor });
    }).catch((error) => { if (!controller.signal.aborted) setState({ error }); });
    return () => controller.abort();
  }, [path, generation]);

  const retry = () => { setState({}); setGeneration(generation + 1); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilter(query.trim());
    retry();
  };
  const loadMore = async () => {
    if (!state.next) return;
    try {
      const result = await requestApi(`${path}&cursor=${encodeURIComponent(state.next)}`, studentReader);
      setState({ rows: [...(state.rows ?? []), ...result.data], next: result.meta?.nextCursor });
    } catch (error) { setState({ error }); }
  };
  return (
    <div className="auth-form">
      <form className="auth-form" onSubmit={submit}>
        <label>{search}<input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} /></label>
        <button className="plain-button">{text.search}</button>
      </form>
      <AsyncSurface locale={locale} state={state.error
        ? { kind: "error", retry, message: errorText(locale, state.error) }
        : state.rows ? state.rows.length ? { kind: "ready", content: (
          <ul className="group-list">{state.rows.map((row) => <li key={row.id}>
            <button className="group-row" type="button" onClick={() => select(row.id)}>
              <bdi>{row.displayName}</bdi>{"studentNumber" in row && <small><bdi dir="ltr">{row.studentNumber}</bdi></small>}
            </button>
          </li>)}</ul>
        ) } : { kind: "empty", filtered: Boolean(filter) } : { kind: "initialLoading" }} />
      {state.next && <button className="plain-button" onClick={loadMore}>{text.moreRows}</button>}
    </div>
  );
}

const recordSchema = z.union([studentSchema, guardianDetailSchema]);
function RecordEditor({ locale, mode, target, initialLink, saved }: {
  locale: Locale; mode: Mode; target: string; initialLink?:string; saved: (id: string) => void;
}) {
  const reload = useRead(target === "new" ? null : `/school/${mode}/${target}`, recordSchema);
  const text = copy[locale];
  return (
    <section className="auth-card">
      <h2>{mode === "students" ? text.pupil : text.adult}</h2>
      {target === "new" || reload.data ? (
        <ProfileForm key={reload.data?.revision ?? 0} locale={locale} mode={mode} record={reload.data}
          saved={(id) => { saved(id); if (id === target) reload.retry(); }} />
      ) : <AsyncSurface locale={locale} state={reload.error
        ? { kind: "error", retry: reload.retry, message: errorText(locale, reload.error) } : { kind: "initialLoading" }} />}
      {reload.data && "links" in reload.data && <Relationships locale={locale} record={reload.data} initialLink={initialLink} changed={reload.retry} />}
    </section>
  );
}

function ProfileForm({ locale, mode, record, saved }: {
  locale: Locale; mode: Mode; record?: z.infer<typeof recordSchema>; saved: (id: string) => void;
}) {
  const text = copy[locale];
  const command = useAdminCommand();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const isStudent = mode === "students";
  const child = record && "studentNumber" in record ? record : null;
  const adult = record && "contactEmail" in record ? record : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFailure("");
    const form = new FormData(event.currentTarget);
    const fields = { displayName: form.get("name"), revision: record?.revision };
    try {
      if (isStudent) {
        const validated = (record ? updateStudentInput : createStudentInput).safeParse({ ...fields, state: form.get("state") });
        if (!validated.success) throw validation();
        const row = await command(record ? `/school/students/${record.id}` : "/school/students",
          record ? "PATCH" : "POST", validated.data, studentSchema);
        saved(row.id);
      } else {
        const validated = (record ? updateGuardianInput : createGuardianInput).safeParse({
          ...fields, contactEmail: form.get("email") || null, contactPhone: form.get("phone") || null,
          correspondenceLocale: form.get("language"),
        });
        if (!validated.success) throw validation();
        const row = await command(record ? `/school/guardians/${record.id}` : "/school/guardians",
          record ? "PATCH" : "POST", validated.data, guardianSchema);
        saved(row.id);
      }
    } catch (error) { setFailure(errorText(locale, error)); }
    finally { setPending(false); }
  }
  return (
    <form className="auth-form" onSubmit={submit} aria-busy={pending}>
      {child && <p>{text.number} <bdi dir="ltr">{child.studentNumber}</bdi></p>}
      {adult?.linkedAccount && <p>{text.attached}. {text.emailHelp}</p>}
      <label>{text.name}<input name="name" defaultValue={record?.displayName} required maxLength={200} /></label>
      {child && <label>{text.state}<select name="state" defaultValue={child.state}>
        <option value="active">{text.active}</option><option value="inactive">{text.inactive}</option>
      </select></label>}
      {!isStudent && <>
        <label>{text.email}<input name="email" type="email" dir="ltr" defaultValue={adult?.contactEmail ?? ""} readOnly={adult?.linkedAccount} /></label>
        <label>{text.phone}<input name="phone" type="tel" dir="ltr" defaultValue={adult?.contactPhone ?? ""} maxLength={48} /></label>
        <label>{text.language}<select name="language" defaultValue={adult?.correspondenceLocale ?? locale}>
          <option value="ar">العربية</option><option value="de">Deutsch</option>
        </select></label>
      </>}
      {failure && <p role="alert">{failure}</p>}
      <button className="primary-button" disabled={pending}>{pending ? dictionary(locale).pending : text.save}</button>
    </form>
  );
}

function Relationships({ locale, record, initialLink, changed }: { locale: Locale; record: z.infer<typeof guardianDetailSchema>; initialLink?:string; changed: () => void }) {
  const text = copy[locale];
  const [pupil, setPupil] = useState("");
  const [picker, setPicker] = useState(false);
  const [immediate, setImmediate] = useState(false);
  const [action, setAction] = useState<{ link: ChildLink; type: "approve" | "revoke" }>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const command = useAdminCommand();
  useEffect(()=>{
    if(initialLink) document.getElementById(`guardian-link-${initialLink}`)?.focus();
  },[initialLink]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get("reason");
    setError("");
    setPending(true);
    try {
      if (action) await command(`/school/guardian-links/${action.link.id}/${action.type}`, "POST", {
        revision: action.link.revision, reason,
      }, childLinkSchema);
      else await command("/school/guardian-links", "POST", {
        guardianId: record.id, studentId: pupil, ...(immediate && { approvalReason: reason }),
      }, childLinkSchema);
      setAction(undefined);
      setPupil("");
      setPicker(false);
      changed();
    } catch (cause) { setError(errorText(locale, cause)); }
    finally { setPending(false); }
  }
  return <section className="auth-form">
    <h3>{text.links}</h3>
    {!record.linkedAccount && record.contactEmail && record.links.some((link) => link.state === "approved") &&
      <InviteGuardianButton locale={locale} id={record.id} correspondenceLocale={record.correspondenceLocale} />}
    {record.links.length === 0 && <p>{dictionary(locale).empty}</p>}
    <ul className="group-list">
      {record.links.map((link) => <li key={link.id} className="group-row" id={`guardian-link-${link.id}`} tabIndex={link.id===initialLink?-1:undefined}>
        <bdi>{link.studentName}</bdi><bdi dir="ltr">{link.studentNumber}</bdi><span>{text[link.state]}</span>
        {link.state === "pending" && <button className="plain-button" disabled={pending}
          onClick={() => setAction({ link, type: "approve" })}>{text.approve}</button>}
        {link.state !== "revoked" && <button className="plain-button" disabled={pending}
          onClick={() => setAction({ link, type: "revoke" })}>{text.revoke}</button>}
      </li>)}
    </ul>
    <button type="button" className="plain-button" onClick={() => { setPicker(!picker); setAction(undefined); }}>
      {picker ? dictionary(locale).close : text.newLink}
    </button>
    {picker && !action && <RecordPicker locale={locale} mode="students" select={setPupil} />}
    {(action || picker && pupil) && <form key={action?.link.id ?? pupil} className="auth-form" onSubmit={submit} aria-busy={pending}>
      {action && <p><bdi>{action.link.studentName}</bdi> · {text[action.type]}</p>}
      {!action && <label className="access-check"><input type="checkbox" checked={immediate} onChange={(event) => setImmediate(event.target.checked)} />{text.immediate}</label>}
      {(action || immediate) && <label>{text.reason}<input name="reason" required maxLength={400} /></label>}
      {error && <p role="alert">{error}</p>}
      <button className="primary-button" disabled={pending}>{action ? text[action.type] : immediate ? text.approve : text.submitLink}</button>
      {action && <button type="button" className="plain-button" onClick={() => setAction(undefined)}>{dictionary(locale).close}</button>}
    </form>}
  </section>;
}

export function Children({ locale, initialChild }: { locale: Locale; initialChild?:string }) {
  const [chosen, setChosen] = useState(initialChild);
  const available = useRead("/me/children?limit=100", childrenSchema);
  useEffect(() => {
    const onFocus = () => available.retry();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [available]);
  const selected = available.data?.find(({ id }) => id === chosen);
  return <AsyncSurface locale={locale} state={available.error
    ? { kind: "error", retry: available.retry, message: errorText(locale, available.error) }
    : !available.data ? { kind: "initialLoading" } : !available.data.length ? { kind: "empty" }
    : { kind: "ready", content: (
      <section className="auth-card">
        <ScopeSheet locale={locale} selectedId={selected?.id} choices={available.data.map((item) =>
          ({ id: item.id, label: item.displayName, detail: item.currentClass?.code ?? item.studentNumber }))} select={setChosen} />
        {selected && <ChildDetail key={selected.id} locale={locale} id={selected.id} />}
      </section>
    ) }} />;
}

function ChildDetail({ locale, id }: { locale: Locale; id: string }) {
  const record = useRead(`/me/children/${id}`, childSummarySchema);
  return <AsyncSurface locale={locale} state={record.error
    ? (record.error instanceof ApiResponseError && [401,403,404].includes(record.error.status)
      ? { kind: "forbidden" } : { kind: "error", retry: record.retry, message: errorText(locale, record.error) })
    : record.data ? { kind: "ready", content: <>
      <h2><bdi>{record.data.displayName}</bdi></h2>
      <p>{copy[locale].number} <bdi dir="ltr">{record.data.studentNumber}</bdi></p>
      <Link className="plain-button" href={`/${locale}/school/more/timetable?child=${id}`}>
        {locale === "ar" ? "الجدول الأسبوعي" : "Wochenplan"}
      </Link>
      <Link className="plain-button" href={`/${locale}/school/more/exams?child=${id}`}>{locale==="ar"?"الامتحانات":"Prüfungen"}</Link>
      <Link className="plain-button" href={`/${locale}/school/more/evaluations?child=${id}`}>{locale==="ar"?"التقييمات الدورية":"Regelmäßige Beurteilungen"}</Link>
      <Link className="plain-button" href={`/${locale}/school/more/homework?child=${id}`}>{locale==="ar"?"الواجبات":"Hausaufgaben"}</Link>
      <Link className="plain-button" href={`/${locale}/school/more/academics?child=${id}`}>{locale==="ar"?"الأنشطة والتقييم":"Bewertete Aktivitäten"}</Link>
      <Link className="plain-button" href={`/${locale}/school/more/curriculum?child=${id}`}>{locale==="ar"?"المواد والدروس":"Fächer und Unterricht"}</Link>
      <Link className="plain-button" href={`/${locale}/school/children/${id}/attendance`}>{locale==="ar"?"تاريخ الحضور":"Anwesenheitsverlauf"}</Link>
      <Link className="plain-button" href={`/${locale}/school/children/${id}/excuse`}>{locale==="ar"?"عذر الغياب":"Abwesenheit entschuldigen"}</Link>
      {record.data.currentClass && <p><bdi dir="ltr">{record.data.currentClass.code}</bdi> · <bdi>{locale === "ar" ? record.data.currentClass.nameAr : record.data.currentClass.nameDe}</bdi></p>}
    </> } : { kind: "initialLoading" }} />;
}
