"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  activatedInvitationSchema, batchChoiceSchema, batchOutputSchema, invitationSchema, invitationToken,
  providerInviteProof, type Invitation, type Locale,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { webHeaders } from "./SessionControls";

const names = {
  ar: {
    title: "الدعوات", invited: "دعوة إلى مدرستي العربية", continue: "متابعة الدعوة",
    newPassword: "كلمة سر جديدة", repeat: "تأكيد كلمة السر", activate: "تفعيل الحساب",
    current: "عندي حساب بالفعل", email: "البريد الإلكتروني", password: "كلمة السر", verify: "تأكيد الدعوة",
    expired: "الدعوة غير متاحة. تواصل مع المدرسة لطلب رابط جديد.", success: "تم تفعيل الدعوة. سجّل الدخول للمتابعة.",
    signIn: "تسجيل الدخول", mismatch: "كلمتا السر غير متطابقتين.",
    staff: "دعوة مدرس", name: "الاسم", language: "لغة المراسلات", send: "جدولة إرسال الدعوة",
    guardian: "ولي أمر", teacher: "مدرس", batch: "دعوات ملف الأسر", select: "اختر المستلمين",
    pending: "صالحة للتفعيل", expiredState: "منتهية", replaced: "مستبدلة", revoked: "ملغاة", activated: "مفعّلة",
    queued: "في قائمة الإرسال", sent: "قبلها مزود البريد", bounced: "ارتدت", ready: "جاهزة", any: "الكل",
    reissue: "إعادة إصدار", correct: "عنوان مصحح (اختياري)", save: "تأكيد", more: "عرض المزيد",
    done: "تمت جدولة الدعوة.", batchQueued: "دعوات جديدة", alreadyPending: "دعوات صالحة موجودة بالفعل",
  },
  de: {
    title: "Einladungen", invited: "Einladung zu Madrasty El Arabia", continue: "Einladung öffnen",
    newPassword: "Neues Passwort", repeat: "Passwort bestätigen", activate: "Konto aktivieren",
    current: "Ich habe bereits ein Konto", email: "E-Mail-Adresse", password: "Passwort", verify: "Einladung bestätigen",
    expired: "Die Einladung ist nicht verfügbar. Bitten Sie die Schule um einen neuen Link.",
    success: "Die Einladung wurde aktiviert. Melden Sie sich an.",
    signIn: "Anmelden", mismatch: "Die Passwörter stimmen nicht überein.",
    staff: "Lehrkraft einladen", name: "Name", language: "Sprache für Mitteilungen", send: "Einladung zum Versand vormerken",
    guardian: "Sorgeberechtigte", teacher: "Lehrkraft", batch: "Einladungen aus dem Familienimport", select: "Empfänger auswählen",
    pending: "Aktivierbar", expiredState: "Abgelaufen", replaced: "Ersetzt", revoked: "Widerrufen", activated: "Aktiviert",
    queued: "In der Warteschlange", sent: "Vom E-Mail-Anbieter angenommen", bounced: "Unzustellbar", ready: "Bereit", any: "Alle",
    reissue: "Neu ausstellen", correct: "Korrigierte Adresse (optional)", save: "Bestätigen", more: "Weitere anzeigen",
    done: "Die Einladung wurde vorgemerkt.", batchQueued: "Neue Einladungen", alreadyPending: "Gültige Einladungen vorhanden",
  },
} as const;

function failure(locale: Locale, error: unknown) {
  return error instanceof ApiResponseError ? localizedError(locale, error.messageKey) : dictionary(locale)["error.unavailable"];
}

export function InvitationLanding({ locale }: { locale: Locale }) {
  const text = names[locale];
  const [initialized, setInitialized] = useState(false);
  const [secret, setSecret] = useState<{ token: string; proof?: string }>();
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<string | undefined>(undefined);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = invitationToken.safeParse(params.get("token"));
    const proof = providerInviteProof.safeParse(params.get("proof"));
    if (token.success) setSecret({ token: token.data, proof: proof.success ? proof.data : undefined });
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
    setInitialized(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!secret) return;
    const fields = new FormData(event.currentTarget);
    if (!existing && fields.get("password") !== fields.get("repeat")) { setError(text.mismatch); return; }
    const key = attempt.current ?? crypto.randomUUID();
    attempt.current = key;
    setPending(true); setError("");
    try {
      await requestApi(existing || !secret.proof ? "/invitations/existing" : "/invitations/activate",
        activatedInvitationSchema, {
          method: "POST", headers: { ...webHeaders(), "Idempotency-Key": key },
          body: JSON.stringify({ token: secret.token, password: fields.get("password"),
            ...(existing || !secret.proof ? { email: fields.get("email") } : { proof: secret.proof }) }),
        });
      setSecret(undefined);
      setCompleted(true);
    } catch (cause) {
      if (cause instanceof ApiResponseError && [401,403,404].includes(cause.status)) setError(text.expired);
      else setError(failure(locale, cause));
    } finally { setPending(false); }
  }

  const signin = <Link className="plain-button" href={`/${locale}/account/sign-in`}>{text.signIn}</Link>;
  return <section className="auth-card">
    <h1>{text.invited}</h1>
    {completed ? <div className="auth-form"><p role="status">{text.success}</p>{signin}</div>
      : !initialized ? <p role="status">{dictionary(locale).loading}</p>
      : !secret ? <div className="auth-form"><p>{text.expired}</p>{signin}</div>
      : !open ? <button className="primary-button" onClick={() => { setOpen(true); setExisting(!secret.proof); }}>{text.continue}</button>
      : <div className="auth-form">
        <form className="auth-form" onSubmit={submit} aria-busy={pending} key={String(existing)}>
          {existing && <label>{text.email}<input name="email" type="email" dir="ltr" required autoComplete="username" /></label>}
          <label>{existing ? text.password : text.newPassword}<input name="password" type="password" required
            minLength={existing ? 1 : 12} maxLength={existing ? 1024 : 128} autoComplete={existing ? "current-password" : "new-password"} /></label>
          {!existing && <label>{text.repeat}<input name="repeat" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>}
          {error && <p role="alert">{error}</p>}
          <button className="primary-button" disabled={pending}>{existing ? text.verify : text.activate}</button>
        </form>
        {!existing && <button className="plain-button" disabled={pending} onClick={() => { setExisting(true); setError(""); }}>{text.current}</button>}
      </div>}
  </section>;
}

const list = invitationSchema.array();
const choices = batchChoiceSchema.array();

export function InviteWorkspace({ locale, guardians, teachers, batchId, invitationId }: {
  locale: Locale; guardians: boolean; teachers: boolean; batchId?: string; invitationId?: string;
}) {
  const text = names[locale], command = useAdminCommand();
  const [rows, setRows] = useState<Invitation[]>([]);
  const [available, setAvailable] = useState<import("zod").infer<typeof choices>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [next, setNext] = useState<string>();
  const [recipientNext, setRecipientNext] = useState<string>();
  const [filter, setFilter] = useState("");
  const [generation, setGeneration] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [change, setChange] = useState<Invitation>();

  const endpoint = `/invitations?limit=25${invitationId ? `&id=${invitationId}` : ""}${filter ? `&status=${filter}` : ""}${batchId ? `&batchId=${batchId}` : ""}` as const;
  useEffect(() => {
    const cancel = new AbortController();
    requestApi(endpoint, list, { signal: cancel.signal }).then(({ data, meta }) => { setRows(data); setNext(meta?.nextCursor); })
      .catch((error) => { if (!cancel.signal.aborted) setError(failure(locale,error)); });
    if (batchId && guardians) requestApi(`/invitations/batches/${batchId}?limit=50`, choices, { signal: cancel.signal })
      .then(({ data, meta }) => { setAvailable(data); setRecipientNext(meta?.nextCursor); })
      .catch((error) => { if (!cancel.signal.aborted) setError(failure(locale,error)); });
    return () => cancel.abort();
  }, [batchId, endpoint, guardians, generation, locale]);

  async function run(action: () => Promise<void>) {
    setPending(true); setError(""); setSaved("");
    try { await action(); }
    catch (cause) { setError(failure(locale, cause)); }
    finally { setPending(false); }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await command("/invitations/teachers", "POST", {
        name: form.get("name"), email: form.get("email"), locale: form.get("locale"),
      }, invitationSchema);
      setGeneration(generation + 1); setSaved(text.done);
    });
  }

  const status = (row: Invitation) => row.validity === "expired" ? text.expiredState : text[row.validity];

  return <>
    <h1>{text.title}</h1>
    {batchId && guardians && <section className="auth-card">
      <h2>{text.batch}</h2><p>{text.select}</p>
      <div className="auth-form">{available.map((option) => <label key={option.id} className="access-check">
        <input type="checkbox" checked={selected.includes(option.id)} disabled={pending}
          onChange={(event) => setSelected(event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))} />
        <bdi>{option.name}</bdi><bdi dir="ltr">{option.email}</bdi><bdi>{option.locale}</bdi>
      </label>)}</div>
      {recipientNext && <button className="plain-button" disabled={pending} onClick={() => void run(async () => {
        const page = await requestApi(`/invitations/batches/${batchId}?cursor=${recipientNext}&limit=50`, choices);
        setAvailable([...available, ...page.data]); setRecipientNext(page.meta?.nextCursor);
      })}>{text.more}</button>}
      <button className="primary-button" disabled={pending || selected.length === 0 || selected.length > 100} onClick={() => void run(async () => {
        const receipt = await command("/invitations/batches", "POST", { committedBatchId: batchId, recipientIds: selected }, batchOutputSchema);
        setSelected([]); setGeneration(generation + 1);
        setSaved(`${text.batchQueued} ${receipt.issued} · ${text.alreadyPending} ${receipt.alreadyPending}`);
      })}>{text.send} · {selected.length}</button>
    </section>}

    {teachers && !batchId && <section className="auth-card"><h2>{text.staff}</h2>
      <form className="auth-form" onSubmit={create}>
        <label>{text.name}<input name="name" required maxLength={200} /></label>
        <label>{text.email}<input name="email" dir="ltr" type="email" required /></label>
        <label>{text.language}<select name="locale" defaultValue={locale}><option value="ar">العربية</option><option value="de">Deutsch</option></select></label>
        <button className="primary-button" disabled={pending}>{text.send}</button>
      </form>
    </section>}

    <section className="auth-card">
      <div className="auth-form">
        <label>{dictionary(locale).more}<select aria-label={text.title} value={filter} onChange={(event) => {
          setRows([]); setFilter(event.target.value); setChange(undefined);
        }}>
          <option value="">{text.any}</option>
          {(["pending","expired","replaced","revoked","activated"] as const).map((value) =>
            <option key={value} value={value}>{value === "expired" ? text.expiredState : text[value]}</option>)}
        </select></label>
        {rows.length === 0 && <p>{dictionary(locale).empty}</p>}
        <ul className="group-list">{rows.map((row) => <li key={row.id} className="group-row">
          <bdi dir="ltr">{row.email}</bdi><span>{text[row.kind]} · {status(row)} · {text[row.delivery]}</span>
          {["pending","expired"].includes(row.validity) && <button className="plain-button" disabled={pending} onClick={() => setChange(row)}>{text.reissue}</button>}
        </li>)}</ul>
        {next && <button className="plain-button" disabled={pending} onClick={() => void run(async () => {
          const page = await requestApi(`${endpoint}&cursor=${next}`, list);
          setRows([...rows, ...page.data]); setNext(page.meta?.nextCursor);
        })}>{text.more}</button>}
      </div>
      {change && <form className="auth-form" key={change.id} onSubmit={(event) => {
        event.preventDefault();
        const input = new FormData(event.currentTarget).get("email");
        void run(async () => {
          await command(`/invitations/${change.id}/reissue`, "POST",
            { revision: change.revision, ...(input && { correctedEmail: input }) }, invitationSchema);
          setChange(undefined); setSaved(text.done); setGeneration(generation + 1);
        });
      }}>
        <h2>{text.reissue}</h2>
        <p><bdi dir="ltr">{change.email}</bdi></p>
        <label>{text.correct}<input name="email" type="email" dir="ltr" /></label>
        <button className="primary-button" disabled={pending}>{text.save}</button>
        <button type="button" className="plain-button" onClick={() => setChange(undefined)}>{dictionary(locale).close}</button>
      </form>}
    </section>
    {error && <p role="alert">{error}</p>}
    {saved && <p role="status">{saved}</p>}
  </>;
}

export function InviteGuardianButton({ locale, id, correspondenceLocale }: { locale: Locale; id: string; correspondenceLocale: Locale }) {
  const text = names[locale], send = useAdminCommand();
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  return <>
    <button className="plain-button" disabled={working} onClick={() => {
      setWorking(true); setStatus(""); setError("");
      void send("/invitations", "POST", { recipientId: id, kind: "guardian", locale: correspondenceLocale }, invitationSchema)
        .then(() => setStatus(text.done)).catch((cause) => setError(failure(locale, cause))).finally(() => setWorking(false));
    }}>{text.send}</button>
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
  </>;
}
