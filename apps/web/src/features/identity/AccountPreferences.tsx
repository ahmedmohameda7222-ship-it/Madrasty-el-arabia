"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { appearanceSchema, preferencesSchema, type Locale, type Preferences } from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { usePresentationLanguage } from "@/ui/PresentationLanguage";
import { PushPreferences } from "@/features/comms/NotificationCenter";

const words = {
  ar: {
    title: "تفضيلات الحساب", ui: "لغة التطبيق", mail: "لغة مراسلات المدرسة", theme: "المظهر",
    system: "حسب الجهاز", light: "فاتح", dark: "داكن", save: "حفظ التفضيلات", notifications: "إشعارات الجهاز",
    notificationsPending: "تفعيل إشعارات هذا الجهاز غير متاح حاليًا.", security: "أمان الحساب",
    refresh: "تحديث التفضيلات",
  },
  de: {
    title: "Kontoeinstellungen", ui: "App-Sprache", mail: "Sprache für Schulmitteilungen", theme: "Darstellung",
    system: "Geräteeinstellung", light: "Hell", dark: "Dunkel", save: "Einstellungen speichern", notifications: "Gerätebenachrichtigungen",
    notificationsPending: "Benachrichtigungen für dieses Gerät sind derzeit nicht verfügbar.", security: "Kontosicherheit",
    refresh: "Einstellungen aktualisieren",
  },
} as const;

export function AccountPreferences({ locale, initial }: { locale: Locale; initial: Preferences }) {
  const labels = words[locale], text = dictionary(locale), actor = useAccountScope();
  const {select:selectLanguage}=usePresentationLanguage();
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ failed: boolean; message: string }>();
  const [stale, setStale] = useState(false);
  const command = useSchoolCommand(actor.persona);

  async function operation(action: () => Promise<void>) {
    setPending(true);
    setFeedback(undefined);
    try { await action(); }
    catch (error) {
      const message = error instanceof ApiResponseError ? localizedError(locale,error.messageKey) : text["error.unavailable"];
      setStale(error instanceof ApiResponseError && error.code === "stale_revision");
      setFeedback({ failed: true, message });
    } finally { setPending(false); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void operation(async () => {
      const next = await command("/account/preferences","PATCH",value,preferencesSchema);
      if (next.uiLocale !== locale) selectLanguage(next.uiLocale);
      document.documentElement.dataset.theme = next.theme;
      setValue(next);
      setFeedback({ failed: false, message: text.saved });
    });
  }

  return <>
    <h1>{labels.title}</h1>
    <div className="calendar-layout">
      <section className="auth-card">
        <form className="auth-form" onSubmit={save} aria-busy={pending}>
          <label>{labels.ui}<select value={value.uiLocale}
            onChange={(event)=>setValue({ ...value, uiLocale: event.target.value as Locale })}>
            <option value="ar" lang="ar">العربية</option><option value="de" lang="de">Deutsch</option>
          </select></label>
          <label>{labels.mail}<select value={value.correspondenceLocale}
            onChange={(event)=>setValue({ ...value, correspondenceLocale: event.target.value as Locale })}>
            <option value="ar" lang="ar">العربية</option><option value="de" lang="de">Deutsch</option>
          </select></label>
          <label>{labels.theme}<select value={value.theme} onChange={(event)=>
            setValue({ ...value, theme: appearanceSchema.parse(event.target.value) })}>
            {appearanceSchema.options.map((theme)=><option key={theme} value={theme}>{labels[theme]}</option>)}
          </select></label>
          <button type="submit" className="primary-button" disabled={pending || stale}>{labels.save}</button>
          {stale && <button type="button" className="plain-button" disabled={pending} onClick={()=>void operation(async()=>{
            const result=await requestApi(`/account/preferences?locale=${locale}`,preferencesSchema,{
              headers:{"X-School-Persona":actor.persona},
            });
            setStale(false);
            setValue(result.data);
          })}>{labels.refresh}</button>}
          {feedback && <p role={feedback.failed ? "alert" : "status"}>{feedback.message}</p>}
        </form>
      </section>
      <section className="auth-card">
        <PushPreferences locale={locale}/>
        <Link className="plain-button" href={`/${locale}/account/security`}>{labels.security}</Link>
      </section>
    </div>
  </>;
}
