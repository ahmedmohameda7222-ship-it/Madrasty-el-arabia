"use client";

import css from "./FinanceWorkspace.module.css";
import {FinanceDateField} from "./FinanceDateField";
import {useState,type FormEvent} from "react";
import {automaticBillingInput,automaticBillingSettings,type Locale} from "@madrasty/contracts";
import {useTimetableRead,TimetableRead,timetableError} from "@/features/school/timetable/shared";
import {useSchoolCommand} from "@/api/commands";
import {useAccountScope} from "@/ui/AccountScope";
type Settings=ReturnType<typeof automaticBillingSettings.parse>;
export function AutomaticBilling({locale}:{locale:Locale}){
  const [version,refresh]=useState(0);
  const value=useTimetableRead("/finance/automatic-billing",automaticBillingSettings,version);
  return <section className={`${css.panel} auth-form`}><h2>{locale==="ar"?"الفواتير الشهرية التلقائية":"Automatische Monatsrechnungen"}</h2><TimetableRead locale={locale} result={value}>{data=><BillingForm key={data.revision} locale={locale} data={data} refresh={()=>refresh(n=>n+1)}/>}</TimetableRead></section>;
}
function BillingForm({locale,data,refresh}:{locale:Locale;data:Settings;refresh:()=>void}){
  const ar=locale==="ar",command=useSchoolCommand(useAccountScope().persona);
  const [enabled,setEnabled]=useState(data.enabled),[month,setMonth]=useState(data.startMonth<data.schoolMonth?data.schoolMonth:data.startMonth);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const input=automaticBillingInput.safeParse({enabled,startMonth:month,revision:data.revision});
  async function save(e:FormEvent){e.preventDefault();if(!input.success||busy)return;setBusy(true);setError("");try{await command("/finance/automatic-billing","PUT",input.data,automaticBillingSettings);refresh();}catch(e){setError(timetableError(locale,e));}finally{setBusy(false);}}
  return <form className="auth-form" onSubmit={save}>
    <p className={css.secondary}>{ar?"فاتورة شهرية للطلاب النشطين فقط.":"Monatsrechnung nur für aktive Schüler."}</p>
    <label className={css.checkRow}><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>{ar?"إصدار تلقائي":"Automatisch ausstellen"}</label>
    <FinanceDateField locale={locale} label={ar?"شهر البداية":"Startmonat"} type="month" min={data.schoolMonth} value={month} onChange={e=>setMonth(e.target.value)} required/>
    {data.missingPayers>0&&<p className="notice">{data.missingPayers} {ar?"طالب يحتاج تحديد مسؤول السداد هذا الشهر.":"Schüler benötigen diesen Monat eine zahlungspflichtige Person."}</p>}
    {error&&<p role="alert">{error}</p>}
    <button className="primary-button" disabled={busy||!input.success||month<data.schoolMonth||(enabled===data.enabled&&month===data.startMonth)}>{ar?"حفظ":"Speichern"}</button>
  </form>;
}
