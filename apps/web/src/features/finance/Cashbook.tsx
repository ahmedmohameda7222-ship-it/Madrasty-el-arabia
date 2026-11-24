"use client";
import {useState,type FormEvent} from "react";
import {z} from "zod";
import {cashbookMonth,cashMovementInput,cashMovementKind,type CashbookMonth,type Locale} from "@madrasty/contracts";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useSchoolCommand} from "@/api/commands";
import {useAccountScope} from "@/ui/AccountScope";
import {financeAmount,inputAmountMinor} from "./invoice-ui";
import css from "./FinanceWorkspace.module.css";

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
      <label className={css.control}>{t.month}<input type="month" dir="ltr" value={month||data.month} max={data.schoolDate.slice(0,7)} onChange={e=>setMonth(e.target.value)}/></label>
      <CashbookContents key={data.month} locale={locale} data={data} refresh={()=>update(n=>n+1)}/>
    </>}</TimetableRead>
  </section>;
}
function CashbookContents({locale,data,refresh}:{locale:Locale;data:CashbookMonth;refresh:()=>void}){
  const t=copy[locale],money=(n:number)=>financeAmount(Math.abs(n),data.currency),signed=(n:number)=>(n<0?"−":"+")+money(n);
  return <>
    <div className={css.balance}><span>{t.balance}</span><strong><bdi>{data.balanceMinor<0?"−":""}{money(data.balanceMinor)}</bdi></strong></div>
    <div className={css.metrics}>{([["in",data.incomeMinor],["out",data.expenseMinor]] as const).map(([label,value])=><div key={label}><small>{t[label]}</small><strong><bdi>{value<0?"−":""}{money(value)}</bdi></strong></div>)}</div>
    <details className={css.disclosure}><summary>{locale==="ar"?"تفاصيل الشهر":"Monatsdetails"}</summary><div className={css.metrics}>{([["opening",data.openingMinor],["deposits",data.depositsMinor],["refunds",data.refundsMinor],["corrections",data.correctionsMinor],["closing",data.closingMinor]] as const).map(([label,value])=><div key={label}><small>{t[label]}</small><strong><bdi>{value<0?"−":""}{money(value)}</bdi></strong></div>)}</div></details>
    {data.canPost&&<CashMovement locale={locale} data={data} refresh={refresh}/>}
    <div className="header-actions">{data.entryCount===data.entries.length&&<a className="plain-button" download href={"/api/v1/finance/cashbook/export?month="+data.month}>{t.export}</a>}{data.entryCount<=100&&<a className="plain-button" download href={"/api/v1/finance/cashbook/pdf?month="+data.month+"&locale="+locale}>PDF</a>}</div>
    {data.entryCount>data.entries.length&&<p>{t.limited}</p>}
    {data.entries.length===0?<p>{t.empty}</p>:<ul className={css.entries}>{data.entries.map(entry=><li key={entry.id}>
      <div><strong>{t[entry.kind]}</strong><small><bdi>{entry.description}</bdi> · <bdi>{entry.date}</bdi></small>{entry.receiptId&&<a href={"/"+locale+"/school/more/receipts?receipt="+entry.receiptId}>{locale==="ar"?"فتح الإيصال":"Beleg öffnen"}</a>}</div>
      <strong className={entry.signedMinor<0?css.negative:css.positive}><bdi>{signed(entry.signedMinor)}</bdi></strong>
    </li>)}</ul>}
  </>;
}
function CashMovement({locale,data,refresh}:{locale:Locale;data:CashbookMonth;refresh:()=>void}){
  const t=copy[locale],command=useSchoolCommand(useAccountScope().persona);
  const [open,setOpen]=useState(false),[kind,setKind]=useState<z.infer<typeof cashMovementKind>>("expense"),[date,setDate]=useState(data.schoolDate),[amount,setAmount]=useState(""),[description,setDescription]=useState(""),[preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const input=cashMovementInput.safeParse({kind,date,amountMinor:inputAmountMinor(amount,data.currency,100000000000000),description});
  async function save(e:FormEvent){
    e.preventDefault();if(!input.success||busy||date>data.schoolDate)return;
    if(!preview){setPreview(true);return;}
    setBusy(true);setError("");
    try{await command("/finance/cashbook","POST",input.data,z.object({id:z.uuid()}));setOpen(false);setPreview(false);setAmount("");setDescription("");setMessage(t.saved);refresh();}
    catch(e){setError(timetableError(locale,e));}finally{setBusy(false);}
  }
  return <div className={css.panel}>
    {message&&<p role="status">{message}</p>}
    {!open?<button className="primary-button" type="button" onClick={()=>{setOpen(true);setMessage("");}}>{t.new}</button>:<form className="auth-form" onSubmit={save}>
      {error&&<p role="alert">{error}</p>}
      {preview?<><p>{t[kind]} · <bdi>{date}</bdi> · <bdi>{financeAmount(input.data?.amountMinor??0,data.currency)}</bdi></p><p>{description}</p></>:<>
        <label>{t.type}<select value={kind} onChange={e=>setKind(cashMovementKind.parse(e.target.value))}>{cashMovementKind.options.map(k=><option key={k} value={k}>{t[k]}</option>)}</select></label>
        <label>{t.date}<input type="date" dir="ltr" max={data.schoolDate} value={date} onChange={e=>setDate(e.target.value)}/></label>
        <label>{t.amount}<input inputMode="decimal" dir="ltr" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        <label>{t.description}<textarea value={description} maxLength={500} onChange={e=>setDescription(e.target.value)}/></label>
      </>}
      <div className="header-actions"><button className="primary-button" disabled={!input.success||busy||date>data.schoolDate}>{preview?t.save:t.review}</button><button type="button" className="plain-button" disabled={busy} onClick={()=>preview?setPreview(false):setOpen(false)}>{preview?t.edit:(locale==="ar"?"إلغاء":"Abbrechen")}</button></div>
    </form>}
  </div>;
}
