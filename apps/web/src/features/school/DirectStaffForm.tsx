"use client";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { capabilityKeys, directStaffAccountInput, directStaffAccountSchema, type Locale } from "@madrasty/contracts";
import { useAdminCommand } from "@/api/commands";
import { ApiResponseError } from "@/api/client";
import { dictionary, localizedError } from "@/i18n";

const texts={
  ar:{newTeacher:"إضافة مدرس جديد",newAdmin:"إضافة مسؤول إدارة",name:"الاسم",email:"البريد الإلكتروني",
    password:"كلمة المرور",phone:"رقم الهاتف (اختياري)",language:"اللغة",permissions:"صلاحيات الإدارة",
    help:"الحساب جاهز للدخول بعد الحفظ، من غير دعوة.",save:"إنشاء الحساب",cancel:"إلغاء"},
  de:{newTeacher:"Lehrkraft hinzufügen",newAdmin:"Admin hinzufügen",name:"Name",email:"E-Mail-Adresse",
    password:"Passwort",phone:"Telefon (optional)",language:"Sprache",permissions:"Berechtigungen",
    help:"Das Konto ist nach dem Speichern sofort anmeldbar. Keine Einladung erforderlich.",
    save:"Konto erstellen",cancel:"Abbrechen"},
} as const;
const grants:{
  [key:string]:[string,string]
}={
  "school.manage":["إدارة المدرسة والفصول","Schule und Klassen"],
  "students.manage":["الأطفال والأسر","Schüler und Familien"],
  "staff.invite":["إضافة المدرسين","Lehrkräfte hinzufügen"],
  "attendance.supervise":["الإشراف على الحضور","Anwesenheit beaufsichtigen"],
  "academics.supervise":["الإشراف الأكاديمي","Unterricht beaufsichtigen"],
  "comms.publish":["الإعلانات","Mitteilungen"],
  "finance.read":["عرض الحسابات","Gebühren einsehen"],
  "finance.issue":["الفواتير","Rechnungen erstellen"],
  "finance.post":["المدفوعات","Zahlungen erfassen"],
  "finance.export":["التصدير المالي","Abrechnungen exportieren"],
  "bank.configure":["إعداد البنك","Zahlungskonto konfigurieren"],
  "audit.read":["سجل العمليات","Aktivitätsprotokoll"],
};
export function DirectStaffForm({locale,role,canCreateAdmin,saved,cancel}:{
  locale:Locale;role:"teacher"|"admin";canCreateAdmin:boolean;saved:()=>void;cancel:()=>void;
}) {
  const text=texts[locale],command=useAdminCommand();
  const [selected,setSelected]=useState<string[]>([]);
  const [busy,setBusy]=useState(false),[problem,setProblem]=useState("");
  const submit=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(role==="admin"&&!canCreateAdmin){setProblem(dictionary(locale)["error.forbidden"]);return;}
    const values=new FormData(e.currentTarget);
    const valid=directStaffAccountInput.safeParse({
      role, displayName:values.get("displayName"),email:values.get("email"),
      password:values.get("password"),workPhone:values.get("workPhone")||null,
      correspondenceLocale:values.get("locale"),capabilities:role==="admin"?selected:[],
    });
    if(!valid.success){setProblem(dictionary(locale)["error.validation"]);return;}
    setBusy(true);setProblem("");
    void command("/staff/provision","POST",valid.data,directStaffAccountSchema).then(saved)
      .catch((err)=>setProblem(err instanceof ApiResponseError?localizedError(locale,err.messageKey):dictionary(locale)["error.unavailable"]))
      .finally(()=>setBusy(false));
  };
  return <section className="auth-card">
    <h2>{role==="teacher"?text.newTeacher:text.newAdmin}</h2>
    <p>{text.help}</p>
    <form className="auth-form" onSubmit={submit}>
      <label>{text.name}<input name="displayName" required maxLength={200}/></label>
      <label>{text.email}<input name="email" type="email" dir="ltr" required autoComplete="off"/></label>
      <label>{text.password}<input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></label>
      <label>{text.phone}<input name="workPhone" type="tel" dir="ltr" maxLength={48}/></label>
      <label>{text.language}<select name="locale" defaultValue={locale}>
        <option value="ar">العربية</option><option value="de">Deutsch</option>
      </select></label>
      {role==="admin"&&canCreateAdmin&&<fieldset>
        <legend>{text.permissions}</legend>
        {capabilityKeys.filter(key=>key!=="access.manage").map(key=><label key={key} className="access-check">
          <input type="checkbox" checked={selected.includes(key)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,key]:prev.filter(k=>k!==key))}/>
          {grants[key]?.[locale==="ar"?0:1]??key}
        </label>)}
      </fieldset>}
      {problem&&<p role="alert">{problem}</p>}
      <button className="primary-button" disabled={busy}>{text.save}</button>
      <button type="button" className="plain-button" disabled={busy} onClick={cancel}>{text.cancel}</button>
    </form>
  </section>;
}
