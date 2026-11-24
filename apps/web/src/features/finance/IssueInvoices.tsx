"use client";

import Link from "next/link";
import {useState,type FormEvent} from "react";
import {
  billingMonth,billingOptions,billingPupil,invoiceBatch,invoicePreview,invoicePreviewInput,
  type InvoicePreview,type Locale,
} from "@madrasty/contracts";
import {ApiResponseError,requestApi} from "@/api/client";
import {webHeaders} from "@/api/client-headers";
import {useSchoolCommand} from "@/api/commands";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {billingCopy,emptyFeeLine,FeeLines,FeeLinesEditor,financeAmount,formatFeeLines} from "./invoice-ui";

const pupils=billingPupil.array();
type PreviewReceipt=ReturnType<typeof invoiceBatch.parse>;
type Student=ReturnType<typeof billingPupil.parse>;
type Options=ReturnType<typeof billingOptions.parse>;

export function IssueInvoices({locale,initialStudent,mayConfigureBank}:{locale:Locale;initialStudent?:string;mayConfigureBank:boolean}){
  const setup=useTimetableRead("/finance/billing-options",billingOptions),text=billingCopy[locale];
  return <section className="auth-card auth-form">
    <h1>{text.issue}</h1>
    <TimetableRead locale={locale} result={setup}>{(options)=><InvoiceIssuer locale={locale} initial={options} preferred={initialStudent}
      mayConfigureBank={mayConfigureBank}/>}</TimetableRead>
  </section>;
}

function InvoiceIssuer({locale,initial,preferred,mayConfigureBank}:{locale:Locale;initial:Options;preferred?:string;mayConfigureBank:boolean}){
  const text=billingCopy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [period,setPeriod]=useState(initial.period),[classId,setClass]=useState(""),[dueDate,setDueDate]=useState("");
  const [kind,setKind]=useState<"monthly"|"manual">("monthly"),[missing,setMissing]=useState(true);
  const [term,setTerm]=useState(""),[query,setQuery]=useState(""),[explicit,setExplicit]=useState(!!preferred);
  const [picked,setPicked]=useState<Student[]>([]),[initialId,setInitialId]=useState(preferred);
  const [manualKey,setManualKey]=useState<string>(),[lines,setLines]=useState([emptyFeeLine()]);
  const [preview,setPreview]=useState<InvoicePreview>(),[receipt,setReceipt]=useState<PreviewReceipt>(),[refresh,setRefresh]=useState(0);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const month=billingMonth.safeParse(period);
  const options=useTimetableRead(month.success&&period!==initial.period?`/finance/billing-options?period=${period}`:null,billingOptions,refresh);
  const current=period===initial.period?initial:options.value?.data;
  const students=useAcademicPage(month.success&&explicit&&!preview?
    `/finance/pupils?limit=30&period=${period}&missing=${kind==="monthly"&&missing}${classId?"&classId="+classId:""}&q=${encodeURIComponent(query)}`:null,pupils,refresh);
  const studentIds=Array.from(new Set([...picked.map((one)=>one.id),...(initialId?[initialId]:[])]));
  const scope={period,classId:classId||undefined,dueDate:dueDate||undefined};
  const root=`/${locale}/school/more`;
  function pick(student:Student){
    setInitialId(undefined);
    setPicked((chosen)=>kind==="manual"?[student]:
      chosen.some((item)=>item.id===student.id)?chosen.filter((item)=>item.id!==student.id):[...chosen,student]);
  }
  function changePeriod(value:string){
    setPeriod(value);setClass("");setPicked([]);setInitialId(undefined);setReceipt(undefined);
  }
  async function showPreview(event:FormEvent){
    event.preventDefault();
    if(!month.success||busy||explicit&&!studentIds.length)return;
    setBusy(true);setError("");setReceipt(undefined);
    const key=manualKey??crypto.randomUUID();
    if(kind==="manual")setManualKey(key);
    const proposed=invoicePreviewInput.safeParse(kind==="monthly"?{...scope,kind,studentIds:explicit?studentIds:undefined}:
      {...scope,kind,studentIds,chargeSourceId:key,lineItems:formatFeeLines(lines,current?.currency??null)});
    if(!proposed.success){setBusy(false);return;}
    try{
      const reply=await requestApi("/finance/invoice-previews",invoicePreview,{
        method:"POST",headers:webHeaders(persona),body:JSON.stringify(proposed.data),
      });
      setPreview(reply.data);
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  async function issue(){
    if(!preview||busy)return;
    setBusy(true);setError("");
    try{
      const response=await command("/finance/invoice-batches","POST",{previewId:preview.previewId,revision:preview.revision},invoiceBatch);
      setReceipt(response);setPreview(undefined);setRefresh((n)=>n+1);
      if(kind==="manual"){setManualKey(undefined);setLines([emptyFeeLine()]);}
    }catch(problem){
      if(problem instanceof ApiResponseError&&problem.status===409){setPreview(undefined);setError(text.stale);setRefresh((n)=>n+1);}
      else setError(timetableError(locale,problem));
    }finally{setBusy(false);}
  }

  return <>
    <div className="header-actions">
      <Link className="plain-button" href={`${root}/fee-settings`}>{text.settings}</Link>
      <Link className="plain-button" href={`${root}/invoices`}>{text.invoices}</Link>
    </div>
    {!initial.bankReady&&<p>{locale==="ar"?"السداد النقدي متاح. حساب التحويل اختياري.":"Barzahlung möglich. Bankkonto optional."} {mayConfigureBank&&<Link href={`${root}/bank`}>{text.bank}</Link>}</p>}
    {error&&<p role="alert">{error}</p>}
    {receipt&&<div className="notice auth-form" role="status">
      <p>{text.issued} · {receipt.issuedIds.length} · {text.existing} {receipt.existingIds.length} · {text.skipped} {receipt.skipped.length}</p>
      {receipt.issuedIds.length===1?<Link className="plain-button" href={`${root}/invoices?invoice=${receipt.issuedIds[0]}`}>{text.open}</Link>:
        <Link className="plain-button" href={`${root}/invoices?period=${period}`}>{text.invoices}</Link>}
    </div>}
    {preview?<div className="auth-form">
      <h2>{text.preview} · <bdi>{preview.period}</bdi></h2>
      {!preview.rows.length&&<p>{text.not_enrolled}</p>}
      <ul className="group-list">{preview.rows.map((row)=><li key={row.studentId} className="timetable-day auth-form">
        <h3><bdi>{row.studentName}</bdi> · <bdi>{row.studentNumber}</bdi></h3>
        <p>{text[row.outcome]}</p>
        {row.payerName&&<p>{text.payer} · <bdi>{row.payerName}</bdi></p>}
        {row.dueDate&&<p>{text.due} · <bdi>{row.dueDate}</bdi></p>}
        {row.currency&&row.lines.length>0&&<><p>{text.total} · <bdi>{financeAmount(row.totalMinor,row.currency)}</bdi></p>
          <FeeLines locale={locale} lines={row.lines} currency={row.currency}/></>}
        {row.outcome==="payer_missing"&&<Link className="plain-button" href={`${root}/fee-settings?student=${row.studentId}`}>{text.payer}</Link>}
        {row.outcome==="tariff_missing"&&<Link className="plain-button" href={`${root}/fee-settings`}>{text.tariffs}</Link>}
        {row.existingId&&<Link className="plain-button" href={`${root}/invoices?invoice=${row.existingId}`}>{text.open}</Link>}
      </li>)}</ul>
      <div className="header-actions">
        <button type="button" className="primary-button" disabled={busy||!preview.rows.some((row)=>row.outcome==="ready")} onClick={()=>void issue()}>
          {busy?text.busy:text.confirm}
        </button>
        <button type="button" className="plain-button" disabled={busy} onClick={()=>setPreview(undefined)}>{text.edit}</button>
      </div>
    </div>:<form className="auth-form" onSubmit={(event)=>void showPreview(event)}>
      <label>{text.period}<input dir="ltr" type="month" value={period} required onChange={(event)=>changePeriod(event.target.value)}/></label>
      <label>{text.status}<select value={kind} onChange={(event)=>{
        const selected=event.target.value==="manual"?"manual":"monthly";
        setKind(selected);if(selected==="manual")setExplicit(true);setPicked([]);setInitialId(preferred);setManualKey(undefined);
      }}>
        <option value="monthly">{text.monthly}</option><option value="manual">{text.manual}</option>
      </select></label>
      {current&&current.classes.length>0&&<label>{text.classes}<select value={classId} onChange={(event)=>{setClass(event.target.value);setPicked([]);setInitialId(undefined);}}>
        <option value="">{text.allClasses}</option>
        {current.classes.map((item)=><option key={item.id} value={item.id}>{item.code} · {locale==="ar"?item.nameAr:item.nameDe}</option>)}
      </select></label>}
      <label>{text.due}<input dir="ltr" type="date" value={dueDate} onChange={(event)=>setDueDate(event.target.value)}/></label>
      {kind==="monthly"&&<label><input type="checkbox" checked={explicit} onChange={(event)=>setExplicit(event.target.checked)}/>{text.pupils}</label>}
      {!explicit&&<p>{text.allPupils}</p>}
      {explicit&&<div className="auth-form">
        {kind==="monthly"&&<label><input type="checkbox" checked={missing} onChange={(event)=>setMissing(event.target.checked)}/>{text.missing}</label>}
        <label>{text.search}<input type="search" value={term} maxLength={100} onChange={(event)=>setTerm(event.target.value)}/></label>
        <button className="plain-button" type="button" onClick={()=>setQuery(term.trim())}>{text.find}</button>
        <p>{text.selected} · {studentIds.length}</p>
        {studentIds.length>0&&<button className="plain-button" type="button" onClick={()=>{setPicked([]);setInitialId(undefined);}}>{text.clear}</button>}
        <AcademicPageItems locale={locale} page={students}>{(choices)=><ul className="group-list">{choices.map((item)=><li key={item.id}>
          <button type="button" className="plain-button" aria-pressed={studentIds.includes(item.id)} onClick={()=>pick(item)}>
            <bdi>{item.studentName}</bdi> · <bdi>{item.studentNumber}</bdi>
          </button>
        </li>)}</ul>}</AcademicPageItems>
      </div>}
      {kind==="manual"&&<FeeLinesEditor locale={locale} lines={lines} update={setLines} currency={current?.currency??null} busy={busy}/>}
      <button className="primary-button" type="submit" disabled={busy||!month.success||explicit&&!studentIds.length||
        kind==="manual"&&(studentIds.length!==1||!formatFeeLines(lines,current?.currency??null))}>{busy?text.busy:text.preview}</button>
    </form>}
  </>;
}
