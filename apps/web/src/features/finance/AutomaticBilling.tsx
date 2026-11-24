"use client";
import {useState,type FormEvent} from "react";
import {autoBillingSettings,autoBillingUpdate,type Locale} from "@madrasty/contracts";
import type {z} from "zod";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useSchoolCommand} from "@/api/commands";
import {useAccountScope} from "@/ui/AccountScope";
export function AutomaticBilling({locale}:{locale:Locale}){
  const [refresh,setRefresh]=useState(0),result=useTimetableRead("/finance/automatic-billing",autoBillingSettings,refresh);
  return <section className="auth-card auth-form"><h2>{locale==="ar"?"الفواتير التلقائية":"Automatische Rechnungen"}</h2>
    <TimetableRead locale={locale} result={result}>{settings=><BillingForm key={settings.revision} locale={locale} data={settings} refresh={()=>setRefresh(n=>n+1)}/>}</TimetableRead>
  </section>;
}
function BillingForm({locale,data,refresh}:{locale:Locale;data:z.infer<typeof autoBillingSettings>;refresh:()=>void}){
  const ar=locale==="ar",command=useSchoolCommand(useAccountScope().persona),[enabled,setEnabled]=useState(data.enabled),[start,setStart]=useState(data.startMonth<data.schoolMonth?data.schoolMonth:data.startMonth),[busy,setBusy]=useState(false),[error,setError]=useState(""),[review,setReview]=useState(false);
  const input=autoBillingUpdate.safeParse({enabled,startMonth:start,revision:data.revision});
  async function save(e:FormEvent){e.preventDefault();if(!input.success||busy||start<data.schoolMonth)return;
    if(!review){setReview(true);return;}setBusy(true);setError("");try{await command("/finance/automatic-billing","PUT",input.data,autoBillingSettings);refresh();}catch(e){setError(timetableError(locale,e));}finally{setBusy(false);}
  }
  return <form className="auth-form" onSubmit={save}>
    <p>{ar?"الحالة الحالية":"Aktueller Status"} · {data.enabled?(ar?"مفعلة":"Aktiv"):(ar?"متوقفة":"Aus")} · <bdi>{data.startMonth}</bdi></p>
    <p>{ar?"يصدر النظام فاتورة شهرية واحدة لكل طالب مؤهل له مسؤول سداد محدد.":"Pro Monat wird eine Rechnung je berechtigtem Schüler mit festgelegter zahlungspflichtiger Person erstellt."}</p>
    {data.missingPayers>0&&<p className="notice">{ar?"طلاب هذا الشهر بدون مسؤول سداد نشط":"Schüler ohne aktive zahlungspflichtige Person im aktuellen Monat"}: <bdi>{data.missingPayers}</bdi></p>}
    {error&&<p role="alert">{error}</p>}
    {review?<p>{enabled?(ar?"تفعيل":"Aktivieren"):(ar?"إيقاف":"Deaktivieren")} · <bdi>{start}</bdi>{enabled&&start===data.schoolMonth&&(ar?" — سيتم إصدار فواتير الشهر الحالي غير الموجودة بعد.":" — Fehlende Rechnungen für den laufenden Monat werden erstellt.")}</p>:<>
      <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>{ar?"إصدار تلقائي":"Automatisch ausstellen"}</label>
      <label>{ar?"بدءًا من شهر":"Startmonat"}<input type="month" dir="ltr" min={data.schoolMonth} value={start} onChange={e=>setStart(e.target.value)}/></label>
    </>}
    <div className="header-actions"><button className="primary-button" disabled={busy||!input.success||start<data.schoolMonth}>{review?(ar?"تأكيد":"Bestätigen"):(ar?"مراجعة":"Prüfen")}</button>{review&&<button className="plain-button" type="button" onClick={()=>setReview(false)} disabled={busy}>{ar?"تعديل":"Bearbeiten"}</button>}</div>
  </form>;
}
