"use client";

import css from "./FinanceWorkspace.module.css";
import {FinanceDateField,financeDate} from "./FinanceDateField";

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
export function InvoiceDetails({locale,invoice,student,period,canPost,canIssue=false,staff=true,initialState}:{locale:Locale;staff?:boolean;invoice?:string;student?:string;period?:string;canPost:boolean;canIssue?:boolean;initialState?:"open"}){
  const text=billingCopy[locale],root=`/${locale}/school/more/invoices`;
  const [month,setMonth]=useState(period??""),[state,setState]=useState<string>(initialState??""),[query,setQuery]=useState(""),[search,setSearch]=useState("");
  const valid=billingMonth.safeParse(month),filter=invoiceState.safeParse(state);
  const details=useTimetableRead(invoice?`/finance/invoices/${invoice}`:null,invoiceDetail);
  const list=useAcademicPage(invoice?null:`/finance/invoices?limit=25${valid.success?"&period="+valid.data:""}${student?"&studentId="+student:""}${state==="open"?"&state=open":filter.success?"&state="+filter.data:""}${query?"&q="+encodeURIComponent(query):""}`,rows,0);
  return <section className={`${css.workspace} auth-form`}>
    <h1>{text.invoices}</h1>
    {invoice?<><Link className="plain-button" href={root}>{text.back}</Link>
      <TimetableRead locale={locale} result={details}>{(item)=><div className={css.invoiceDetail}>
        <p className={css.secondary}>{text[item.kind]} · <bdi>{financeDate(item.period,locale,"month")}</bdi></p>
        <div className={css.invoiceBalance}>
          <small>{text.balance}</small>
          <strong><bdi dir="ltr">{financeAmount(item.balanceMinor,item.currency,locale)}</bdi></strong>
          <span className={css.statePill} data-state={item.state}>{text[item.state]}</span>
          <small>{text.due} · <bdi>{financeDate(item.dueDate,locale)}</bdi></small>
        </div>
        <div className={css.invoiceActions}>
          {canPost&&item.balanceMinor>0&&item.state!=="cancelled"&&<Link className="primary-button" href={`/${locale}/school/more/record-payment?invoice=${item.id}`}>{receiptCopy[locale].record}</Link>}
          <a className="plain-button" href={`/api/v1/finance/invoices/${item.id}/pdf?locale=${locale}`} download>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg>
            {locale==="ar"?"تحميل الفاتورة PDF":"Rechnung als PDF"}</a>
        </div>
        <dl className={css.valueRows}>
          <div><dt>{locale==="ar"?"الطالب":"Schüler"}</dt><dd><bdi>{item.studentName}</bdi><small><bdi>{item.studentNumber}</bdi></small></dd></div>
          <div><dt>{locale==="ar"?"رقم الفاتورة":"Rechnungsnummer"}</dt><dd><bdi>{item.invoiceNumber}</bdi></dd></div>
          <div><dt>{text.payer}</dt><dd><bdi>{item.payerName}</bdi></dd></div>
        </dl>
        <FeeLines locale={locale} lines={item.lines} currency={item.currency}/>
        <dl className={css.valueRows}>
          <div><dt>{text.total}</dt><dd><bdi dir="ltr">{financeAmount(item.totalMinor,item.currency,locale)}</bdi></dd></div>
          <div><dt>{text.allocated}</dt><dd><bdi dir="ltr">{financeAmount(item.allocatedMinor,item.currency,locale)}</bdi></dd></div>
        </dl>
        {item.paymentInstructions&&(staff?<details className={css.disclosure}><summary>{locale==="ar"?"بيانات التحويل الحالية":"Aktuelle Überweisungsdaten"}</summary><TransferDetails locale={locale} details={item.paymentInstructions} showTitle={false} guidance={false}/></details>:<TransferDetails locale={locale} details={item.paymentInstructions}/>)}
        {item.issueInstructions&&<details className={css.disclosure}><summary>{text.issueSnapshot}</summary><TransferDetails locale={locale} details={item.issueInstructions} showTitle={false} guidance={false}/></details>}
        {!item.paymentInstructions&&item.balanceMinor>0&&item.state!=="cancelled"&&<p className={css.secondary}>{locale==="ar"?"السداد نقدًا لدى المدرسة":"Barzahlung bei der Schule"}</p>}
        {item.receiptIds.length>0&&<ul className={css.recordList}>{item.receiptIds.map((id,index)=><li key={id}>
          <Link className={css.recordRow} href={`/${locale}/school/more/receipts?receipt=${id}`}><span>{receiptCopy[locale].open} {index+1}</span><span className={css.chevron} aria-hidden="true"/></Link>
        </li>)}</ul>}
        {item.canInquire&&<StartConversation locale={locale} label={text.ask} target={{kind:"office",id:"accounts"}}
          context={{kind:"invoice",id:item.id}}/>}
        <ConfirmedAt locale={locale} value={item.issuedAt}/>
      </div>}</TimetableRead>
    </>:<>
      {canIssue&&<Link className="primary-button" href={`/${locale}/school/more/issue-invoices`}>{locale==="ar"?"+ إصدار فاتورة":"+ Neue Rechnung"}</Link>}
      {staff&&<form className={css.search} onSubmit={e=>{e.preventDefault();setQuery(search.trim());}}>
        <label><span className={css.searchLabel}>{text.search}</span><input type="search" value={search} maxLength={100} onChange={e=>setSearch(e.target.value)}/></label>
        <button className="plain-button" type="submit">{text.find}</button>
      </form>}
      <details className={css.disclosure} open={initialState==="open"?true:undefined}><summary>{locale==="ar"?"تصفية":"Filter"}</summary><div className="header-actions">
        <FinanceDateField locale={locale} label={text.period} type="month" value={month} onChange={(event)=>setMonth(event.target.value)}/>
        <label>{text.status}<select value={state} onChange={(event)=>setState(event.target.value)}>
          <option value="">{text.allStates}</option><option value="open">{locale==="ar"?"غير مدفوعة بالكامل":"Offene Rechnungen"}</option>{invoiceState.options.map((key)=><option value={key} key={key}>{text[key]}</option>)}
        </select></label>
      </div></details>
      <AcademicPageItems locale={locale} page={list} emptyMessage={locale==="ar"?(staff?"لا توجد فواتير تطابق الاختيار.":"لا توجد فواتير لأطفالك في الفترة المختارة. ستظهر هنا عند إصدارها."):(staff?"Keine Rechnungen für diese Auswahl.":"Hier erscheinen die Rechnungen Ihrer Kinder, sobald sie ausgestellt sind.")}>{(invoices)=><ul className={css.recordList}>
        {invoices.map((item)=><li key={item.id}>
          <Link className={`${css.recordRow} ${css.invoiceRow}`} href={`${root}?invoice=${item.id}`}><span><strong><bdi>{item.studentName}</bdi></strong><small><bdi>{financeDate(item.period,locale,"month")}</bdi> · <bdi>{item.invoiceNumber}</bdi></small></span><span className={css.recordValue}><strong><bdi dir="ltr">{financeAmount(item.balanceMinor,item.currency,locale)}</bdi></strong><small data-state={item.state}>{text[item.state]}</small></span><span className={css.chevron} aria-hidden="true"/></Link>
        </li>)}
      </ul>}</AcademicPageItems>
    </>}
  </section>;
}
