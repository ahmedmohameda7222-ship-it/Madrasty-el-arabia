"use client";

import css from "./FinanceWorkspace.module.css";

import Link from "next/link";
import {useState} from "react";
import {billingMonth,invoiceDetail,invoiceState,invoiceSummary,type Locale} from "@madrasty/contracts";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {StartConversation} from "@/features/comms/StartConversation";
import {TimetableRead,useTimetableRead} from "@/features/school/timetable/shared";
import {ConfirmedAt} from "@/ui/RecordValues";
import {billingCopy,FeeLines,financeAmount} from "./invoice-ui";
import {TransferDetails} from "./TransferDetails";
import {receiptCopy} from "./receipt-ui";

const rows=invoiceSummary.array();
export function InvoiceDetails({locale,invoice,student,period,canPost,canIssue=false}:{locale:Locale;invoice?:string;student?:string;period?:string;canPost:boolean;canIssue?:boolean}){
  const text=billingCopy[locale],root=`/${locale}/school/more/invoices`;
  const [month,setMonth]=useState(period??""),[state,setState]=useState(""),[query,setQuery]=useState(""),[search,setSearch]=useState("");
  const valid=billingMonth.safeParse(month),filter=invoiceState.safeParse(state);
  const details=useTimetableRead(invoice?`/finance/invoices/${invoice}`:null,invoiceDetail);
  const list=useAcademicPage(invoice?null:`/finance/invoices?limit=25${valid.success?"&period="+valid.data:""}${student?"&studentId="+student:""}${filter.success?"&state="+filter.data:""}${query?"&q="+encodeURIComponent(query):""}`,rows,0);
  return <section className={`${css.workspace} auth-form`}>
    <h1>{text.invoices}</h1>
    {invoice?<><Link className="plain-button" href={root}>{text.back}</Link>
      <TimetableRead locale={locale} result={details}>{(item)=><div className="auth-form">
        <h2><bdi>{item.studentName}</bdi></h2><div className={css.balance}><small>{text.balance}</small><strong><bdi dir="ltr">{financeAmount(item.balanceMinor,item.currency)}</bdi></strong><span>{text[item.state]}</span></div><p className={css.secondary}><bdi>{item.invoiceNumber}</bdi></p>
        <a className="plain-button" href={`/api/v1/finance/invoices/${item.id}/pdf?locale=${locale}`} download>{locale==="ar"?"تحميل الفاتورة PDF":"Rechnung als PDF"}</a>
        <p><bdi>{item.studentNumber}</bdi> · <bdi>{item.period}</bdi> · {text[item.kind]}</p>
        <p>{text.payer} · <bdi>{item.payerName}</bdi></p>
        <p>{text.due} · <bdi>{item.dueDate}</bdi> · {text[item.state]}</p>
        <ConfirmedAt locale={locale} value={item.issuedAt}/>
        <FeeLines locale={locale} lines={item.lines} currency={item.currency}/>
        <p>{text.total} · <bdi dir="ltr">{financeAmount(item.totalMinor,item.currency)}</bdi></p>
        <p>{text.allocated} · <bdi dir="ltr">{financeAmount(item.allocatedMinor,item.currency)}</bdi></p>
        {item.paymentInstructions&&<TransferDetails locale={locale} details={item.paymentInstructions}/>}
        {item.issueInstructions&&<details><summary>{text.issueSnapshot}</summary><TransferDetails locale={locale} details={item.issueInstructions}/></details>}
        {!item.paymentInstructions&&item.balanceMinor>0&&item.state!=="cancelled"&&<p>{locale==="ar"?"السداد نقدًا لدى المدرسة":"Barzahlung bei der Schule"}</p>}
        {item.receiptIds.length>0&&<ul className="group-list">{item.receiptIds.map((id,index)=><li key={id}>
          <Link className="plain-button" href={`/${locale}/school/more/receipts?receipt=${id}`}>{receiptCopy[locale].open} {index+1}</Link>
        </li>)}</ul>}
        {canPost&&item.state!=="cancelled"&&<Link className="plain-button" href={`/${locale}/school/more/record-payment?invoice=${item.id}`}>{receiptCopy[locale].record}</Link>}
        {item.canInquire&&<StartConversation locale={locale} label={text.ask} target={{kind:"office",id:"accounts"}}
          context={{kind:"invoice",id:item.id}}/>}
      </div>}</TimetableRead>
    </>:<>
      {canIssue&&<Link className="primary-button" href={`/${locale}/school/more/issue-invoices`}>{locale==="ar"?"+ إصدار فاتورة":"+ Neue Rechnung"}</Link>}
      <form className={css.search} onSubmit={e=>{e.preventDefault();setQuery(search.trim());}}>
        <label>{text.search}<input type="search" value={search} maxLength={100} onChange={e=>setSearch(e.target.value)}/></label>
        <button className="plain-button" type="submit">{text.find}</button>
      </form>
      <details className={css.disclosure}><summary>{locale==="ar"?"تصفية":"Filter"}</summary><div className="header-actions">
        <label>{text.period}<input dir="ltr" type="month" value={month} onChange={(event)=>setMonth(event.target.value)}/></label>
        <label>{text.status}<select value={state} onChange={(event)=>setState(event.target.value)}>
          <option value="">{text.allStates}</option>{invoiceState.options.map((key)=><option value={key} key={key}>{text[key]}</option>)}
        </select></label>
      </div></details>
      <AcademicPageItems locale={locale} page={list}>{(invoices)=><ul className={css.recordList}>
        {invoices.map((item)=><li key={item.id}>
          <Link className={css.recordRow} href={`${root}?invoice=${item.id}`}><span><strong><bdi>{item.studentName}</bdi></strong><small><bdi>{item.period}</bdi> · <bdi>{item.invoiceNumber}</bdi></small></span><span className={css.recordValue}><strong><bdi dir="ltr">{financeAmount(item.balanceMinor,item.currency)}</bdi></strong><small data-state={item.state}>{text[item.state]}</small></span><span className={css.chevron} aria-hidden="true"/></Link>
        </li>)}
      </ul>}</AcademicPageItems>
    </>}
  </section>;
}
