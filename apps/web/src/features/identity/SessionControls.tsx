"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { preferencesSchema, sessionSchema, type Locale, type SchoolSession, type Persona } from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { dictionary, localizedError } from "@/i18n";
import { discardAttendanceDrafts } from "@/features/attendance/draft-store";
import { detachBrowserPush } from "@/features/comms/push-device";
import { webHeaders } from "@/api/client-headers";
export { webHeaders } from "@/api/client-headers";

const labels = {
  ar: { signIn: "تسجيل الدخول", email: "البريد الإلكتروني", password: "كلمة السر", show: "إظهار", hide: "إخفاء",
    signOut: "تسجيل الخروج", all: "تسجيل الخروج من كل الأجهزة", switch: "تغيير الدور", unsent: "تسجيل الخروج قد يحذف المسودات غير المرسلة. هل تريد المتابعة؟", revoked: "الخروج من الأجهزة ينتظر اتصال الخادم." },
  de: { signIn: "Anmelden", email: "E-Mail-Adresse", password: "Passwort", show: "Anzeigen", hide: "Verbergen",
    signOut: "Abmelden", all: "Von allen Geräten abmelden", switch: "Rolle wechseln", unsent: "Beim Abmelden können ungesendete Entwürfe verloren gehen. Möchten Sie fortfahren?", revoked: "Die Abmeldung wartet auf eine Verbindung zum Server." },
} as const;


function pendingLogout() {
  const flag = document.cookie.split(";").map((part) => part.trim()).find((part) =>
    part.startsWith("__Host-madrasty-locked=") || part.startsWith("madrasty-locked="))?.split("=")[1];
  return flag === "current" ? false : flag === "all" ? true : null;
}

async function revokeWebSession(allDevices: boolean) {
  const response = await fetch("/api/v1/auth/sign-out", {
    method: "POST", headers: webHeaders(), body: JSON.stringify({ allDevices }),
    cache: "no-store", credentials: "same-origin",
  });
  if (response.status !== 204) throw new Error("sign-out incomplete");
}
function errorText(locale: Locale, error: unknown) {
  return error instanceof ApiResponseError
    ? localizedError(locale, error.messageKey)
    : dictionary(locale)["error.unavailable"];
}

async function preferredDestination(locale: Locale, destination: string) {
  try {
    const { data } = await requestApi(`/account/preferences?locale=${locale}`, preferencesSchema);
    return destination.replace(/^\/(ar|de)\//, `/${data.uiLocale}/`);
  } catch {
    return destination;
  }
}

export function SignInForm({ locale, destination, refreshable }: { locale: Locale; destination: string; refreshable: boolean }) {
  const text = labels[locale];
  const router = useRouter();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [pending, setPending] = useState(refreshable);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    let active = true;
    setHydrated(true);
    const revoke = pendingLogout();
    const connect = () => {
      if (revoke !== null) {
        setPending(true);
        void revokeWebSession(revoke)
          .then(() => { if (active) { setPending(false); setFailure(""); } })
          .catch(() => { if (active) setFailure(text.revoked); });
      } else if (refreshable) {
        requestApi("/auth/session", sessionSchema, { method: "POST", headers: webHeaders() })
          .then(() => preferredDestination(locale, destination))
          .then((next) => { if (active) router.replace(next); })
          .catch(() => { if (active) setPending(false); });
      }
    };
    connect();
    window.addEventListener("online", connect);
    return () => { active = false; window.removeEventListener("online", connect); };
  }, [destination, locale, refreshable, router, text.revoked]);


  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setFailure("");
    try {
      await requestApi("/auth/sign-in", sessionSchema, {
        method: "POST", headers: webHeaders(),
        body: JSON.stringify({ email: String(fields.get("email")).trim(), password: fields.get("password") }),
      });
      window.location.replace(await preferredDestination(locale, destination));
    } catch (error) {
      setFailure(errorText(locale, error));
      setPending(false);
    }
  }

  return (
    <section className="auth-card">
      <h1>{text.signIn}</h1>
      <form className="auth-form" method="post" onSubmit={submit} aria-busy={!hydrated || pending}>
        <label htmlFor="email">{text.email}</label>
        <input id="email" name="email" dir="ltr" inputMode="email" type="email" autoComplete="username" required maxLength={254} />
        <label htmlFor="password">{text.password}</label>
        <div className="password-controls">
          <input id="password" name="password" dir="ltr" type={passwordVisible ? "text" : "password"}
            autoComplete="current-password" required maxLength={1024} aria-describedby={failure ? "sign-in-error" : undefined} />
          <button type="button" className="plain-button" aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible(!passwordVisible)}>{passwordVisible ? text.hide : text.show}</button>
        </div>
        {failure && <p id="sign-in-error" role="alert">{failure}</p>}
        <button className="primary-button" type="submit" disabled={!hydrated || pending}>
          {pending ? dictionary(locale).loading : text.signIn}
        </button>
      </form>
    </section>
  );
}

export function SessionControls({ locale, session }: { locale: Locale; session: SchoolSession }) {
  const text = labels[locale];
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [revocation, setRevocation] = useState<boolean | null>(null);

  async function switchPersona(persona: Persona) {
    if (persona === session.activePersona) return;
    setPending(true);
    setError("");
    try {
      await requestApi("/auth/persona", sessionSchema, {
        method: "POST", headers: webHeaders(session.activePersona), body: JSON.stringify({ persona }),
      });
      await Promise.allSettled([discardAttendanceDrafts(),detachBrowserPush(false)]);
      window.location.replace(`/${locale}/school/home`);
    } catch (cause) {
      setError(errorText(locale, cause));
      setPending(false);
    }
  }

  async function completeSignOut(allDevices: boolean) {
    try {
      await revokeWebSession(allDevices);
      window.location.replace(`/${locale}/account/sign-in`);
    } catch {
      setError(text.revoked);
    }
  }

  useEffect(() => {
    if (revocation === null) return;
    const retry = () => { void completeSignOut(revocation); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  });

  const signOut = (allDevices: boolean) => {
    if (!window.confirm(text.unsent)) return;
    const secure = window.location.protocol === "https:";
    document.cookie = `${secure ? "__Host-" : ""}madrasty-locked=${allDevices ? "all" : "current"}; Path=/; SameSite=Strict; Max-Age=2592000${secure ? "; Secure" : ""}`;
    setSigningOut(true);
    setRevocation(allDevices);
    void detachBrowserPush().catch(()=>undefined);
    void discardAttendanceDrafts().finally(()=>completeSignOut(allDevices));
  };

  return (
    <div className="session-controls">
      {!signingOut && session.personas.length > 1 && (
        <label>{text.switch}
          <select value={session.activePersona} disabled={pending}
            onChange={(event) => void switchPersona(event.target.value as Persona)}>
            {session.personas.map((persona) => <option key={persona} value={persona}>{dictionary(locale)[persona]}</option>)}
          </select>
        </label>
      )}
      {!signingOut && (
        <div className="header-actions">
          <button type="button" className="plain-button" disabled={pending} onClick={() => signOut(false)}>{text.signOut}</button>
          <button type="button" className="plain-button" disabled={pending} onClick={() => signOut(true)}>{text.all}</button>
        </div>
      )}
      {signingOut && revocation !== null && (
        <button type="button" className="plain-button" onClick={() => void completeSignOut(revocation)}>{dictionary(locale).retry}</button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
