"use client";
import {useRef,useState,type FormEvent} from "react";
import {z} from "zod";
import {ApiResponseError} from "@/api/client";
import {cashbookMonth,cashMovementInput,cashMovementKind,cashMovementReversalInput,type CashbookMonth,type Locale} from "@madrasty/contracts";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useSchoolCommand} from "@/api/commands";
import {useAccountScope} from "@/ui/AccountScope";
import {financeAmount,inputAmountMinor} from "./invoice-ui";
import css from "./FinanceWorkspace.module.css";
import {FinanceDateField} from "./FinanceDateField";

const copy={
 ar:{title:"دفتر الخزنة",balance:"رصيد الخزنة الحالي",opening:"رصيد بداية الشهر",closing:"رصيد نهاية الفترة",income:"إيراد إضافي",donation:"تبرع",expense:"مصروف",bank_deposit:"إيداع في البنك",fee:"اشتراك نقدي",void:"تصحيح إيصال",refund:"رد مبلغ",in:"إجمالي المقبوض",out:"المصروفات",deposits:"الإيداعات البنكية",refunds:"المبالغ المرتجعة",corrections:"تصحيحات",month:"الشهر",new:"إضافة حركة",type:"نوع الحركة",date:"التاريخ",amount:"المبلغ",description:"السبب / البيان",save:"حفظ الحركة",review:"مراجعة",edit:"تعديل",saved:"تم تسجيل الحركة",empty:"لا توجد حركات",limited:"يتم عرض آخر ١٠٠٠ حركة.",export:"تحميل CSV"},
 de:{title:"Kassenbuch",balance:"Aktueller Kassenbestand",opening:"Anfangsbestand",closing:"Bestand zum Monatsende",income:"Sonstige Einnahme",donation:"Spende",expense:"Ausgabe",bank_deposit:"Bankeinzahlung",fee:"Barzahlung Schulgebühr",void:"Belegkorrektur",refund:"Erstattung",in:"Einnahmen",out:"Ausgaben",deposits:"Bankeinzahlungen",refunds:"Erstattungen",corrections:"Korrekturen",month:"Monat",new:"Neue Buchung",type:"Art",date:"Datum",amount:"Betrag",description:"Beschreibung / Grund",save:"Buchung speichern",review:"Prüfen",edit:"Bearbeiten",saved:"Buchung gespeichert",empty:"Keine Buchungen",limited:"Die letzten 1.000 Buchungen werden angezeigt.",export:"CSV herunterladen"},
} as const;
export function Cashbook({locale}:{locale:Locale}){
  const [month,setMonth]=useState(""),[refresh,update]=useState(0),t=copy[locale];
  const result=useTimetableRead(`/finance/cashbook${month?"?month="+month:""}`,cashbookMonth,refresh);
  return <section className={css.workspace}>
    <h1>{t.title}</h1>
    <TimetableRead locale={locale} result={result}>{data=><>
      <FinanceDateField className={css.control} locale={locale} label={t.month} type="month" value={month||data.month} max={data.schoolDate.slice(0,7)} onChange={e=>setMonth(e.target.value)}/>
      <CashbookContents key={data.month} locale={locale} data={data} refresh={()=>update(n=>n+1)}/>
    </>}</TimetableRead>
  </section>;
}
function CashbookContents({locale,data,refresh}:{locale:Locale;data:CashbookMonth;refresh:()=>void}){
  const t=copy[locale],money=(n:number)=>financeAmount(Math.abs(n),data.currency,locale),signed=(n:number)=>(n<0?"−":"+")+money(n);
  return <>
    <div className={css.balance}><span>{t.balance}</span><strong><bdi>{data.balanceMinor<0?"−":""}{money(data.balanceMinor)}</bdi></strong></div>
    <div className={css.metrics}>{([["in",data.incomeMinor],["out",data.expenseMinor]] as const).map(([label,value])=><div key={label}><small>{t[label]}</small><strong><bdi>{value<0?"−":""}{money(value)}</bdi></strong></div>)}</div>
    <details className={css.disclosure}><summary>{locale==="ar"?"تفاصيل الشهر":"Monatsdetails"}</summary><div className={css.metrics}>{([["opening",data.openingMinor],["deposits",data.depositsMinor],["refunds",data.refundsMinor],["corrections",data.correctionsMinor],["closing",data.closingMinor]] as const).map(([label,value])=><div key={label}><small>{t[label]}</small><strong><bdi>{value<0?"−":""}{money(value)}</bdi></strong></div>)}</div></details>
    {data.canPost&&<CashMovement locale={locale} data={data} refresh={refresh}/>}
    <div className="header-actions">{data.entryCount===data.entries.length&&<a className="plain-button" download href={"/api/v1/finance/cashbook/export?month="+data.month}>{t.export}</a>}{data.entryCount<=100&&<a className="plain-button" download href={"/api/v1/finance/cashbook/pdf?month="+data.month+"&locale="+locale}>PDF</a>}</div>
    {data.entryCount>data.entries.length&&<p>{t.limited}</p>}
    {data.entries.length===0?<p>{t.empty}</p>:<ul className={css.entries}>{data.entries.map(entry=><li key={entry.id}>
      <div><strong>{entry.reversalOf?(locale==="ar"?"تصحيح حركة":"Buchungskorrektur"):t[entry.kind]}</strong><small><bdi>{entry.description}</bdi> · <bdi>{entry.date}</bdi></small>{entry.receiptId&&<a href={"/"+locale+"/school/more/receipts?receipt="+entry.receiptId}>{locale==="ar"?"فتح الإيصال":"Beleg öffnen"}</a>}{data.canPost&&entry.canReverse&&<CashCorrection key={entry.id} locale={locale} entry={entry} currency={data.currency} refresh={refresh}/>}</div>
      <strong className={entry.signedMinor<0?css.negative:css.positive}><bdi>{signed(entry.signedMinor)}</bdi></strong>
    </li>)}</ul>}
  </>;
}
function CashMovement({locale,data,refresh}:{locale:Locale;data:CashbookMonth;refresh:()=>void}){
  const t=copy[locale],ar=locale==="ar",command=useSchoolCommand(useAccountScope().persona);
  const [open,setOpen]=useState(false),[kind,setKind]=useState<z.infer<typeof cashMovementKind>>("expense"),[date,setDate]=useState(data.schoolDate),[amount,setAmount]=useState(""),[description,setDescription]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(""),[attempted,setAttempted]=useState(false);
  const lock=useRef(false);
  const minor=inputAmountMinor(amount,data.currency,100000000000000);
  const input=cashMovementInput.safeParse({kind,date,amountMinor:minor,description});
  const outgoing=kind==="expense"||kind==="bank_deposit";
  const amountError=minor===null?(ar?"اكتب مبلغًا أكبر من صفر.":"Gib einen Betrag über 0 ein."):outgoing&&minor>data.balanceMinor?(ar?"المبلغ أكبر من رصيد الخزنة الحالي.":"Der Betrag ist höher als der aktuelle Kassenbestand."):"";
  const dateError=!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>data.schoolDate?(ar?"اختر تاريخًا صحيحًا حتى اليوم.":"Wähle ein gültiges Datum bis heute."):"";
  const noteError=description.trim().length<3?(ar?"اكتب وصفًا من ٣ حروف على الأقل.":"Gib eine Beschreibung mit mindestens 3 Zeichen ein."):"";
  async function save(e:FormEvent){
    e.preventDefault();setAttempted(true);setError("");
    if(!input.success||lock.current||amountError||dateError||noteError)return;
    lock.current=true;setBusy(true);
    try{await command("/finance/cashbook","POST",input.data,z.object({id:z.uuid()}));setOpen(false);setAmount("");setDescription("");setAttempted(false);setMessage(t.saved);refresh();}
    catch(problem){setError(problem instanceof ApiResponseError&&problem.status===422?(ar?"تعذر حفظ الحركة. راجع الرصيد الحالي والبيانات وحاول مرة أخرى.":"Buchung nicht gespeichert. Prüfe Kassenbestand und Angaben, dann versuche es erneut."):timetableError(locale,problem));refresh();}
    finally{lock.current=false;setBusy(false);}
  }
  return <div className={css.panel}>
    {message&&<p role="status">{message}</p>}
    {!open?<button className="primary-button" type="button" onClick={()=>{setOpen(true);setMessage("");}}>{t.new}</button>:<form className="auth-form" onSubmit={save} noValidate>
      <label>{t.type}<select value={kind} disabled={busy} onChange={e=>setKind(cashMovementKind.parse(e.target.value))}>{cashMovementKind.options.map(k=><option key={k} value={k}>{t[k]}</option>)}</select></label>
      {outgoing&&<p>{ar?"المتاح في الخزنة":"Verfügbar in der Kasse"} · <bdi>{financeAmount(Math.max(0,data.balanceMinor),data.currency,locale)}</bdi></p>}
      <label>{t.amount}<input inputMode="decimal" dir="ltr" value={amount} disabled={busy} aria-invalid={attempted&&!!amountError} onChange={e=>setAmount(e.target.value)}/></label>
      {attempted&&amountError&&<p role="alert">{amountError}</p>}
      <label>{t.description}<textarea value={description} maxLength={500} disabled={busy} aria-invalid={attempted&&!!noteError} onChange={e=>setDescription(e.target.value)}/></label>
      {attempted&&noteError&&<p role="alert">{noteError}</p>}
      <FinanceDateField locale={locale} label={t.date} type="date" max={data.schoolDate} value={date} disabled={busy} aria-invalid={attempted&&!!dateError} onChange={e=>setDate(e.target.value)}/>
      {attempted&&dateError&&<p role="alert">{dateError}</p>}
      {kind==="bank_deposit"&&<p>{ar?"نقل نقدي للبنك، وليس إيرادًا جديدًا.":"Umbuchung zur Bank, keine neue Einnahme."}</p>}
      {error&&<p role="alert">{error}</p>}
      <div className="header-actions"><button className="primary-button" disabled={busy}>{busy?(ar?"جارٍ الحفظ…":"Wird gespeichert…"):t.save}</button><button type="button" className="plain-button" disabled={busy} onClick={()=>{setOpen(false);setAttempted(false);setError("");}}>{ar?"إلغاء":"Abbrechen"}</button></div>
    </form>}
  </div>;
}

function CashCorrection({locale,entry,currency,refresh}:{locale:Locale;entry:CashbookMonth["entries"][number];currency:string;refresh:()=>void}){
  const ar=locale==="ar",command=useSchoolCommand(useAccountScope().persona);
  const [open,setOpen]=useState(false),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const input=cashMovementReversalInput.safeParse({movementId:entry.id,reason});
  async function submit(e:FormEvent){
    e.preventDefault();if(!input.success||busy)return;
    setBusy(true);setError("");
    try{await command("/finance/cashbook/reversals","POST",input.data,z.object({id:z.uuid()}));setOpen(false);refresh();}
    catch(problem){setError(timetableError(locale,problem));}finally{setBusy(false);}
  }
  return <div className="auth-form">
    {!open?<button type="button" className="plain-button" onClick={()=>setOpen(true)}>{ar?"تصحيح الحركة":"Buchung korrigieren"}</button>:<form className="auth-form" onSubmit={submit}>
      <p className={css.secondary}>{ar?"سيتم تسجيل حركة عكسية بتاريخ اليوم مع الاحتفاظ بالحركة الأصلية.":"Eine Gegenbuchung mit heutigem Datum wird erfasst. Die ursprüngliche Buchung bleibt erhalten."} · <bdi>{entry.signedMinor>0?"−":"+"}{financeAmount(Math.abs(entry.signedMinor),currency,locale)}</bdi></p>
      <label>{ar?"سبب التصحيح":"Grund der Korrektur"}<textarea value={reason} maxLength={500} required onChange={e=>setReason(e.target.value)}/></label>
      {error&&<p role="alert">{error}</p>}
      <button type="submit" className="plain-button" disabled={!input.success||busy}>{ar?"تأكيد التصحيح":"Korrektur bestätigen"}</button>
      <button type="button" className="plain-button" disabled={busy} onClick={()=>{setOpen(false);setReason("");setError("");}}>{ar?"إلغاء":"Abbrechen"}</button>
    </form>}
  </div>;
}
