"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { sessionSchema, type Persona, type Locale } from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { dictionary, localizedError } from "@/i18n";
import { webHeaders } from "./SessionControls";

const labels = {
  ar: {
    security: "أمان الحساب", reset: "استعادة كلمة السر", activate: "تفعيل حساب الإدارة", verify: "التحقق بخطوتين",
    email: "البريد الإلكتروني", newEmail: "البريد الإلكتروني الجديد", newPassword: "كلمة السر الجديدة",
    currentPassword: "كلمة السر الحالية", send: "إرسال رابط", sent: "لو الحساب متاح، هيوصلك رابط على البريد الإلكتروني.",
    authApp: "امسح رمز QR بتطبيق المصادقة، ثم أدخل الرمز من ٦ أرقام.", code: "رمز تطبيق المصادقة",
    qrLabel: "رمز QR لإعداد التحقق بخطوتين", manualKey: "إدخال مفتاح الإعداد يدويًا",
    enroll: "إعداد تطبيق المصادقة", confirm: "تأكيد", signin: "تسجيل الدخول", verified: "تم التحقق",
    address: "تغيير البريد الإلكتروني", activated: "الحساب جاهز لتسجيل الدخول", expired: "الرابط غير متاح. اطلب رابطًا جديدًا.",
  },
  de: {
    security: "Kontosicherheit", reset: "Passwort zurücksetzen", activate: "Verwaltungskonto aktivieren", verify: "Zwei-Faktor-Verifizierung",
    email: "E-Mail-Adresse", newEmail: "Neue E-Mail-Adresse", newPassword: "Neues Passwort",
    currentPassword: "Aktuelles Passwort", send: "Link senden", sent: "Falls das Konto verfügbar ist, erhalten Sie einen Link per E-Mail.",
    authApp: "Scannen Sie den QR-Code mit Ihrer Authenticator-App und geben Sie den sechsstelligen Code ein.", code: "Authenticator-Code",
    qrLabel: "QR-Code für die Zwei-Faktor-Verifizierung", manualKey: "Einrichtungsschlüssel manuell eingeben",
    enroll: "Authenticator einrichten", confirm: "Bestätigen", signin: "Anmelden", verified: "Verifiziert",
    address: "E-Mail-Adresse ändern", activated: "Sie können sich jetzt anmelden", expired: "Der Link ist ungültig. Fordern Sie einen neuen Link an.",
  },
} as const;

const factor = z.object({ id: z.uuid(), status: z.enum(["verified", "unverified"]) });
const enrollment = z.object({
  id: z.uuid(), totp: z.object({ secret: z.string(), qrCode: z.string().startsWith("data:image/svg+xml;base64,") }),
});
const challenge = z.object({ challengeId: z.uuid() });
const accepted = z.object({ accepted: z.literal(true) });

function message(locale: Locale, error: unknown) {
  return error instanceof ApiResponseError ? localizedError(locale, error.messageKey) : dictionary(locale)["error.unavailable"];
}

function requestBody(body: unknown, persona?: Persona): RequestInit {
  return { method: "POST", headers: webHeaders(persona), body: JSON.stringify(body) };
}

export function RecoveryLink({ locale }: { locale: Locale }) {
  return <Link className="plain-button" href={`/${locale}/account/security/recover`}>{labels[locale].reset}</Link>;
}

export function EmailAction({ locale, action, token }: {
  locale: Locale;
  action: "recover" | "email" | "activate";
  token?: string;
}) {
  const text = labels[locale];
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState("");
  const requesting = action === "recover" && !token;
  const title = { recover: text.reset, email: text.address, activate: text.activate }[action];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    setPending(true);
    setFailure("");
    try {
      if (requesting) {
        await requestApi("/auth/recovery/request", accepted, requestBody({ email: input.get("email"), locale }));
      } else {
        const path = { recover: "recovery/complete", email: "email-change/confirm", activate: "bootstrap/complete" }[action];
        const response = await fetch(`/api/v1/auth/${path}`, requestBody({
          challenge: token, ...(action !== "email" && { newPassword: input.get("password") }),
        }));
        if (!response.ok) throw new ApiResponseError(response.status, "invalid_link",
          response.status >= 500 ? "error.unavailable" : "error.validation");
        history.replaceState(null, "", location.pathname);
      }
      setDone(true);
    } catch (error) {
      setFailure(message(locale, error));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-card">
      <h1>{title}</h1>
      {done ? (
        <div className="auth-form">
          <p role="status">{requesting ? text.sent : action === "email" ? text.verified : text.activated}</p>
          <Link href={`/${locale}/account/sign-in`}>{text.signin}</Link>
        </div>
      ) : (token || requesting) ? (
        <form className="auth-form" method="post" onSubmit={submit} aria-busy={pending}>
          {requesting && <label>{text.email}<input name="email" type="email" autoComplete="email" required /></label>}
          {token && action !== "email" && <label>{text.newPassword}<input name="password" type="password"
            autoComplete="new-password" minLength={12} maxLength={128} required /></label>}
          {failure && <p role="alert">{failure}</p>}
          <button className="primary-button" disabled={pending}>{requesting ? text.send : text.confirm}</button>
        </form>
      ) : <p role="alert">{text.expired}</p>}
    </section>
  );
}

export function AccountSecurity({ locale, persona, assured }: { locale: Locale; persona: Persona; assured: boolean }) {
  const text = labels[locale];
  const [factors, setFactors] = useState<z.infer<typeof factor>[] | null>(null);
  const [setup, setSetup] = useState<z.infer<typeof enrollment> | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [sent, setSent] = useState(false);
  const candidate = setup?.id ?? factors?.find((item) => item.status === "verified")?.id;
  const [reloadFactors, retryFactors] = useState(0);

  useEffect(() => {
    if (persona !== "admin") return;
    const controller = new AbortController();
    requestApi("/auth/mfa/factors", z.array(factor), { signal: controller.signal })
      .then(({ data }) => setFactors(data))
      .catch((error) => { if (!controller.signal.aborted) setFailure(message(locale, error)); });
    return () => controller.abort();
  }, [persona, reloadFactors]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setFailure("");
    try { await action(); } catch (error) { setFailure(message(locale, error)); }
    finally { setPending(false); }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!candidate) return;
    const code = new FormData(event.currentTarget).get("code");
    await run(async () => {
      const { data } = await requestApi("/auth/mfa/challenge", challenge, requestBody({ factorId: candidate }));
      await requestApi("/auth/mfa/verify", sessionSchema, requestBody({ challengeId: data.challengeId, code }));
      window.location.replace(`/${locale}/school/home`);
    });
  }

  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    await run(async () => {
      await requestApi("/auth/email-change", accepted, requestBody({
        newEmail: input.get("email"), reauthProof: input.get("password"),
      }, persona));
      setSent(true);
    });
  }

  return (
    <section className="auth-card">
      <h1>{text.security}</h1>
      {persona === "admin" && (
        <section className="auth-form">
          <h2>{text.verify}</h2>
          {assured && <p role="status">{text.verified}</p>}
          {factors === null && failure && <button className="plain-button" onClick={() => retryFactors(reloadFactors + 1)}>{dictionary(locale).retry}</button>}
          {!candidate && factors && <button className="primary-button" disabled={pending} onClick={() => void run(async () => {
            setSetup((await requestApi("/auth/mfa/enroll", enrollment, requestBody({}))).data);
          })}>{text.enroll}</button>}
          {setup && <div>
            <p>{text.authApp}</p>
            <Image src={setup.totp.qrCode} alt={text.qrLabel} width={240} height={240} unoptimized className="auth-qr" />
            <details><summary>{text.manualKey}</summary><bdi dir="ltr">{setup.totp.secret}</bdi></details>
          </div>}
          {candidate && <form className="auth-form" method="post" onSubmit={verify}>
            <label>{text.code}<input name="code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
            <button className="primary-button" disabled={pending}>{text.confirm}</button>
          </form>}
        </section>
      )}
      {(persona !== "admin" || assured) && <form className="auth-form" method="post" onSubmit={changeEmail}>
        <h2>{text.address}</h2>
        <label>{text.newEmail}<input name="email" type="email" dir="ltr" autoComplete="email" required /></label>
        <label>{text.currentPassword}<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="primary-button" disabled={pending || sent}>{text.send}</button>
        {sent && <p role="status">{text.sent}</p>}
      </form>}
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}
