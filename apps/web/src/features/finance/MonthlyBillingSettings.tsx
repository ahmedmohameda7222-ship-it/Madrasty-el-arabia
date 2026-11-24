"use client";
import {useState} from "react";
import type {Locale} from "@madrasty/contracts";
import {useAccountScope} from "@/ui/AccountScope";
import {useSchoolCommand} from "@/api/commands";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {monthlyBillingSettings} from "./monthly-billing-schema";
import css from "./FinanceWorkspace.module.css";
export function MonthlyBillingSettings({locale}:{locale:Locale}){
 const ar=locale==="ar",command=useSchoolCommand(useAccountScope().persona);
 const [revision,refresh]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(""),[confirm,setConfirm]=useState(false);
 const result=useTimetableRead("/finance/monthly-billing",monthlyBillingSettings,revision);
 return <section className={css.panel}>
  <h2>{ar?"الفواتير الشهرية التلقائية":"Automatische Monatsrechnungen"}</h2>
  <TimetableRead locale={locale} result={result}>{value=><>
   <p>{value.enabled?(ar?"مفعّل من ":"Aktiv ab ")+value.startsMonth:(ar?"غير مفعّل":"Deaktiviert")}</p>
   <p>{ar?"فاتورة واحدة لكل طالب مشترك. لا تصدر فواتير عن الأشهر السابقة أو فترات التوقف.":"Eine Rechnung pro angemeldetem Kind. Keine rückwirkenden Rechnungen und keine Rechnungen während der Pause."}</p>
   {error&&<p role="alert">{error}</p>}
   {confirm&&<p>{ar?"سيبدأ الإصدار من الشهر التالي: ":"Beginn ab dem nächsten Monat: "}{value.nextMonth}</p>}
   <button className="primary-button" disabled={busy} onClick={async()=>{
    if(!value.enabled&&!confirm){setConfirm(true);return;}
    setBusy(true);setError("");
    try{await command("/finance/monthly-billing","PUT",{enabled:!value.enabled,revision:value.revision},monthlyBillingSettings);setConfirm(false);refresh(n=>n+1);}
    catch(e){setError(timetableError(locale,e));}finally{setBusy(false);}
   }}>{value.enabled?(ar?"إيقاف":"Deaktivieren"):confirm?(ar?"تأكيد التفعيل":"Aktivierung bestätigen"):(ar?"تفعيل":"Aktivieren")}</button>
   {confirm&&<button className="plain-button" onClick={()=>setConfirm(false)}>{ar?"إلغاء":"Abbrechen"}</button>}
  </>}</TimetableRead>
 </section>;
}
