"use client";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  capabilityKeys, directStaffAccountInput, directStaffAccountSchema,
  schoolClassSchema, yearSchema, type Locale,
} from "@madrasty/contracts";
import { useAdminCommand } from "@/api/commands";
import { ApiResponseError, requestApi } from "@/api/client";
import { dictionary, localizedError } from "@/i18n";
import styles from "./StaffWorkspace.module.css";

const copy={
  ar:{teacher:"إضافة مدرس",admin:"إضافة Admin",name:"الاسم",email:"البريد الإلكتروني",
    password:"كلمة المرور",passwordHint:"كلمة المرور دي ثابتة، مش مؤقتة، ويمكن تغييرها بعدين من إعدادات الحساب.",
    phone:"التليفون (اختياري)",language:"اللغة",permissions:"صلاحيات الإدارة",save:"إنشاء الحساب",cancel:"إلغاء",
    year:"السنة الدراسية",class:"الفصل (اختياري)",noClass:"بدون فصل حاليًا",
    select:"اختر",assigning:"الفصل",
  },
  de:{teacher:"Lehrkraft hinzufügen",admin:"Admin hinzufügen",name:"Name",email:"E-Mail-Adresse",
    password:"Passwort",passwordHint:"Dieses Passwort ist dauerhaft, nicht temporär. Es kann später vom Kontoinhaber geändert werden.",
    phone:"Telefon (optional)",language:"Sprache",permissions:"Admin-Berechtigungen",save:"Konto erstellen",cancel:"Abbrechen",
    year:"Schuljahr",class:"Klasse (optional)",noClass:"Noch keiner Klasse zugeordnet",
    select:"Auswählen",assigning:"Klasse",
  },
} as const;
const grants:Record<string,[string,string]>={
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
const yearList=yearSchema.array(), classList=schoolClassSchema.array();
type Year=z.infer<typeof yearSchema>;
type Classroom=z.infer<typeof schoolClassSchema>;
export function DirectStaffForm({locale,role,canCreateAdmin,canAssignClasses=true,saved,cancel}:{
  locale:Locale;role:"teacher"|"admin";canCreateAdmin:boolean;canAssignClasses?:boolean;
  saved:()=>void;cancel:()=>void;
}){
  const t=copy[locale],command=useAdminCommand();
  const [granted,setGranted]=useState<string[]>([]);
  const [years,setYears]=useState<Year[]>([]),[classes,setClasses]=useState<Classroom[]>([]);
  const [yearId,setYearId]=useState(""),[classId,setClassId]=useState("");
  const [busy,setBusy]=useState(false),[problem,setProblem]=useState("");
  useEffect(()=>{
    if(role!=="teacher"||!canAssignClasses)return;
    const controller=new AbortController();
    requestApi("/school/years",yearList,{signal:controller.signal}).then(({data})=>{
      setYears(data);
      const active=data.find(y=>y.state==="active")??data.find(y=>y.state!=="closed");
      if(active)setYearId(active.id);
    }).catch(e=>{if(!controller.signal.aborted)setProblem(e instanceof Error?e.message:String(e));});
    return()=>controller.abort();
  },[role,canAssignClasses]);
  useEffect(()=>{
    if(!yearId)return;
    const controller=new AbortController();
    requestApi(`/school/classes?yearId=${encodeURIComponent(yearId)}&limit=100`,classList,{signal:controller.signal})
      .then(res=>setClasses(res.data))
      .catch(e=>{if(!controller.signal.aborted)setProblem(e instanceof Error?e.message:String(e));});
    return()=>controller.abort();
  },[yearId]);
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(role==="admin"&&!canCreateAdmin){setProblem(dictionary(locale)["error.forbidden"]);return;}
    const data=new FormData(event.currentTarget);
    const parsed=directStaffAccountInput.safeParse({
      role,displayName:data.get("displayName"),email:data.get("email"),password:data.get("password"),
      workPhone:data.get("workPhone")||null,correspondenceLocale:data.get("locale"),
      capabilities:role==="admin"?granted:[],
      ...(role==="teacher"&&canAssignClasses&&classId?{
        assignment:{classId,kind:"primary",subjectId:null},
      }:{}),
    });
    if(!parsed.success){setProblem(dictionary(locale)["error.validation"]);return;}
    setBusy(true);setProblem("");
    void command("/staff/provision","POST",parsed.data,directStaffAccountSchema).then(saved)
      .catch(e=>setProblem(e instanceof ApiResponseError?localizedError(locale,e.messageKey):dictionary(locale)["error.unavailable"]))
      .finally(()=>setBusy(false));
  };
  return <section className={styles.card} aria-label={role==="teacher"?t.teacher:t.admin}>
    <div className={styles.cardHeader}><h2 className={styles.cardTitle}>{role==="teacher"?t.teacher:t.admin}</h2>
      <button className={styles.smallButton} type="button" onClick={cancel}>{t.cancel}</button>
    </div>
    <form className={styles.stack} onSubmit={submit}>
      <label className={styles.field}>{t.name}<input className={styles.input} name="displayName" maxLength={200} required/></label>
      <label className={styles.field}>{t.email}<input className={styles.input} name="email" type="email" dir="ltr" required autoComplete="off"/></label>
      <label className={styles.field}>{t.password}<input className={styles.input} name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/></label>
      <p className={styles.muted}>{t.passwordHint}</p>
      <div className={styles.twoCols}>
        <label className={styles.field}>{t.phone}<input className={styles.input} name="workPhone" type="tel" dir="ltr" maxLength={48}/></label>
        <label className={styles.field}>{t.language}<select className={styles.select} name="locale" defaultValue={locale}>
          <option value="ar">العربية</option><option value="de">Deutsch</option>
        </select></label>
      </div>
      {role==="teacher"&&canAssignClasses&&<>
        <hr className={styles.rule}/>
        <h3 className={styles.cardTitle}>{t.assigning}</h3>
        <div className={styles.twoCols}>
          <label className={styles.field}>{t.year}<select className={styles.select} value={yearId}
            onChange={e=>{setYearId(e.target.value);setClassId("");setClasses([]);}}>
            <option value="">{t.select}</option>{years.filter(y=>y.state!=="closed").map(y=>
              <option key={y.id} value={y.id}>{y.startsOn} – {y.endsExclusive}</option>)}
          </select></label>
          <label className={styles.field}>{t.class}<select className={styles.select} value={classId}
            onChange={e=>setClassId(e.target.value)} disabled={!yearId}>
            <option value="">{t.noClass}</option>{classes.map(c=><option key={c.id} value={c.id}>{c.code} · {locale==="ar"?c.nameAr:c.nameDe}</option>)}
          </select></label>
        </div>
      </>}
      {role==="admin"&&canCreateAdmin&&<fieldset className={styles.details}><legend>{t.permissions}</legend>
        <div className={styles.stack}>
          {capabilityKeys.filter(key=>key!=="access.manage").map(key=><label key={key} className={styles.radioCard}>
            <input type="checkbox" checked={granted.includes(key)}
              onChange={e=>setGranted(prev=>e.target.checked?[...prev,key]:prev.filter(item=>item!==key))}/>
            {grants[key]?.[locale==="ar"?0:1]??key}
          </label>)}
        </div>
      </fieldset>}
      {problem&&<p className={styles.error} role="alert">{problem}</p>}
      <div className={styles.actions}>
        <button className={styles.primary} disabled={busy}>{t.save}</button>
        <button className={styles.secondary} type="button" disabled={busy} onClick={cancel}>{t.cancel}</button>
      </div>
    </form>
  </section>;
}
