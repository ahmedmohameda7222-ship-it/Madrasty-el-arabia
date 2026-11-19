"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  applicationSchema, applicationStatus, providerInviteProof, type Locale, type TeacherApplication,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { webHeaders } from "./SessionControls";

const labels = {
  ar: {
    apply:"طلب مدرس", review:"طلبات المدرسين", email:"البريد الإلكتروني", password:"كلمة السر", repeat:"تأكيد كلمة السر",
    verify:"تحقق من البريد الإلكتروني", send:"إرسال رابط التحقق", sent:"راجع بريدك الإلكتروني. أصحاب الحسابات الحالية يقدروا يسجلوا الدخول.",
    activate:"تأكيد البريد وحفظ كلمة السر", verified:"تم التحقق. سجّل الدخول لمتابعة الطلب.", signIn:"دخول المتقدم", signOut:"إنهاء جلسة المتقدم",
    name:"الاسم", contact:"وسيلة تواصل للعمل", subjects:"المواد المقترحة، مفصولة بفواصل", language:"لغة المراسلات", submit:"إرسال الطلب",
    submitted:"قيد المراجعة", approved:"مقبول", declined:"مرفوض", submittedAt:"تاريخ التقديم", decidedAt:"تاريخ القرار",
    message:"رسالة للمتقدم (اختياري)", approve:"قبول", decline:"رفض", filter:"الحالة", all:"الكل", more:"عرض المزيد",
    mismatch:"كلمتا السر غير متطابقتين.", linkError:"الرابط غير متاح. اطلب رابطًا جديدًا من صفحة التقديم.", refresh:"تحديث الحالة",
  },
  de: {
    apply:"Als Lehrkraft bewerben", review:"Bewerbungen von Lehrkräften", email:"E-Mail-Adresse", password:"Passwort", repeat:"Passwort bestätigen",
    verify:"E-Mail-Adresse bestätigen", send:"Bestätigungslink senden",
    sent:"Prüfen Sie Ihre E-Mail. Personen mit einem bestehenden Konto können sich direkt anmelden.",
    activate:"Adresse bestätigen und Passwort speichern", verified:"Bestätigt. Melden Sie sich an, um die Bewerbung fortzusetzen.",
    signIn:"Als Bewerber anmelden", signOut:"Bewerbersitzung beenden",
    name:"Name", contact:"Beruflicher Kontakt", subjects:"Vorgeschlagene Fächer, durch Komma getrennt",
    language:"Sprache für Mitteilungen", submit:"Bewerbung einreichen",
    submitted:"In Prüfung", approved:"Angenommen", declined:"Abgelehnt", submittedAt:"Eingereicht am", decidedAt:"Entscheidung vom",
    message:"Nachricht an die bewerbende Person (optional)", approve:"Annehmen", decline:"Ablehnen", filter:"Status",
    all:"Alle", more:"Weitere anzeigen", mismatch:"Die Passwörter stimmen nicht überein.",
    linkError:"Der Link ist ungültig. Fordern Sie über das Bewerbungsformular einen neuen Link an.", refresh:"Status aktualisieren",
  },
} as const;

const accepted = z.object({ accepted: z.literal(true) });
const path = "/teacher-applications";
const list = applicationSchema.array();
function problem(locale: Locale, error: unknown) {
  return error instanceof ApiResponseError ? localizedError(locale, error.messageKey) : dictionary(locale)["error.unavailable"];
}
function body(value: unknown): RequestInit {
  return { method: "POST", headers: webHeaders(), body: JSON.stringify(value) };
}

export function ApplyLink({ locale }: { locale: Locale }) {
  return <Link className="plain-button" href={`/${locale}/apply`}>{labels[locale].apply}</Link>;
}

export function ApplicantPortal({ locale }: { locale: Locale }) {
  const text = labels[locale];
  const [auth,setAuth] = useState<"checking"|"guest"|"allowed">("checking");
  const [record,setRecord] = useState<TeacherApplication | null>(null);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  const [sent,setSent] = useState(false);

  const status = useCallback(async (signal?: AbortSignal) => {
    try {
      const { data } = await requestApi(`${path}/me`, applicationSchema.nullable(), { signal });
      setAuth("allowed");
      setRecord(data);
    } catch (error) {
      if (signal?.aborted) return;
      setAuth("guest");
      if (!(error instanceof ApiResponseError) || ![401,403].includes(error.status)) setError(problem(locale,error));
    }
  }, [locale]);

  useEffect(() => {
    const abort = new AbortController();
    void status(abort.signal);
    const focus = () => { void status(abort.signal); };
    window.addEventListener("focus", focus);
    return () => { abort.abort(); window.removeEventListener("focus",focus); };
  }, [status]);

  async function run(action: () => Promise<void>) {
    setPending(true); setError("");
    try { await action(); } catch (cause) { setError(problem(locale,cause)); }
    finally { setPending(false); }
  }

  return <section className="auth-card">
    <h1>{text.apply}</h1>
    {auth === "checking" && <p role="status">{dictionary(locale).loading}</p>}
    {auth === "guest" && <>
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void run(async () => {
          await requestApi(`${path}/registration`,accepted,body({ email:form.get("email"), locale }));
          setSent(true);
        });
      }}>
        <h2>{text.verify}</h2>
        <label>{text.email}<input name="email" type="email" dir="ltr" required /></label>
        <button className="plain-button" disabled={pending}>{text.send}</button>
        {sent && <p role="status">{text.sent}</p>}
      </form>
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void run(async () => {
          await requestApi(`${path}/session`,accepted,body({email:form.get("email"),password:form.get("password")}));
          await status();
        });
      }}>
        <h2>{text.signIn}</h2>
        <label>{text.email}<input name="email" type="email" dir="ltr" autoComplete="username" required /></label>
        <label>{text.password}<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="primary-button" disabled={pending}>{text.signIn}</button>
      </form>
    </>}
    {auth === "allowed" && (record ? <>
      <State locale={locale} record={record} />
      <button className="plain-button" disabled={pending} onClick={() => void run(() => status())}>{text.refresh}</button>
    </> : <form className="auth-form" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void run(async () => {
        const subjects = String(form.get("subjects") ?? "").split(/[,،]/).map((value) => value.trim()).filter(Boolean);
        const result = await requestApi(path, applicationSchema, body({ displayName:form.get("name"),
          ...(form.get("contact") && {workContact:form.get("contact")}), requestedSubjects:subjects,
          correspondenceLocale:form.get("locale") }));
        setRecord(result.data);
      });
    }}>
      <label>{text.name}<input name="name" required maxLength={200} /></label>
      <label>{text.contact}<input name="contact" maxLength={180} /></label>
      <label>{text.subjects}<input name="subjects" maxLength={1000} /></label>
      <label>{text.language}<select name="locale" defaultValue={locale}><option value="ar">العربية</option><option value="de">Deutsch</option></select></label>
      <button className="primary-button" disabled={pending}>{text.submit}</button>
    </form>)}
    {auth === "allowed" && <button className="plain-button" disabled={pending} onClick={() => void run(async () => {
      const cleared = await fetch(`/api/v1${path}/session`, { method:"DELETE", headers:webHeaders(), cache:"no-store" });
      if (!cleared.ok) throw new Error("Application session");
      setAuth("guest"); setRecord(null);
    })}>{text.signOut}</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function ApplicantVerify({ locale, proof }: { locale: Locale; proof?: string }) {
  const text = labels[locale];
  const [done,setDone] = useState(false);
  const [pending,setPending] = useState(false);
  const [failure,setFailure] = useState("");
  const valid = providerInviteProof.safeParse(proof);
  return <section className="auth-card">
    <h1>{text.verify}</h1>
    {done ? <><p role="status">{text.verified}</p><Link href={`/${locale}/apply`}>{text.signIn}</Link></> : valid.success ? (
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (form.get("password") !== form.get("repeat")) { setFailure(text.mismatch); return; }
        setPending(true); setFailure("");
        void fetch(`/api/v1${path}/registration/verify`,body({ proof:valid.data,password:form.get("password") }))
          .then((response) => {
            if (response.status !== 204) { setFailure(text.linkError); return; }
            history.replaceState(history.state,"",window.location.pathname);
            setDone(true);
          }).catch(() => setFailure(dictionary(locale)["error.unavailable"])).finally(() => setPending(false));
      }}>
        <label>{text.password}<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></label>
        <label>{text.repeat}<input name="repeat" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></label>
        <button className="primary-button" disabled={pending}>{text.activate}</button>
      </form>
    ) : <p>{text.linkError}</p>}
    {failure && <p role="alert">{failure}</p>}
  </section>;
}

function State({ locale, record }: { locale: Locale; record: TeacherApplication }) {
  const text = labels[locale];
  const date = (value: string) => new Intl.DateTimeFormat(locale,{ dateStyle:"medium" }).format(new Date(value));
  return <>
    <p><bdi>{record.displayName}</bdi> · {text[record.state]}</p>
    <small>{text.submittedAt} <time dateTime={record.submittedAt}>{date(record.submittedAt)}</time></small>
    {record.decidedAt && <small> · {text.decidedAt} <time dateTime={record.decidedAt}>{date(record.decidedAt)}</time></small>}
    {record.applicantMessage && <p>{record.applicantMessage}</p>}
  </>;
}

export function ApplicationReview({ locale }: { locale: Locale }) {
  const text = labels[locale], command = useAdminCommand();
  const [filter,setFilter] = useState("submitted");
  const [rows,setRows] = useState<TeacherApplication[]>();
  const [selected,setSelected] = useState<TeacherApplication>();
  const [next,setNext] = useState<string>();
  const [error,setError] = useState("");
  const [pending,setPending] = useState(false);
  const [generation,reload] = useState(0);
  const url = `${path}?limit=25${filter ? `&status=${filter}` : ""}` as const;

  useEffect(() => {
    const abort = new AbortController();
    requestApi(url,list,{ signal:abort.signal }).then(({data,meta}) => { setRows(data); setNext(meta?.nextCursor); })
      .catch((error) => { if (!abort.signal.aborted) setError(problem(locale,error)); });
    return () => abort.abort();
  },[url,generation,locale]);

  async function run(action: () => Promise<void>) {
    setPending(true); setError("");
    try { await action(); } catch (cause) { setError(problem(locale,cause)); }
    finally { setPending(false); }
  }

  return <section className="auth-card">
    <h1>{text.review}</h1>
    <div className="auth-form">
      <label>{text.filter}<select value={filter} onChange={(event) => { setSelected(undefined); setRows(undefined); setFilter(event.target.value); }}>
        <option value="">{text.all}</option>{applicationStatus.options.map((status) => <option key={status} value={status}>{text[status]}</option>)}
      </select></label>
      {!rows && !error && <p role="status">{dictionary(locale).loading}</p>}
      {rows?.length === 0 && <p>{dictionary(locale).empty}</p>}
      <ul className="group-list">{rows?.map((row) => <li className="group-row" key={row.id}>
        <div><State record={row} locale={locale} />
          {row.workContact && <p><bdi>{row.workContact}</bdi></p>}
          {row.requestedSubjects?.length ? <p>{row.requestedSubjects.join(", ")}</p> : null}
        </div>
        {row.state === "submitted" && <button className="plain-button" disabled={pending} onClick={() => setSelected(row)}>{text.review}</button>}
      </li>)}</ul>
      {next && <button className="plain-button" disabled={pending} onClick={() => void run(async () => {
        const page = await requestApi(`${url}&cursor=${next}`,list);
        setRows([...(rows ?? []),...page.data]); setNext(page.meta?.nextCursor);
      })}>{text.more}</button>}
    </div>
    {selected && <form className="auth-form" key={selected.id} onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const clicked = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      const decision = clicked?.value === "approved" ? "approved" : "declined";
      void run(async () => {
        await command(`${path}/${selected.id}/decision`,"POST",{ decision, revision:selected.revision,
          ...(form.get("message") && { applicantMessage:form.get("message") }) },applicationSchema);
        setSelected(undefined); reload(generation + 1);
      });
    }}>
      <h2><bdi>{selected.displayName}</bdi></h2>
      <label>{text.message}<textarea name="message" rows={3} maxLength={1200} /></label>
      <button className="primary-button" value="approved" disabled={pending}>{text.approve}</button>
      <button className="plain-button" value="declined" disabled={pending}>{text.decline}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
