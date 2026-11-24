"use client";

import css from "./FinanceWorkspace.module.css";

import Link from "next/link";
import {useState,type FormEvent} from "react";
import {invoiceDetail,receiptMutation,receiptOptions,recordReceiptInput,type Locale} from "@madrasty/contracts";
import {useSchoolCommand} from "@/api/commands";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {billingCopy,financeAmount,inputAmountMinor} from "./invoice-ui";
import {InvoicePicker,receiptCopy,type InvoiceCandidate} from "./receipt-ui";

type Options=ReturnType<typeof receiptOptions.parse>;
export function RecordPayment({locale,invoice}:{locale:Locale;invoice?:string}){
  const text=receiptCopy[locale],options=useTimetableRead("/finance/receipt-options",receiptOptions);
  const selected=useTimetableRead(invoice?`/finance/invoices/${invoice}`:null,invoiceDetail);
  return <section className={`${css.workspace} ${css.narrowForm} auth-form`}>
    <h1>{text.record}</h1>
    <Link className="plain-button" href={`/${locale}/school/more/receipts`}>{locale==="ar"?"المدفوعات":"Zahlungen"}</Link>
    <TimetableRead locale={locale} result={options}>{(value)=>invoice?
      <TimetableRead locale={locale} result={selected}>{(target)=><PaymentForm locale={locale} options={value} initial={target}/>}</TimetableRead>:
      <PaymentForm locale={locale} options={value}/>}</TimetableRead>
  </section>;
}

function PaymentForm({locale,options,initial}:{locale:Locale;options:Options;initial?:InvoiceCandidate}){
  const text=receiptCopy[locale],ar=locale==="ar",{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const {currency}=options,amountText=(n:number)=>financeAmount(n,currency).split(" ")[0];
  const [method,setMethod]=useState<"bank"|"cash">(options.cashEnabled?"cash":"bank"),[date,setDate]=useState(options.schoolDate);
  const [reference,setReference]=useState(""),[amount,setAmount]=useState(initial&&initial.balanceMinor>0?amountText(initial.balanceMinor):""),[verified,setVerified]=useState(false);
  const [cashReference,setCashReference]=useState("");
  const [rows,setRows]=useState<{invoice:InvoiceCandidate;amount:string}[]>(initial&&initial.balanceMinor>0?[{invoice:initial,amount:amountText(initial.balanceMinor)}]:[]);
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
      setPreview(undefined);setReference("");setCashReference("");setAmount("");setVerified(false);setRows([]);
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  function pick(invoice:InvoiceCandidate){
    const next=[...rows,{invoice,amount:amountText(invoice.balanceMinor)}];
    setRows(next);setAmount(amountText(next.reduce((sum,r)=>sum+(inputAmountMinor(r.amount,currency,r.invoice.balanceMinor)??0),0)));setPicker(false);
  }
  return <>
    {error&&<p role="alert">{error}</p>}
    {receipt&&<div className="notice auth-form" role="status"><p>{text.recorded} · <bdi>{receipt.receiptNumber}</bdi> · {text[receipt.state]}</p>
      <Link className="plain-button" href={`/${locale}/school/more/receipts?receipt=${receipt.id}`}>{text.open}</Link></div>}
    {preview?<div className="auth-form">
      <p>{text[preview.method]} · <bdi>{preview.receivedDate}</bdi></p>
      <div className={css.balance}><small>{ar?"المبلغ المستلم":"Erhaltener Betrag"}</small><strong><bdi dir="ltr">{financeAmount(preview.amountMinor,currency)}</bdi></strong></div>
      {rows.map(r=><p key={r.invoice.id}><bdi>{r.invoice.studentName}</bdi> · <bdi>{r.invoice.invoiceNumber}</bdi> · <bdi>{financeAmount(inputAmountMinor(r.amount,currency,r.invoice.balanceMinor)??0,currency)}</bdi></p>)}
      <p>{text.remainder} · <bdi>{financeAmount(preview.amountMinor-assigned,currency)}</bdi></p>
      <div className={css.formAction}><button type="button" className="primary-button" disabled={busy} onClick={()=>void confirm()}>{text.confirm}</button><button type="button" className="plain-button" disabled={busy} onClick={()=>setPreview(undefined)}>{text.edit}</button></div>
    </div>:<>
      <form className="auth-form" onSubmit={prepare}>
        <label className={css.amountInput}>{ar?"المبلغ المستلم":"Erhaltener Betrag"} <bdi>{currency}</bdi><input value={amount} dir="ltr" inputMode="decimal" maxLength={22} onChange={event=>setAmount(event.target.value)} required/></label>
        <div className={css.fieldPair}>
        {options.cashEnabled&&<label>{ar?"طريقة الدفع":"Zahlungsart"}<select value={method} onChange={event=>setMethod(event.target.value==="cash"?"cash":"bank")}><option value="cash">{text.cash}</option><option value="bank">{text.bank}</option></select></label>}
        {!options.cashEnabled&&<p>{text.bank}</p>}
        <label>{text.received}<input type="date" dir="ltr" value={date} max={options.schoolDate} onChange={event=>setDate(event.target.value)} required/></label>
        </div>
        {method==="bank"&&<label>{text.reference}<input value={reference} maxLength={160} onChange={event=>setReference(event.target.value)} required/></label>}
        {rows.length>0&&<h2>{ar?"الفواتير المختارة":"Ausgewählte Rechnungen"}</h2>}
        {rows.map((r,i)=><div key={r.invoice.id} className="timetable-day auth-form">
          <p><bdi>{r.invoice.studentName}</bdi> · <bdi>{r.invoice.period}</bdi> · <bdi>{r.invoice.invoiceNumber}</bdi></p>
          <p>{billingCopy[locale].balance} · <bdi>{financeAmount(r.invoice.balanceMinor,currency)}</bdi></p>
          <label>{text.amount}<input dir="ltr" inputMode="decimal" value={r.amount} onChange={e=>setRows(list=>list.map((x,j)=>i===j?{...x,amount:e.target.value}:x))}/></label>
          <button type="button" className="plain-button" onClick={()=>setRows(list=>list.filter((_,j)=>i!==j))}>{text.remove}</button>
        </div>)}
        <button type="button" className="plain-button" onClick={()=>setPicker(!picker)}>{ar?"+ اختيار فاتورة (اختياري)":"+ Rechnung auswählen (optional)"}</button>
        {rows.length>0&&<p className={css.secondary}>{text.applied} · <bdi>{financeAmount(assigned,currency)}</bdi></p>}
        {received!==null&&received>assigned&&<p className={css.secondary}>{text.remainder} · <bdi>{financeAmount(received-assigned,currency)}</bdi></p>}
        <label className={css.checkRow}><input type="checkbox" checked={verified} onChange={event=>setVerified(event.target.checked)}/>{text.verification}</label>
        <div className={css.formAction}><button type="submit" className="primary-button" disabled={!input.success||date>options.schoolDate}>{text.preview}</button></div>
      </form>
      {picker&&<InvoicePicker locale={locale} currency={currency} exclude={rows.map(r=>r.invoice.id)} onPick={pick}/>}
    </>}
  </>;
}
