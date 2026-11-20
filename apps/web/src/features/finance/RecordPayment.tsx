"use client";

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
  return <section className="auth-card auth-form">
    <h1>{text.record}</h1>
    <Link className="plain-button" href={`/${locale}/school/more/receipts`}>{text.queue}</Link>
    <TimetableRead locale={locale} result={options}>{(value)=>invoice?
      <TimetableRead locale={locale} result={selected}>{(target)=><PaymentForm locale={locale} options={value} initial={target}/>}</TimetableRead>:
      <PaymentForm locale={locale} options={value}/>}</TimetableRead>
  </section>;
}

function PaymentForm({locale,options,initial}:{locale:Locale;options:Options;initial?:InvoiceCandidate}){
  const text=receiptCopy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [method,setMethod]=useState<"bank"|"cash">("bank"),[date,setDate]=useState(options.schoolDate);
  const [reference,setReference]=useState(""),[amount,setAmount]=useState(""),[verified,setVerified]=useState(false);
  const [invoice,setInvoice]=useState(initial),[picker,setPicker]=useState(false);
  const [preview,setPreview]=useState<ReturnType<typeof recordReceiptInput.parse>>();
  const [receipt,setReceipt]=useState<ReturnType<typeof receiptMutation.parse>>();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const {currency}=options;
  const input=recordReceiptInput.safeParse({externalReceiptRef:reference,method,receivedDate:date,currency,
    amountMinor:inputAmountMinor(amount,currency,100000000000000),invoiceId:invoice?.id,verified});
  function prepare(event:FormEvent){
    event.preventDefault();
    if(input.success){setPreview(input.data);setPicker(false);setError("");setReceipt(undefined);}
  }
  async function confirm(){
    if(!preview||busy)return;
    setBusy(true);setError("");
    try{
      setReceipt(await command("/finance/receipts","POST",preview,receiptMutation));
      setPreview(undefined);setReference("");setAmount("");setVerified(false);setInvoice(undefined);
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  return <>
    {error&&<p role="alert">{error}</p>}
    {receipt&&<div className="notice auth-form" role="status"><p>{text.recorded} · <bdi>{receipt.receiptNumber}</bdi> · {text[receipt.state]}</p>
      <Link className="plain-button" href={`/${locale}/school/more/receipts?receipt=${receipt.id}`}>{text.open}</Link></div>}
    {preview?<div className="auth-form">
      <p>{text[preview.method]} · <bdi>{preview.externalReceiptRef}</bdi> · <bdi>{preview.receivedDate}</bdi></p>
      <p><bdi dir="ltr">{financeAmount(preview.amountMinor,currency)}</bdi></p>
      {invoice&&<p><bdi>{invoice.studentName}</bdi> · <bdi>{invoice.invoiceNumber}</bdi> · <bdi>{invoice.period}</bdi></p>}
      <p>{invoice?.currency===currency&&invoice.balanceMinor===preview.amountMinor?text.exact:text.unmatched}</p>
      <div className="header-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={()=>void confirm()}>{text.confirm}</button>
        <button type="button" className="plain-button" disabled={busy} onClick={()=>setPreview(undefined)}>{text.edit}</button>
      </div>
    </div>:<>
      <form className="auth-form" onSubmit={prepare}>
        {options.cashEnabled&&<label>{billingCopy[locale].status}<select value={method} onChange={(event)=>setMethod(event.target.value==="cash"?"cash":"bank")}>
          <option value="bank">{text.bank}</option><option value="cash">{text.cash}</option>
        </select></label>}
        {!options.cashEnabled&&<p>{text.bank}</p>}
        <label>{text.reference}<input value={reference} maxLength={160} onChange={(event)=>setReference(event.target.value)} required/></label>
        <label>{text.received}<input type="date" dir="ltr" value={date} max={options.schoolDate} onChange={(event)=>setDate(event.target.value)} required/></label>
        <label>{billingCopy[locale].amount} <bdi>{currency}</bdi><input value={amount} dir="ltr" inputMode="decimal" maxLength={22}
          onChange={(event)=>setAmount(event.target.value)} required/></label>
        {invoice&&<p><bdi>{invoice.studentName}</bdi> · <bdi>{invoice.invoiceNumber}</bdi> · <bdi>{invoice.period}</bdi></p>}
        <div className="header-actions">
          <button type="button" className="plain-button" onClick={()=>setPicker(!picker)}>{text.optionalInvoice}</button>
          {invoice&&<button type="button" className="plain-button" onClick={()=>setInvoice(undefined)}>{text.noInvoice}</button>}
        </div>
        <label><input type="checkbox" checked={verified} onChange={(event)=>setVerified(event.target.checked)}/>{text.verification}</label>
        <button type="submit" className="primary-button" disabled={!input.success||date>options.schoolDate}>{text.preview}</button>
      </form>
      {picker&&<InvoicePicker locale={locale} currency={currency} onPick={(item)=>{setInvoice(item);setPicker(false);}}/>}
    </>}
  </>;
}
