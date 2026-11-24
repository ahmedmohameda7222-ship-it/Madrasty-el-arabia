"use client";
import {useState,type FormEvent} from "react";
import type {Locale} from "@madrasty/contracts";
import {useAccountScope} from "@/ui/AccountScope";
import {useSchoolCommand} from "@/api/commands";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {cashbookInput,cashbookReport,cashbookSaved,cashbookKind} from "./cashbook-schema";
import {financeAmount,inputAmountMinor} from "./invoice-ui";
import type {z} from "zod";
import css from "./FinanceWorkspace.module.css";
const words={
 ar:{title:"دفتر الخزنة",balance:"رصيد الخزنة الحالي",month:"الشهر",opening:"الرصيد أول الشهر",closing:"الرصيد نهاية الفترة",income:"إيراد إضافي",donation:"تبرع",expense:"مصروف",deposit:"إيداع في البنك",receipt:"اشتراك نقدي",refund:"رد مبلغ",correction:"تصحيح إيصال",add:"إضافة حركة",amount:"المبلغ",date:"التاريخ",description:"السبب / البيان",save:"تأكيد التسجيل",saved:"تم تسجيل الحركة",preview:"مراجعة",edit:"تعديل",history:"حركات الخزنة",empty:"لا توجد حركات في الشهر المحدد",initial:"رصيد افتتاحي",incomes:"الإيرادات",expenses:"المصروفات",deposits:"الإيداعات البنكية",export:"تنزيل CSV",truncated:"تم عرض أحدث 1000 حركة. الإجماليات تشمل كل الحركات.",noNegative:"الرصيد المحاسبي لا يساوي بالضرورة النقد الفعلي."},
 de:{title:"Kassenbuch",balance:"Aktueller Kassenbestand",month:"Monat",opening:"Anfangsbestand",closing:"Bestand am Monatsende",income:"Sonstige Einnahme",donation:"Spende",expense:"Ausgabe",deposit:"Bankeinzahlung",receipt:"Barzahlung",refund:"Erstattung",correction:"Belegkorrektur",add:"Buchung hinzufügen",amount:"Betrag",date:"Datum",description:"Beschreibung",save:"Buchung bestätigen",saved:"Buchung gespeichert",preview:"Prüfen",edit:"Bearbeiten",history:"Kassenbewegungen",empty:"Keine Buchungen in diesem Monat",initial:"Anfangsbestand erfassen",incomes:"Einnahmen",expenses:"Ausgaben",deposits:"Bankeinzahlungen",export:"CSV herunterladen",truncated:"Die letzten 1000 Buchungen werden angezeigt. Summen enthalten alle Buchungen.",noNegative:"Buchhalterischer Bestand, kein gezählter Bargeldbestand."}
};
type Report=z.infer<typeof cashbookReport>;
export function Cashbook({locale}:{locale:Locale}){
 const [month,setMonth]=useState(""),[refresh,update]=useState(0);
 const query=month?"?month="+month:"";
 const report=useTimetableRead(`/finance/cashbook${query}`,cashbookReport,refresh);
 return <section className={css.panel}><h1>{words[locale].title}</h1>
 <TimetableRead locale={locale} result={report}>{value=><>
  <label className={css.field}>{words[locale].month}<input type="month" dir="ltr" value={month||value.month} max={value.schoolDate.slice(0,7)} onChange={e=>setMonth(e.target.value)}/></label>
  <CashbookBody key={value.month} data={value} locale={locale} refresh={()=>update(n=>n+1)}/>
 </>}</TimetableRead></section>;
}
function CashbookBody({data,locale,refresh}:{data:Report;locale:Locale;refresh:()=>void}){
 const t=words[locale],command=useSchoolCommand(useAccountScope().persona);
 const [kind,setKind]=useState<z.infer<typeof cashbookKind>>("expense"),[date,setDate]=useState(data.schoolDate),[amount,setAmount]=useState(""),[note,setNote]=useState("");
 const [show,setShow]=useState(false),[review,setReview]=useState<z.infer<typeof cashbookInput>>(),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
 const money=(value:number)=>financeAmount(Math.abs(value),data.currency);
 const signed=(value:number)=>(value<0?"−":"")+money(value);
 const input=cashbookInput.safeParse({kind,date,amountMinor:inputAmountMinor(amount,data.currency,100000000000000),description:note});
 async function submit(event:FormEvent){
  event.preventDefault();if(busy)return;
  if(!review){if(input.success&&date<=data.schoolDate)setReview(input.data);return;}
  setBusy(true);setError("");setSaved(false);
  try{await command("/finance/cashbook","POST",review,cashbookSaved);setReview(undefined);setShow(false);setAmount("");setNote("");setKind("expense");setSaved(true);refresh();}
  catch(problem){setError(timetableError(locale,problem));}finally{setBusy(false);}
 }
 function exportCsv(){
  const quote=(v:string)=>'"'+(/^[=+\-@\t\r]/.test(v)?"'"+v:v).replace(/"/g,'""')+'"';
  const rows=[["Datum","Art","Betrag","Währung","Beschreibung","Mitarbeiter"],...data.entries.map(e=>[e.date,e.kind,signed(e.amountMinor),data.currency,e.description,e.actor])];
  const url=URL.createObjectURL(new Blob(["\uFEFF"+rows.map(r=>r.map(quote).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="Kassenbuch-"+data.month+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }
 const tiles=[{label:t.incomes,value:data.incomeMinor},{label:t.expenses,value:data.expenseMinor},{label:t.deposits,value:data.depositMinor},{label:t.refund,value:data.refundMinor},{label:t.correction,value:data.correctionMinor},{label:t.opening,value:data.openingMinor},{label:t.closing,value:data.monthEndMinor}];
 return <>
  <div className={css.balance}><span>{t.balance}</span><strong dir="ltr">{signed(data.balanceMinor)}</strong><small>{t.noNegative}</small></div>
  <div className={css.metrics}>{tiles.map(tile=><div key={tile.label} className={css.metric}><span>{tile.label}</span><strong dir="ltr">{signed(tile.value)}</strong></div>)}</div>
  {saved&&<p role="status">{t.saved}</p>}
  {data.canPost&&!show&&<button className="primary-button" onClick={()=>{setShow(true);setSaved(false);}}>{t.add}</button>}
  {data.canPost&&show&&<form className="auth-form" onSubmit={submit}>
    {error&&<p role="alert">{error}</p>}
    {review?<div className={css.metric}><strong>{review.kind==="opening"?t.initial:t[review.kind]}</strong><p>{review.date} · {money(review.amountMinor)}</p><p>{review.description}</p></div>:<>
      <label className={css.field}>{t.add}<select value={kind} onChange={e=>setKind(cashbookKind.parse(e.target.value))}>{cashbookKind.options.filter(k=>k!=="opening"||data.canSetOpening).map(k=><option value={k} key={k}>{k==="opening"?t.initial:t[k]}</option>)}</select></label>
      <label className={css.field}>{t.amount}<input inputMode="decimal" dir="ltr" value={amount} required onChange={e=>setAmount(e.target.value)}/></label>
      <label className={css.field}>{t.date}<input type="date" dir="ltr" max={data.schoolDate} required value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label className={css.field}>{t.description}<textarea required minLength={3} maxLength={300} value={note} onChange={e=>setNote(e.target.value)}/></label>
    </>}
    <div className="header-actions"><button className="primary-button" type="submit" disabled={busy||!review&&!input.success}>{review?t.save:t.preview}</button>
    <button className="plain-button" type="button" disabled={busy} onClick={()=>{if(review)setReview(undefined);else setShow(false);}}>{review?t.edit:locale==="ar"?"إلغاء":"Abbrechen"}</button></div>
  </form>}
  <div className={css.sectionHead}><h2>{t.history}</h2>{data.entries.length>0&&<button className="plain-button" disabled={data.entryCount>data.entries.length} onClick={exportCsv}>{t.export}</button>}</div>
  {data.entryCount>data.entries.length&&<p>{t.truncated}</p>}
  {data.entries.length===0?<p>{t.empty}</p>:<ul className={css.movements}>{data.entries.map(e=><li key={e.id}>
    <div><strong>{e.kind==="opening"?t.initial:t[e.kind]}</strong><p>{e.description}</p><small>{e.date} · {e.actor}</small></div>
    <strong dir="ltr" className={e.amountMinor>=0?css.positive:css.negative}>{e.amountMinor>0?"+":""}{signed(e.amountMinor)}</strong>
  </li>)}</ul>}
 </>;
}
