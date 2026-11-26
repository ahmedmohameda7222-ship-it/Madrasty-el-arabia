"use client";

import css from "./FinanceWorkspace.module.css";
import {FinanceDateField} from "./FinanceDateField";
import Link from "next/link";
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
    <label className={css.switchRow}><span>{ar?"إصدار تلقائي":"Automatisch ausstellen"}</span><input type="checkbox" role="switch" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/></label>
    <FinanceDateField locale={locale} label={ar?"شهر البداية":"Startmonat"} type="month" min={data.schoolMonth} value={month} onChange={e=>setMonth(e.target.value)} required/>
    {data.missingPayers>0&&<p className="notice">{ar?`طلاب بدون مسؤول سداد جاهز: ${data.missingPayers}`:data.missingPayers===1?"Für einen Schüler fehlt ein verfügbarer Zahler.":`Für ${data.missingPayers} Schüler fehlt ein verfügbarer Zahler.`}</p>}
    {data.payerIssues.some(item=>item.reason==="payer_unreachable")&&<p className="notice" role="status">{ar?`طلاب لا يستطيع مسؤول السداد لديهم استقبال الإشعارات حاليًا: ${data.payerIssues.filter(item=>item.reason==="payer_unreachable").length}`:`Schüler mit derzeit nicht erreichbarem Zahler: ${data.payerIssues.filter(item=>item.reason==="payer_unreachable").length}`}</p>}
    {data.payerIssues.length>0&&<details className={css.disclosure}>
      <summary>{ar?"طلاب يحتاجون متابعة":"Handlungsbedarf"} · {data.payerIssues.length}</summary>
      <p className={css.secondary}>{ar?"راجع مسؤول السداد وتفعيل حساب ولي الأمر قبل الاعتماد على الإشعارات.":"Zahler und Kontofreischaltung prüfen, bevor Sie sich auf Benachrichtigungen verlassen."}</p>
      <ul className={css.recordList}>{data.payerIssues.map(item=><li key={item.studentId}><Link className={css.recordRow} href={`/${locale}/school/more/fee-settings?student=${item.studentId}`}><span><strong><bdi>{item.studentName}</bdi></strong><small>{item.studentNumber} · {item.reason==="payer_missing"?(ar?"مسؤول سداد غير جاهز":"Zahler fehlt oder ist nicht verfügbar"):(ar?"الحساب غير جاهز للإشعارات":"Konto nicht für Benachrichtigungen bereit")}</small></span><span className={css.chevron} aria-hidden="true"/></Link></li>)}</ul>
    </details>}
    {error&&<p role="alert">{error}</p>}
    <button className="primary-button" disabled={busy||!input.success||month<data.schoolMonth||(enabled===data.enabled&&month===data.startMonth)}>{ar?"حفظ":"Speichern"}</button>
  </form>;
}
