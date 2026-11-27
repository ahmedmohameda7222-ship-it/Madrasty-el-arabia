"use client";

import css from "./FinanceWorkspace.module.css";
import {FinanceDateField,financeDate} from "./FinanceDateField";

import Link from "next/link";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {useSchoolCommand} from "@/api/commands";
import {useAccountScope} from "@/ui/AccountScope";
import {ApiResponseError} from "@/api/client";
import {billingMonth,invoiceDetail,invoiceState,invoiceSummary,invoiceCorrectionInput,invoiceCorrectionResult,type InvoiceDetail,type Locale} from "@madrasty/contracts";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {StartConversation} from "@/features/comms/StartConversation";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {ConfirmedAt} from "@/ui/RecordValues";
import {billingCopy,FeeLines,financeAmount} from "./invoice-ui";
import {TransferDetails} from "./TransferDetails";
import {receiptCopy} from "./receipt-ui";

const rows=invoiceSummary.array();
export function InvoiceDetails({locale,invoice,student,period,canPost,canIssue=false,staff=true,initialState,initialQuery=""}:{locale:Locale;staff?:boolean;invoice?:string;student?:string;period?:string;canPost:boolean;canIssue?:boolean;initialState?:string;initialQuery?:string}){
  const text=billingCopy[locale],root=`/${locale}/school/more/invoices`;
  const [month,setMonth]=useState(period??""),[state,setState]=useState<string>(initialState==="open"||invoiceState.safeParse(initialState).success?initialState??"":""),[query,setQuery]=useState(initialQuery.slice(0,100)),[search,setSearch]=useState(initialQuery.slice(0,100));
  const valid=billingMonth.safeParse(month),filter=invoiceState.safeParse(state);
  const params=new URLSearchParams();
  if(valid.success)params.set("period",valid.data);
  if(state==="open"||filter.success)params.set("state",state);
  if(student)params.set("student",student);
  if(staff&&query.trim())params.set("q",query.trim());
  const context=params.toString(),listHref=root+(context?"?"+context:""),suffix=context?"&"+context:"";
  useEffect(()=>{
    if(invoice||!staff)return;
    const timer=setTimeout(()=>setQuery(search.trim()),220);
    return ()=>clearTimeout(timer);
  },[search,invoice,staff]);
  useEffect(()=>{
    if(invoice)return;
    const current=new URLSearchParams(window.location.search);
    for(const key of ["period","state","student","q"]){const next=new URLSearchParams(context).get(key);if(next)current.set(key,next);else current.delete(key);}
    const next=window.location.pathname+(current.size?"?"+current.toString():"");
    if(next!==window.location.pathname+window.location.search)window.history.replaceState(null,"",next);
  },[context,invoice]);

  const [revision,setRevision]=useState(0);
  const details=useTimetableRead(invoice?`/finance/invoices/${invoice}`:null,invoiceDetail,revision);
  const list=useAcademicPage(invoice?null:`/finance/invoices?limit=25${valid.success?"&period="+valid.data:""}${student?"&studentId="+student:""}${state==="open"?"&state=open":filter.success?"&state="+filter.data:""}${query?"&q="+encodeURIComponent(query):""}`,rows,0);
  return <section className={`${css.workspace} auth-form`}>
    <h1>{text.invoices}</h1>
    {invoice?<><Link className="plain-button" href={listHref}>{text.back}</Link>
      <TimetableRead locale={locale} result={details}>{(item)=><div className={css.invoiceDetail}>
        <p className={css.secondary}>{text[item.kind]} · <bdi>{financeDate(item.period,locale,"month")}</bdi></p>
        <div className={css.invoiceBalance}>
          <small>{text.balance}</small>
          <strong><bdi dir="ltr">{financeAmount(item.balanceMinor,item.currency,locale)}</bdi></strong>
          <span className={css.statePill} data-state={item.state}>{text[item.state]}</span>
          <small>{text.due} · <bdi>{financeDate(item.dueDate,locale)}</bdi></small>
        </div>
        <div className={css.invoiceActions}>
          {canPost&&item.balanceMinor>0&&item.state!=="cancelled"&&<Link className="primary-button" href={`/${locale}/school/more/record-payment?invoice=${item.id}${suffix}`}>{receiptCopy[locale].record}</Link>}
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
          <Link className={css.recordRow} href={`/${locale}/school/more/receipts?receipt=${id}&invoice=${item.id}${suffix}`}><span>{receiptCopy[locale].open} {index+1}</span><span className={css.chevron} aria-hidden="true"/></Link>
        </li>)}</ul>}
        {staff&&canIssue&&item.correction&&<InvoiceCorrection key={item.id+":"+item.revision} locale={locale} item={item} root={root} suffix={suffix} refresh={()=>setRevision(n=>n+1)}/>}
        {item.canInquire&&<StartConversation locale={locale} label={text.ask} target={{kind:"office",id:"accounts"}}
          context={{kind:"invoice",id:item.id}}/>}
        <ConfirmedAt locale={locale} value={item.issuedAt}/>
      </div>}</TimetableRead>
    </>:<>
      {canIssue&&<Link className="primary-button" href={`/${locale}/school/more/issue-invoices${valid.success?"?period="+valid.data:""}`}>{locale==="ar"?"+ إنشاء فاتورة":"+ Rechnung erstellen"}</Link>}
      {staff&&<form className={css.search} onSubmit={e=>{e.preventDefault();setQuery(search.trim());}}>
        <label><span className={css.searchLabel}>{text.search}</span><input type="search" value={search} maxLength={100} onChange={e=>setSearch(e.target.value)}/></label>
        <button className="plain-button" type="submit">{text.find}</button>
      </form>}
      <div className={css.panel}><div className={css.tabs} aria-label={text.status}>{[["",locale==="ar"?"الكل":"Alle"],["open",locale==="ar"?"مستحقة":"Offen"],["paid",text.paid],["cancelled",text.cancelled]].map(([key,label])=><button type="button" className="plain-button" aria-pressed={state===key} key={key} onClick={()=>setState(key)}>{label}</button>)}</div><details className={css.disclosure} open={initialState==="open"?true:undefined}><summary>{locale==="ar"?"تصفية":"Filter"}</summary><div className="header-actions">
        <FinanceDateField locale={locale} label={text.period} type="month" value={month} onChange={(event)=>setMonth(event.target.value)}/>
        <label>{text.status}<select value={state} onChange={(event)=>setState(event.target.value)}>
          <option value="">{text.allStates}</option><option value="open">{locale==="ar"?"غير مدفوعة بالكامل":"Offene Rechnungen"}</option>{invoiceState.options.map((key)=><option value={key} key={key}>{text[key]}</option>)}
        </select></label>
      </div></details></div>
      <AcademicPageItems locale={locale} page={list} emptyMessage={locale==="ar"?(staff?"لا توجد فواتير تطابق الاختيار.":"لا توجد فواتير لأطفالك في الفترة المختارة. ستظهر هنا عند إصدارها."):(staff?"Keine Rechnungen für diese Auswahl.":"Hier erscheinen die Rechnungen Ihrer Kinder, sobald sie ausgestellt sind.")}>{(invoices)=><ul className={css.recordList}>
        {invoices.map((item)=><li key={item.id}>
          <Link className={`${css.recordRow} ${css.invoiceRow}`} href={`${root}?invoice=${item.id}${suffix}`}><span><strong><bdi>{item.studentName}</bdi></strong><small><bdi>{financeDate(item.period,locale,"month")}</bdi> · <bdi>{item.invoiceNumber}</bdi></small></span><span className={css.recordValue}><strong><bdi dir="ltr">{financeAmount(item.balanceMinor>0?item.balanceMinor:item.totalMinor,item.currency,locale)}</bdi></strong><small data-state={item.state}>{text[item.state]}</small></span><span className={css.chevron} aria-hidden="true"/></Link>
          {canPost&&item.balanceMinor>0&&item.state!=="cancelled"&&<Link className={`plain-button ${css.invoiceQuickAction}`} href={`/${locale}/school/more/record-payment?invoice=${item.id}&from=list${suffix}`}>{receiptCopy[locale].record}</Link>}
        </li>)}
      </ul>}</AcademicPageItems>
    </>}
  </section>;
}

function InvoiceCorrection({locale,item,root,suffix,refresh}:{locale:Locale;item:InvoiceDetail;root:string;suffix:string;refresh:()=>void}){
  const ar=locale==="ar",command=useSchoolCommand(useAccountScope().persona),router=useRouter(),lock=useRef(false);
  const [reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[attempted,setAttempted]=useState(false);
  const correction=item.correction;
  if(!correction)return null;
  async function submit(event:FormEvent,kind:"cancel"|"reissue"){
    event.preventDefault();setAttempted(true);setError("");
    if(lock.current)return;
    const input=invoiceCorrectionInput.safeParse(kind==="cancel"?{kind,revision:item.revision,reason}:{kind,revision:item.revision});
    if(!input.success)return;
    lock.current=true;setBusy(true);
    try{
      const changed=await command(`/finance/invoices/${item.id}/corrections`,"POST",input.data,invoiceCorrectionResult);
      if(kind==="reissue")router.push(root+"?invoice="+changed.id+suffix);
      else refresh();
    }catch(problem){
      if(problem instanceof ApiResponseError&&problem.status===409)setError(ar?"الفاتورة اتغيرت. حدّث الصفحة قبل إعادة المحاولة.":"Die Rechnung wurde geändert. Bitte aktualisieren.");
      else setError(timetableError(locale,problem));
    }finally{lock.current=false;setBusy(false);}
  }
  return <details className={css.disclosure}>
    <summary>{ar?"تصحيح الفاتورة":"Rechnung korrigieren"}</summary>
    {correction.reason&&<p>{ar?"سبب الإلغاء":"Stornogrund"} · <bdi>{correction.reason}</bdi></p>}
    {correction.replacementId&&<Link className="plain-button" href={root+"?invoice="+correction.replacementId+suffix}>{ar?"فتح الفاتورة البديلة":"Ersatzrechnung öffnen"}</Link>}
    {correction.canCancel&&<form className="auth-form" noValidate onSubmit={event=>void submit(event,"cancel")}>
      <p>{ar?"سيتم إلغاء المطالبة بالمبلغ مع الاحتفاظ بالفاتورة الأصلية. لا يتم رد أي مبلغ بهذه العملية.":"Die Forderung wird storniert. Die ursprüngliche Rechnung bleibt erhalten. Es wird kein Geld erstattet."}</p>
      <label>{ar?"سبب الإلغاء":"Stornogrund"}<textarea value={reason} disabled={busy} maxLength={500} aria-invalid={attempted&&reason.trim().length<3} onChange={event=>setReason(event.target.value)}/></label>
      {attempted&&reason.trim().length<3&&<p role="alert">{ar?"اكتب سببًا من ٣ حروف على الأقل.":"Gib einen Grund mit mindestens 3 Zeichen ein."}</p>}
      <button className="primary-button" disabled={busy}>{ar?"تأكيد إلغاء الفاتورة":"Rechnung stornieren"}</button>
    </form>}
    {correction.canReissue&&<form className="auth-form" onSubmit={event=>void submit(event,"reissue")}>
      <p>{ar?"إصدار فاتورة جديدة بنفس البنود والمبلغ والشهر، باستخدام مسؤول السداد المحدد الآن لذلك الشهر.":"Neue Rechnung mit denselben Positionen, demselben Betrag und Monat, aber mit dem aktuell für diesen Monat hinterlegten Zahler."}</p>
      <button className="primary-button" disabled={busy}>{ar?"إصدار فاتورة بديلة":"Ersatzrechnung erstellen"}</button>
    </form>}
    {!correction.canCancel&&!correction.canReissue&&!correction.replacementId&&<p>{ar?"التصحيح غير متاح. راجع السداد أو تسويات الاشتراك أولًا.":"Korrektur nicht möglich. Prüfe zuerst Zahlungen oder Gebührenkorrekturen."}</p>}
    {error&&<p role="alert">{error}</p>}
  </details>;
}
