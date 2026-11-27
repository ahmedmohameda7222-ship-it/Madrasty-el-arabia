"use client";

import css from "./FinanceWorkspace.module.css";
import {FinanceDateField} from "./FinanceDateField";

import Link from "next/link";
import {useRef,useState,type FormEvent} from "react";
import {invoiceDetail,receiptMutation,receiptOptions,recordReceiptInput,schoolDateSchema,type Locale} from "@madrasty/contracts";
import {useSchoolCommand} from "@/api/commands";
import {ApiResponseError} from "@/api/client";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {billingCopy,financeAmount,inputAmountMinor} from "./invoice-ui";
import {InvoicePicker,receiptCopy,type InvoiceCandidate} from "./receipt-ui";

type Options=ReturnType<typeof receiptOptions.parse>;
export function RecordPayment({locale,invoice,advanced=false,listQuery="",fromList=false}:{locale:Locale;invoice?:string;advanced?:boolean;listQuery?:string;fromList?:boolean}){
  const text=receiptCopy[locale],options=useTimetableRead("/finance/receipt-options",receiptOptions);
  const root=`/${locale}/school/more`,listHref=root+"/invoices"+(listQuery?"?"+listQuery:""),invoiceHref=invoice?root+"/invoices?invoice="+invoice+(listQuery?"&"+listQuery:""):listHref;
  const selected=useTimetableRead(invoice?`/finance/invoices/${invoice}`:null,invoiceDetail);
  return <section className={`${css.workspace} ${css.narrowForm} auth-form`}>
    <h1>{text.record}</h1>
    <Link className="plain-button" href={invoice?(fromList?listHref:invoiceHref):advanced?root+"/receipts":listHref}>{locale==="ar"?"رجوع":"Zurück"}</Link>
    <TimetableRead locale={locale} result={options}>{(value)=>invoice?
      <TimetableRead locale={locale} result={selected}>{(target)=>advanced?<PaymentForm key={target.id} locale={locale} options={value} initial={target}/>:<SimpleInvoicePayment key={target.id+":"+target.revision} locale={locale} options={value} initial={target} listHref={listHref} invoiceHref={invoiceHref} listQuery={listQuery} fromList={fromList} reload={selected.retry}/>}</TimetableRead>:
      <PaymentForm locale={locale} options={value}/>}</TimetableRead>
  </section>;
}


function SimpleInvoicePayment({locale,options,initial,listHref,invoiceHref,listQuery,fromList,reload}:{locale:Locale;options:Options;initial:InvoiceCandidate;listHref:string;invoiceHref:string;listQuery:string;fromList:boolean;reload:()=>void}){
  const ar=locale==="ar",text=receiptCopy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const currency=initial.currency,root=`/${locale}/school/more`;
  const [method,setMethod]=useState<"cash"|"bank">(options.cashEnabled?"cash":"bank");
  const [date,setDate]=useState(options.schoolDate),[reference,setReference]=useState(""),[showDate,setShowDate]=useState(false),[reloadNeeded,setReloadNeeded]=useState(false);
  const [amount,setAmount]=useState(financeAmount(initial.balanceMinor,currency).split(" ")[0]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[attempted,setAttempted]=useState(false);
  const [receipt,setReceipt]=useState<ReturnType<typeof receiptMutation.parse>>();
  const submitting=useRef(false),cashReference=useRef<string|null>(null);
  const received=inputAmountMinor(amount,currency,Math.min(initial.balanceMinor,20000000000000));
  const amountError=received===null||received<=0?(ar?"اكتب مبلغًا أكبر من صفر ولا يتجاوز المتبقي.":"Gib einen Betrag über null und höchstens den offenen Betrag ein."):"";
  const dateError=!schoolDateSchema.safeParse(date).success||date>options.schoolDate?(ar?"اختر تاريخ استلام صحيحًا، لا يتجاوز اليوم.":"Wähle ein gültiges Eingangsdatum bis heute."):"";
  const referenceError=method==="bank"&&(!reference.trim()||/[\p{Cc}\p{Cf}]/u.test(reference))?(ar?"اكتب مرجع العملية من كشف البنك.":"Gib die Buchungsreferenz vom Kontoauszug ein."):"";
  const unavailable=initial.balanceMinor<=0||initial.state==="cancelled"||currency!==options.currency;
  async function submit(event:FormEvent){
    event.preventDefault();
    if(submitting.current||receipt||unavailable)return;
    setAttempted(true);setError("");
    if(amountError||dateError||referenceError||received===null)return;
    cashReference.current??="CASH-"+crypto.randomUUID();
    const input=recordReceiptInput.safeParse({externalReceiptRef:method==="cash"?cashReference.current:reference,method,receivedDate:date,currency,amountMinor:received,allocations:[{invoiceId:initial.id,invoiceRevision:initial.revision,amountMinor:received}],verified:true});
    if(!input.success){setError(ar?"راجع بيانات الدفع الظاهرة وحاول مرة أخرى.":"Bitte prüfe die sichtbaren Zahlungsdaten und versuche es erneut.");return;}
    submitting.current=true;setBusy(true);
    try{setReceipt(await command("/finance/receipts","POST",input.data,receiptMutation));}
    catch(problem){
      if(problem instanceof ApiResponseError&&problem.status===409){setReloadNeeded(true);setError(ar?"الفاتورة أو مرجع التحويل اتغير أو اتسجل بالفعل. حدّث الفاتورة وراجع السداد قبل المحاولة.":"Rechnung oder Buchungsreferenz wurde bereits geändert oder erfasst. Aktualisiere die Rechnung und prüfe die Zahlung.");}
      else if(problem instanceof ApiResponseError&&problem.status===422)setError(ar?"تعذر تسجيل السداد لهذه الفاتورة. راجع حالتها ومبلغ السداد، أو حدّث الفاتورة.":"Die Zahlung ist für diese Rechnung nicht möglich. Prüfe Status und Betrag oder aktualisiere die Rechnung.");
      else setError(timetableError(locale,problem));
    }
    finally{submitting.current=false;setBusy(false);}
  }
  if(receipt){
    const balance=receipt.items.find(item=>item.invoiceId===initial.id)?.balanceMinor;
    return <div className="notice auth-form" role="status">
      <h2>{ar?"تم تسجيل السداد":"Zahlung erfasst"}</h2>
      {balance!==undefined&&<><p>{balance===0?(ar?"مدفوعة بالكامل":"Bezahlt"):(ar?"مدفوعة جزئيًا":"Teilweise bezahlt")}</p><p>{ar?"المتبقي":"Offener Betrag"} · <bdi>{financeAmount(balance,currency,locale)}</bdi></p></>}
      <Link className="primary-button" href={listHref}>{ar?"تم · رجوع للفواتير":"Fertig · Zu Rechnungen"}</Link>
      <Link className="plain-button" href={root+"/receipts?receipt="+receipt.id+"&invoice="+initial.id+(listQuery?"&"+listQuery:"")}>{ar?"عرض إيصال السداد":"Zahlungsbeleg ansehen"}</Link>
      <Link className="plain-button" href={invoiceHref}>{ar?"عرض الفاتورة":"Rechnung ansehen"}</Link>
    </div>;
  }
  if(unavailable)return <p role="status">{ar?"لا يمكن تسجيل سداد لهذه الفاتورة. راجع حالتها أو العملة.":"Für diese Rechnung kann keine Zahlung erfasst werden. Prüfe Status und Währung."}</p>;
  return <form className="auth-form" noValidate onSubmit={submit}>
    <p><strong><bdi>{initial.studentName}</bdi></strong> · <bdi>{initial.invoiceNumber}</bdi></p>
    <div className={css.balance}><small>{ar?"المبلغ المتبقي":"Offener Betrag"}</small><strong><bdi>{financeAmount(initial.balanceMinor,currency,locale)}</bdi></strong></div>
    <label className={css.amountInput}><span className={css.amountLabel}>{ar?"المبلغ المستلم":"Erhaltener Betrag"} <bdi>{currency}</bdi></span><input value={amount} inputMode="decimal" dir="ltr" maxLength={22} disabled={busy} aria-invalid={attempted&&!!amountError} onChange={event=>setAmount(event.target.value)}/></label>
    {attempted&&amountError&&<p role="alert">{amountError}</p>}
    {options.cashEnabled&&<label>{ar?"طريقة الدفع":"Zahlungsart"}<select value={method} disabled={busy} onChange={event=>setMethod(event.target.value==="cash"?"cash":"bank")}><option value="cash">{text.cash}</option><option value="bank">{text.bank}</option></select></label>}
    {!options.cashEnabled&&<p>{text.bank}</p>}
    {method==="bank"&&<><label>{ar?"مرجع التحويل البنكي":"Buchungsreferenz"}<input value={reference} maxLength={160} disabled={busy} aria-invalid={attempted&&!!referenceError} onChange={event=>setReference(event.target.value)}/></label>{attempted&&referenceError&&<p role="alert">{referenceError}</p>}</>}
    <button type="button" className="plain-button" disabled={busy} aria-expanded={showDate} onClick={()=>setShowDate(v=>!v)}>{text.received} · {date===options.schoolDate?(ar?"اليوم":"Heute"):date} ✎</button>
    {showDate&&<label>{text.received}<input type="date" dir="ltr" value={date} max={options.schoolDate} disabled={busy} aria-invalid={attempted&&!!dateError} onChange={event=>setDate(event.target.value)}/></label>}
    {received!==null&&<p>{ar?"المتبقي بعد السداد":"Danach offen"} · <bdi>{financeAmount(initial.balanceMinor-received,currency,locale)}</bdi></p>}
    {attempted&&dateError&&<p role="alert">{dateError}</p>}
    {error&&<p role="alert">{error}</p>}
    {reloadNeeded&&<button type="button" className="plain-button" onClick={()=>{setReloadNeeded(false);setError("");reload();}}>{ar?"تحديث الفاتورة":"Rechnung aktualisieren"}</button>}
    <div className={css.formAction}><button type="submit" className="primary-button" disabled={busy||reloadNeeded}>{busy?(ar?"جاري التسجيل…":"Wird gespeichert…"):(ar?"تأكيد السداد":"Zahlung bestätigen")}</button></div>
    <details className={css.disclosure}><summary>{ar?"خيارات أخرى":"Weitere Optionen"}</summary><Link className="plain-button" href={root+"/record-payment?advanced=1&invoice="+initial.id+(listQuery?"&"+listQuery:"")+(fromList?"&from=list":"")}>{ar?"سداد عدة فواتير أو مبلغ زائد":"Mehrere Rechnungen oder Überzahlung"}</Link></details>
  </form>;
}

function PaymentForm({locale,options,initial}:{locale:Locale;options:Options;initial?:InvoiceCandidate}){
  const text=receiptCopy[locale],ar=locale==="ar",{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const {currency}=options,amountText=(n:number)=>financeAmount(n,currency).split(" ")[0];
  const [method,setMethod]=useState<"bank"|"cash">(options.cashEnabled?"cash":"bank"),[date,setDate]=useState(options.schoolDate);
  const [reference,setReference]=useState(""),[amount,setAmount]=useState(initial&&initial.balanceMinor>0?amountText(initial.balanceMinor):""),[verified,setVerified]=useState(false);
  const [cashReference,setCashReference]=useState("");
  // Suggested amounts may follow the selected invoices until the operator enters actual cash received.
  const [amountEdited,setAmountEdited]=useState(false);
  const [rows,setRows]=useState<{invoice:InvoiceCandidate;amount:string}[]>(initial&&initial.balanceMinor>0?[{invoice:initial,amount:amountText(initial.balanceMinor)}]:[]);
  const [payerAnchor,setPayerAnchor]=useState<string>();
  const [picker,setPicker]=useState(false),[preview,setPreview]=useState<ReturnType<typeof recordReceiptInput.parse>>();
  const [receipt,setReceipt]=useState<ReturnType<typeof receiptMutation.parse>>(),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const allocations=rows.map(r=>({invoiceId:r.invoice.id,invoiceRevision:r.invoice.revision,amountMinor:inputAmountMinor(r.amount,currency,r.invoice.balanceMinor)}));
  const assigned=allocations.reduce((sum,line)=>sum+(line.amountMinor??0),0);
  const received=inputAmountMinor(amount,currency,100000000000000);
  const input=recordReceiptInput.safeParse({externalReceiptRef:method==="cash"?(cashReference||"CASH-PREVIEW"):reference,method,receivedDate:date,currency,amountMinor:received,...(rows.length?{allocations}:{}),verified});
  function prepare(event:FormEvent){
    event.preventDefault();
    if(input.success){const ref=method==="cash"?(cashReference||"CASH-"+crypto.randomUUID()):reference;setCashReference(method==="cash"?ref:cashReference);setPreview({...input.data,externalReceiptRef:ref});setPicker(false);setError("");setReceipt(undefined);}
  }
  async function confirm(){
    if(!preview||busy)return;
    setBusy(true);setError("");
    try{
      setReceipt(await command("/finance/receipts","POST",preview,receiptMutation));
      setPreview(undefined);setReference("");setCashReference("");setPayerAnchor(undefined);setAmount("");setAmountEdited(false);setVerified(false);setRows([]);
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  function updateRows(next:typeof rows){
    setRows(next);
    if(!amountEdited){
      const values=next.map(r=>inputAmountMinor(r.amount,currency,r.invoice.balanceMinor));
      setAmount(next.length&&values.every(value=>value!==null)?amountText(values.reduce<number>((sum,value)=>sum+(value??0),0)):"");
    }
  }
  function pick(invoice:InvoiceCandidate){
    updateRows([...rows,{invoice,amount:amountText(invoice.balanceMinor)}]);
    setPicker(false);
  }
  return <>
    {error&&<p role="alert">{error}</p>}
    {receipt&&<div className="notice auth-form" role="status"><p>{text.recorded} · <bdi>{receipt.receiptNumber}</bdi> · {text[receipt.state]}</p>
      <Link className="plain-button" href={`/${locale}/school/more/receipts?receipt=${receipt.id}`}>{text.open}</Link></div>}
    {preview?<div className="auth-form">
      <p>{text[preview.method]} · <bdi>{preview.receivedDate}</bdi></p>
      <div className={css.balance}><small>{ar?"المبلغ المستلم":"Erhaltener Betrag"}</small><strong><bdi dir="ltr">{financeAmount(preview.amountMinor,currency,locale)}</bdi></strong></div>
      {rows.map(r=><p key={r.invoice.id}><bdi>{r.invoice.studentName}</bdi> · <bdi>{r.invoice.invoiceNumber}</bdi> · <bdi>{financeAmount(inputAmountMinor(r.amount,currency,r.invoice.balanceMinor)??0,currency,locale)}</bdi></p>)}
      <p>{text.remainder} · <bdi>{financeAmount(preview.amountMinor-assigned,currency,locale)}</bdi></p>
      <div className={css.formAction}><button type="button" className="primary-button" disabled={busy} onClick={()=>void confirm()}>{text.confirm}</button><button type="button" className="plain-button" disabled={busy} onClick={()=>setPreview(undefined)}>{text.edit}</button></div>
    </div>:<>
      <form className="auth-form" onSubmit={prepare}>
        <label className={css.amountInput}><span className={css.amountLabel}>{ar?"المبلغ المستلم":"Erhaltener Betrag"} <bdi>{currency}</bdi></span><input value={amount} dir="ltr" inputMode="decimal" maxLength={22} onChange={event=>{setAmountEdited(true);setAmount(event.target.value);}} required/></label>
        <div className={css.fieldPair}>
        {options.cashEnabled&&<label>{ar?"طريقة الدفع":"Zahlungsart"}<select value={method} onChange={event=>setMethod(event.target.value==="cash"?"cash":"bank")}><option value="cash">{text.cash}</option><option value="bank">{text.bank}</option></select></label>}
        {!options.cashEnabled&&<p>{text.bank}</p>}
        <FinanceDateField locale={locale} label={text.received} type="date" value={date} max={options.schoolDate} onChange={event=>setDate(event.target.value)} required/>
        </div>
        {method==="bank"&&<label>{text.reference}<input value={reference} maxLength={160} onChange={event=>setReference(event.target.value)} required/></label>}
        {rows.length>0&&<h2>{ar?"الفواتير المختارة":"Ausgewählte Rechnungen"}</h2>}
        {rows.map((r,i)=><div key={r.invoice.id} className="timetable-day auth-form">
          <p><bdi>{r.invoice.studentName}</bdi> · <bdi>{r.invoice.period}</bdi> · <bdi>{r.invoice.invoiceNumber}</bdi></p>
          <p>{billingCopy[locale].balance} · <bdi>{financeAmount(r.invoice.balanceMinor,currency,locale)}</bdi></p>
          <label>{text.amount}<input dir="ltr" inputMode="decimal" value={r.amount} onChange={e=>updateRows(rows.map((x,j)=>i===j?{...x,amount:e.target.value}:x))}/></label>
          <button type="button" className="plain-button" onClick={()=>updateRows(rows.filter((_,j)=>i!==j))}>{text.remove}</button>
        </div>)}
        <button type="button" className="plain-button" onClick={()=>{const anchor=rows[0]?.invoice.id;setPayerAnchor(anchor);setPicker(payerAnchor!==anchor||!picker);}}>{ar?"+ اختيار فاتورة (اختياري)":"+ Rechnung auswählen (optional)"}</button>
        {rows.length>0&&<button type="button" className="plain-button" onClick={()=>{setPayerAnchor(rows[0].invoice.id);setPicker(!picker||payerAnchor!==rows[0].invoice.id);}}>{ar?"فواتير نفس مسؤول السداد":"Weitere Rechnungen desselben Zahlers"}</button>}
        {rows.length>0&&<p className={css.secondary}>{text.applied} · <bdi>{financeAmount(assigned,currency,locale)}</bdi></p>}
        {received!==null&&assigned>received&&<p role="alert">{ar?"المبلغ المخصص للفواتير أكبر من المبلغ المستلم. عدّل مبالغ الفواتير أو صحّح المبلغ المستلم.":"Die Rechnungsbeträge übersteigen den erhaltenen Betrag. Bitte die Zuordnung oder den erhaltenen Betrag korrigieren."}</p>}
        {received!==null&&received>assigned&&<p className={css.secondary}>{text.remainder} · <bdi>{financeAmount(received-assigned,currency,locale)}</bdi></p>}
        <label className={css.checkRow}><input type="checkbox" checked={verified} onChange={event=>setVerified(event.target.checked)}/>{text.verification}</label>
        <div className={css.formAction}><button type="submit" className="primary-button" disabled={!input.success||date>options.schoolDate}>{text.preview}</button></div>
      </form>
      {picker&&<InvoicePicker key={payerAnchor??"all"} locale={locale} currency={currency} payerInvoice={payerAnchor} exclude={rows.map(r=>r.invoice.id)} onPick={pick}/>}
    </>}
  </>;
}
