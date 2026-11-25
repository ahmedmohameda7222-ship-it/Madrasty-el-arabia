"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  accessEditSchema, accessSummarySchema, accessTargetsSchema, capabilityKeys, inboxSchema,
  type AccessEdit, type AccessSummary, type Locale,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { dictionary, localizedError } from "@/i18n";
import { webHeaders } from "./SessionControls";

const names = {
  "access.manage": [
    "إدارة الصلاحيات",
    "Berechtigungen verwalten"
  ],
  "school.manage": [
    "إعدادات المدرسة والفصول",
    "Schule und Klassen verwalten"
  ],
  "students.manage": [
    "شؤون الطلبة والأسر",
    "Schüler und Familien verwalten"
  ],
  "staff.invite": [
    "دعوات المدرسين",
    "Lehrkräfte einladen"
  ],
  "attendance.supervise": [
    "الإشراف على الحضور",
    "Anwesenheit beaufsichtigen"
  ],
  "academics.supervise": [
    "الإشراف على التعليم والنتائج",
    "Unterricht und Ergebnisse beaufsichtigen"
  ],
  "comms.publish": [
    "النشر والإعلانات",
    "Ankündigungen veröffentlichen"
  ],
  "finance.read": [
    "عرض حسابات الرسوم",
    "Gebührenkonten einsehen"
  ],
  "finance.issue": [
    "إصدار الفواتير",
    "Rechnungen ausstellen"
  ],
  "finance.post": [
    "تسجيل المدفوعات",
    "Zahlungen erfassen"
  ],
  "finance.export": [
    "تصدير الحسابات",
    "Abrechnungen exportieren"
  ],
  "bank.configure": [
    "تغيير حساب التحصيل",
    "Zahlungskonto ändern"
  ],
  "student_affairs": [
    "صندوق شؤون الطلبة",
    "Postfach Schulbüro"
  ],
  "accounts": [
    "صندوق الحسابات",
    "Postfach Buchhaltung"
  ]
} as const;

const copy = {
  ar: { title: "إدارة الصلاحيات", person: "اختر شخصًا", roles: "الأدوار", grants: "الصلاحيات", inboxes: "الصناديق الرسمية",
    save: "حفظ الصلاحيات", enabled: "التحقق بخطوتين مفعّل", disabled: "التحقق بخطوتين غير مفعّل", next: "المزيد",
    refresh: "حدّث رمز التحقق", since: "بداية الصلاحية", until: "انتهاء الصلاحية", staff: "تعطيل صلاحيات الإدارة أو التدريس",
    account: "تعطيل الحساب بالكامل", reason: "سبب التعطيل", confirm: "تأكيد التعطيل", success: "تم حفظ التغييرات",
    scope: "تعطيل صلاحيات الإدارة أو التدريس يُبقي صلاحية ولي الأمر لو موجودة." },
  de: { title: "Berechtigungen verwalten", person: "Person auswählen", roles: "Rollen", grants: "Berechtigungen", inboxes: "Offizielle Postfächer",
    save: "Berechtigungen speichern", enabled: "Zweiter Faktor eingerichtet", disabled: "Zweiter Faktor fehlt", next: "Weitere",
    refresh: "Zweiten Faktor erneut bestätigen", since: "Gültig ab", until: "Gültig bis", staff: "Admin- oder Lehrkraftzugriff deaktivieren",
    account: "Gesamtes Konto deaktivieren", reason: "Grund", confirm: "Deaktivierung bestätigen", success: "Änderungen gespeichert",
    scope: "Beim Entzug des Admin- oder Lehrkraftzugriffs bleibt eine bestehende Elternrolle erhalten." },
} as const;

type DateFields = { validFrom: string; validUntil: string | null };
type Dated<K extends string> = DateFields & { key: K };

function toggle<K extends string>(items: Dated<K>[], key: K): Dated<K>[] {
  if (items.some((item) => item.key === key)) return items.filter((item) => item.key !== key);
  return [...items, { key, validFrom: new Date().toISOString(), validUntil: null }];
}

function localInput(value: string | null) {
  if (value === null) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function StaffAccess({ locale, ownAccount }: { locale: Locale; ownAccount: string }) {
  const text = copy[locale];
  const localized = dictionary(locale);
  const label = (key: keyof typeof names) => names[key][locale === "ar" ? 0 : 1];
  const [people, setPeople] = useState<z.infer<typeof accessTargetsSchema>>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [target, setTarget] = useState("");
  const [summary, setSummary] = useState<AccessSummary | null>(null);
  const [edit, setEdit] = useState<AccessEdit | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [deactivation, setDeactivation] = useState<"staff" | "account" | null>(null);

  function report(error: unknown) {
    setFailure(error instanceof ApiResponseError ? localizedError(locale, error.messageKey) : localized["error.unavailable"]);
  }

  async function loadMore() {
    if (!cursor) return;
    setBusy(true);
    try {
      const result = await requestApi(`/staff/access-targets?cursor=${encodeURIComponent(cursor)}`, accessTargetsSchema);
      setPeople((previous) => [...previous, ...result.data]);
      setCursor(result.meta?.nextCursor);
    } catch (error) { report(error); } finally { setBusy(false); }
  }

  useEffect(() => {
    const abort = new AbortController();
    requestApi("/staff/access-targets", accessTargetsSchema, { signal: abort.signal }).then((result) => {
      setPeople(result.data);
      setCursor(result.meta?.nextCursor);
    }).catch((error) => {
      if (!abort.signal.aborted) setFailure(error instanceof ApiResponseError ? localizedError(locale, error.messageKey) : dictionary(locale)["error.unavailable"]);
    });
    return () => abort.abort();
  }, [locale]);

  useEffect(() => {
    if (!target) return;
    const abort = new AbortController();
    requestApi(`/staff/${target}/grants`, accessSummarySchema, { signal: abort.signal }).then(({ data }) => {
      setSummary(data);
      setEdit(data);
    }).catch((error) => {
      if (!abort.signal.aborted) setFailure(error instanceof ApiResponseError ? localizedError(locale, error.messageKey) : dictionary(locale)["error.unavailable"]);
    });
    return () => abort.abort();
  }, [locale, target]);

  const select = (id: string) => {
    setSummary(null);
    setEdit(null);
    setDeactivation(null);
    setFailure("");
    setMessage("");
    setTarget(id);
  };

  const save = async () => {
    if (!edit || !target) return;
    const validated = accessEditSchema.safeParse(edit);
    if (!validated.success) { setFailure(localized["error.validation"]); return; }
    setBusy(true);
    setFailure("");
    try {
      const { data } = await requestApi(`/staff/${target}/grants`, accessSummarySchema, {
        method: "PATCH", headers: webHeaders("admin"), body: JSON.stringify(validated.data),
      });
      setSummary(data);
      setEdit(data);
      setMessage(text.success);
    } catch (error) { report(error); }
    finally { setBusy(false); }
  };

  const deactivate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!summary || !deactivation) return;
    const reason = new FormData(event.currentTarget).get("reason");
    setBusy(true);
    setFailure("");
    try {
      await requestApi(`/staff/${target}/deactivate`, z.object({ revision: z.number() }), {
        method: "POST", headers: webHeaders("admin"),
        body: JSON.stringify({ scope: deactivation, reason, revision: summary.revision }),
      });
      select("");
      setMessage(text.success);
    } catch (error) { report(error); }
    finally { setBusy(false); }
  };

  const accessName = label("access.manage");
  return (
    <section className="auth-card" aria-busy={busy}>
      <h1>{text.title}</h1>
      <div className="auth-form">
        <label>{text.person}
          <select value={target} onChange={(event) => select(event.target.value)} disabled={busy}>
            <option value="">{text.person}</option>
            {people.map(({ accountId, email }) => <option key={accountId} value={accountId}>{email ?? accountId}</option>)}
          </select>
        </label>
        {cursor && <button type="button" className="plain-button" disabled={busy} onClick={loadMore}>{text.next}</button>}
        {summary && edit && (
          <>
            <p>{summary.verifiedMfa ? text.enabled : text.disabled}</p>
            <fieldset disabled={busy || ownAccount === target}>
              <legend>{text.roles}</legend>
              {(["admin", "teacher", "guardian"] as const).map((persona) => (
                <label className="access-check" key={persona}>
                  <input type="checkbox" checked={edit.personas.includes(persona)} disabled={persona === "guardian"}
                    onChange={(event) => setEdit({ ...edit, personas: event.target.checked ? [...edit.personas, persona] : edit.personas.filter((role) => role !== persona),
                      ...(persona === "admin" && !event.target.checked && { capabilities: [], inboxAssignments: [] }) })} />
                  {localized[persona]}
                </label>
              ))}
            </fieldset>
            {edit.personas.includes("admin") && (
              <>
                <fieldset disabled={busy || ownAccount === target}>
                  <legend>{text.grants}</legend>
                  {capabilityKeys.map((key) => {
                    const item = edit.capabilities.find((grant) => grant.key === key);
                    return (
                      <div className="access-item" key={key}>
                        <label className="access-check">
                          <input type="checkbox" checked={item !== undefined} disabled={key === "access.manage" && !summary.verifiedMfa && !item}
                            onChange={() => setEdit({ ...edit, capabilities: toggle(edit.capabilities, key) })} />
                          {key === "access.manage" ? accessName : label(key)}
                        </label>
                        {item && key !== "access.manage" && <Dates fields={item} since={text.since} until={text.until} onChange={(dates) =>
                          setEdit({ ...edit, capabilities: edit.capabilities.map((grant) => grant.key === key ? { ...grant, ...dates } : grant) })} />}
                      </div>
                    );
                  })}
                </fieldset>
                <fieldset disabled={busy || ownAccount === target}>
                  <legend>{text.inboxes}</legend>
                  {inboxSchema.options.map((key) => {
                    const item = edit.inboxAssignments.find((grant) => grant.key === key);
                    return <div className="access-item" key={key}>
                      <label className="access-check"><input type="checkbox" checked={item !== undefined}
                        onChange={() => setEdit({ ...edit, inboxAssignments: toggle(edit.inboxAssignments, key) })} />{label(key)}</label>
                      {item && <Dates fields={item} since={text.since} until={text.until} onChange={(dates) =>
                        setEdit({ ...edit, inboxAssignments: edit.inboxAssignments.map((grant) => grant.key === key ? { ...grant, ...dates } : grant) })} />}
                    </div>;
                  })}
                </fieldset>
              </>
            )}
            <Link className="plain-button" href={`/${locale}/account/security`}>{text.refresh}</Link>
            <button className="primary-button" type="button" disabled={busy || ownAccount === target} onClick={save}>{text.save}</button>
            {ownAccount !== target && (
              <div className="header-actions">
                <button className="plain-button" type="button" disabled={busy} onClick={() => setDeactivation("staff")}>{text.staff}</button>
                <button className="plain-button" type="button" disabled={busy} onClick={() => setDeactivation("account")}>{text.account}</button>
              </div>
            )}
            {deactivation && (
              <form className="auth-form" onSubmit={deactivate}>
                <h2>{deactivation === "staff" ? text.staff : text.account}</h2>
                {deactivation === "staff" && <p>{text.scope}</p>}
                <label>{text.reason}<input name="reason" required minLength={4} maxLength={400} /></label>
                <button className="primary-button" disabled={busy}>{text.confirm}</button>
                <button className="plain-button" type="button" onClick={() => setDeactivation(null)}>{localized.close}</button>
              </form>
            )}
          </>
        )}
        {failure && <p role="alert">{failure}</p>}
        {message && <p role="status">{message}</p>}
      </div>
    </section>
  );
}

function Dates({ fields, since, until, onChange }: {
  fields: DateFields; since: string; until: string; onChange: (next: DateFields) => void;
}) {
  return (
    <div className="access-dates">
      <label>{since}<input type="datetime-local" value={localInput(fields.validFrom)}
        onChange={(event) => { if (event.target.value) onChange({ ...fields, validFrom: new Date(event.target.value).toISOString() }); }} /></label>
      <label>{until}<input type="datetime-local" value={localInput(fields.validUntil)}
        onChange={(event) => onChange({ ...fields, validUntil: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
    </div>
  );
}
