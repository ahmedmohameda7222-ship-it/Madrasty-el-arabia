"use client";

import Link from "next/link";
import {useState} from "react";
import {billingMonth,invoiceDetail,invoiceState,invoiceSummary,type Locale} from "@madrasty/contracts";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {StartConversation} from "@/features/comms/StartConversation";
import {TimetableRead,useTimetableRead} from "@/features/school/timetable/shared";
import {ConfirmedAt} from "@/ui/RecordValues";
import {billingCopy,FeeLines,financeAmount} from "./invoice-ui";
import {TransferDetails} from "./TransferDetails";
import {FinancePdfButton} from "./FinancePdfButton";
import {receiptCopy} from "./receipt-ui";

const rows=invoiceSummary.array();
export function InvoiceDetails({locale,invoice,student,period,canPost}:{locale:Locale;invoice?:string;student?:string;period?:string;canPost:boolean}){
  const text=billingCopy[locale],root=`/${locale}/school/more/invoices`;
  const [month,setMonth]=useState(period??""),[state,setState]=useState("");
  const valid=billingMonth.safeParse(month),filter=invoiceState.safeParse(state);
  const details=useTimetableRead(invoice?`/finance/invoices/${invoice}`:null,invoiceDetail);
  const list=useAcademicPage(invoice?null:`/finance/invoices?limit=25${valid.success?"&period="+valid.data:""}${student?"&studentId="+student:""}${filter.success?"&state="+filter.data:""}`,rows,0);
  return <section className="auth-card auth-form">
    <h1>{text.invoices}</h1>
    {invoice?<><Link className="plain-button" href={root}>{text.back}</Link>
      <TimetableRead locale={locale} result={details}>{(item)=><div className="auth-form">
        <h2><bdi>{item.invoiceNumber}</bdi> · <bdi>{item.studentName}</bdi></h2>
        <FinancePdfButton locale={locale} id={item.id} kind="invoices" number={item.invoiceNumber}/>
        <p><bdi>{item.studentNumber}</bdi> · <bdi>{item.period}</bdi> · {text[item.kind]}</p>
        <p>{text.payer} · <bdi>{item.payerName}</bdi></p>
        <p>{text.due} · <bdi>{item.dueDate}</bdi> · {text[item.state]}</p>
        <ConfirmedAt locale={locale} value={item.issuedAt}/>
        <FeeLines locale={locale} lines={item.lines} currency={item.currency}/>
        <p>{text.total} · <bdi dir="ltr">{financeAmount(item.totalMinor,item.currency)}</bdi></p>
        <p>{text.allocated} · <bdi dir="ltr">{financeAmount(item.allocatedMinor,item.currency)}</bdi></p>
        <p>{text.balance} · <bdi dir="ltr">{financeAmount(item.balanceMinor,item.currency)}</bdi></p>
        {item.paymentInstructions&&<TransferDetails locale={locale} details={item.paymentInstructions}/>}
        <details><summary>{text.issueSnapshot}</summary><TransferDetails locale={locale} details={item.issueInstructions}/></details>
        {item.receiptIds.length>0&&<ul className="group-list">{item.receiptIds.map((id,index)=><li key={id}>
          <Link className="plain-button" href={`/${locale}/school/more/receipts?receipt=${id}`}>{receiptCopy[locale].open} {index+1}</Link>
        </li>)}</ul>}
        {canPost&&item.state!=="cancelled"&&<Link className="plain-button" href={`/${locale}/school/more/record-payment?invoice=${item.id}`}>{receiptCopy[locale].record}</Link>}
        {item.canInquire&&<StartConversation locale={locale} label={text.ask} target={{kind:"office",id:"accounts"}}
          context={{kind:"invoice",id:item.id}}/>}
      </div>}</TimetableRead>
    </>:<>
      <div className="header-actions">
        <label>{text.period}<input dir="ltr" type="month" value={month} onChange={(event)=>setMonth(event.target.value)}/></label>
        <label>{text.status}<select value={state} onChange={(event)=>setState(event.target.value)}>
          <option value="">{text.allStates}</option>{invoiceState.options.map((key)=><option value={key} key={key}>{text[key]}</option>)}
        </select></label>
      </div>
      <AcademicPageItems locale={locale} page={list}>{(invoices)=><ul className="group-list">
        {invoices.map((item)=><li key={item.id} className="timetable-day">
          <Link className="group-row" href={`${root}?invoice=${item.id}`}><bdi>{item.invoiceNumber}</bdi><bdi>{item.studentName}</bdi></Link>
          <p><bdi>{item.period}</bdi> · {text[item.state]} · <bdi dir="ltr">{financeAmount(item.balanceMinor,item.currency)}</bdi></p>
          <FinancePdfButton locale={locale} id={item.id} kind="invoices" number={item.invoiceNumber}/>
        </li>)}
      </ul>}</AcademicPageItems>
    </>}
  </section>;
}
