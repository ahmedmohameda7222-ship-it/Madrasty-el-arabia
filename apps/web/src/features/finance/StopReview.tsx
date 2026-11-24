"use client";
import {FinanceDateField,financeDate} from "./FinanceDateField";

import css from "./FinanceWorkspace.module.css";

import Link from "next/link";
import {useState,type FormEvent} from "react";
import {stopRefund,stopRefundReceipt,stopResolution,stopReviewDetail,stopReviewState,stopReviewSummary,type StopReviewDetail,type Locale} from "@madrasty/contracts";
import {ApiResponseError} from "@/api/client";
import {useSchoolCommand} from "@/api/commands";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {ConfirmedAt} from "@/ui/RecordValues";
import {billingCopy,financeAmount,inputAmountMinor} from "./invoice-ui";
import {stopCopy} from "./stop-ui";

const reviews=stopReviewSummary.array();
export function StopReview({locale,id}:{locale:Locale;id?:string}){
  const text=stopCopy[locale],root=`/${locale}/school/more`;
  const [state,setState]=useState("open"),[refresh,setRefresh]=useState(0),[notice,setNotice]=useState("");
  const list=useAcademicPage(id?null:`/finance/stop-reviews?limit=25${state?"&status="+state:""}`,reviews,refresh);
  const detail=useTimetableRead(id?`/finance/stop-reviews/${id}`:null,stopReviewDetail,refresh);
  return <section className={`${css.workspace} auth-form`}>
    <h1>{text.reviewTitle}</h1>
    {notice&&<p role="status">{notice}</p>}
    {id?<><Link href={`${root}/stop-reviews`} className="plain-button">{text.back}</Link>
      <TimetableRead locale={locale} result={detail}>{(item)=><ReviewDocument key={item.revision+":"+refresh}
        locale={locale} item={item} updated={(value)=>{setNotice(value);setRefresh((n)=>n+1);}}/>}</TimetableRead>
    </>:<>
      <label>{billingCopy[locale].status}<select value={state} onChange={(event)=>setState(stopReviewState.safeParse(event.target.value).data??"")}>
        <option value="">{text.all}</option>{stopReviewState.options.map((key)=><option key={key} value={key}>{text[key]}</option>)}
      </select></label>
      <AcademicPageItems locale={locale} page={list}>{(items)=><ul className="group-list">{items.map((item)=><li className="timetable-day" key={item.id}>
        <Link className="group-row" href={`${root}/stop-reviews?review=${item.id}`}><bdi>{item.studentName}</bdi> · <bdi>{item.invoiceNumber}</bdi></Link>
        <p>{text[item.state]} · {billingCopy[locale][item.kind]} · <bdi>{financeDate(item.period,locale,"month")}</bdi> · <bdi dir="ltr">{financeAmount(item.originalAllocatedMinor,item.currency,locale)}</bdi></p>
      </li>)}</ul>}</AcademicPageItems>
    </>}
  </section>;
}

function ReviewDocument({locale,item,updated}:{locale:Locale;item:StopReviewDetail;updated:(message:string)=>void}){
  const text=stopCopy[locale],root=`/${locale}/school/more`;
  const money=(amount:number)=><bdi dir="ltr">{financeAmount(amount,item.currency,locale)}</bdi>;
  const [refund,setRefund]=useState<string>();
  return <div className="auth-form">
    <h2><bdi>{item.studentName}</bdi> · <bdi>{item.studentNumber}</bdi></h2>
    <Link href={`${root}/invoices?invoice=${item.invoiceId}`}><bdi>{item.invoiceNumber}</bdi></Link>
    <p>{text[item.state]} · {billingCopy[locale][item.kind]} · <bdi>{financeDate(item.period,locale,"month")}</bdi></p>
    <ConfirmedAt locale={locale} value={item.resolvedAt??item.openedAt}/>
    <dl className="account-values">
      <dt>{text.original}</dt><dd>{money(item.originalMinor)}</dd>
      <dt>{text.collectible}</dt><dd>{money(item.collectibleMinor)}</dd>
      <dt>{text.originalPaid}</dt><dd>{money(item.originalAllocatedMinor)}</dd>
      <dt>{text.activePaid}</dt><dd>{money(item.currentAllocatedMinor)}</dd>
    </dl>
    {item.reason&&<p>{text.reasonFinance} · <bdi>{item.reason}</bdi></p>}
    {item.adjustmentId&&<p>{text.adjustment} · <bdi>{item.adjustmentId}</bdi></p>}
    {item.funds.length>0&&<><h3>{text.funds}</h3><ul className="group-list">{item.funds.map((fund)=>{
      const available=Math.min(fund.unmatchedMinor,fund.sourceMinor-fund.activeMinor-fund.refundedMinor);
      return <li className="timetable-day auth-form" key={fund.receiptId}>
        <Link className="plain-button" href={`${root}/receipts?receipt=${fund.receiptId}`}>{text.originalReceipt} · <bdi>{fund.receiptNumber}</bdi></Link>
        <p>{text.originalPaid} {money(fund.sourceMinor)} · {text.activePaid} {money(fund.activeMinor)}</p>
        <p>{text.unallocated} {money(Math.max(0,available))}</p>
        {item.canPost&&fund.activeMinor>0&&<p>{text.unapplyFirst}</p>}
        {item.canPost&&available>0&&<button type="button" className="plain-button" onClick={()=>setRefund(refund===fund.receiptId?undefined:fund.receiptId)}>{text.refund}</button>}
        {refund===fund.receiptId&&available>0&&<RefundForm locale={locale} item={item} receiptId={fund.receiptId} available={available}
          updated={updated}/>}
      </li>;
    })}</ul></>}
    {item.canPost&&<ResolutionForm locale={locale} item={item} updated={updated}/>}
    {!item.canPost&&item.evidence.length>0&&<ul className="group-list">{item.evidence.map((one)=><li key={one.id}>
      {one.kind==="refund"?text.refundProof:text.reallocation} · <bdi>{one.reference}</bdi> · {money(one.amountMinor)}
    </li>)}</ul>}
  </div>;
}

function RefundForm({locale,item,receiptId,available,updated}:{
  locale:Locale;item:StopReviewDetail;receiptId:string;available:number;updated:(notice:string)=>void;
}){
  const text=stopCopy[locale],command=useSchoolCommand(useAccountScope().persona);
  const [reference,setReference]=useState(""),[date,setDate]=useState(""),[amount,setAmount]=useState(""),[verified,setVerified]=useState(false);
  const [preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const input=stopRefund.safeParse({receiptId,revision:item.revision,externalRefundRef:reference,refundedDate:date,
    amountMinor:inputAmountMinor(amount,item.currency,available),verified});
  async function save(event:FormEvent){
    event.preventDefault();
    if(!input.success||busy)return;
    if(!preview){setPreview(true);return;}
    setBusy(true);setError("");
    try{await command(`/finance/stop-reviews/${item.id}/refunds`,"POST",input.data,stopRefundReceipt);updated(text.refundSaved);}
    catch(problem){if(problem instanceof ApiResponseError&&problem.status===409)updated(text.stale);else setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  return <form className="auth-form" onSubmit={(event)=>void save(event)}>
    <p>{text.refundHint}</p>
    {error&&<p role="alert">{error}</p>}
    {preview&&input.success?<p><bdi>{input.data.externalRefundRef}</bdi> · <bdi>{input.data.refundedDate}</bdi> ·
      <bdi dir="ltr">{financeAmount(input.data.amountMinor,item.currency,locale)}</bdi></p>:<>
      <label>{text.refundRef}<input value={reference} maxLength={160} onChange={(event)=>setReference(event.target.value)} required/></label>
      <FinanceDateField locale={locale} label={text.refundDate} type="date" value={date} onChange={(event)=>setDate(event.target.value)} required/>
      <label>{text.refundAmount}<input dir="ltr" inputMode="decimal" value={amount} maxLength={24} onChange={(event)=>setAmount(event.target.value)} required/></label>
      <label><input type="checkbox" checked={verified} onChange={(event)=>setVerified(event.target.checked)}/>{text.verifyRefund}</label>
    </>}
    <div className="header-actions">
      <button type="submit" className="primary-button" disabled={busy||!input.success}>{preview?text.confirm:text.preview}</button>
      {preview&&<button type="button" className="plain-button" disabled={busy} onClick={()=>setPreview(false)}>{text.edit}</button>}
    </div>
  </form>;
}

function ResolutionForm({locale,item,updated}:{locale:Locale;item:StopReviewDetail;updated:(notice:string)=>void}){
  const text=stopCopy[locale],command=useSchoolCommand(useAccountScope().persona);
  const [resolution,setResolution]=useState<"waive"|"retain_manual">("waive");
  const [selected,setSelected]=useState<string[]>(item.evidence.filter((one)=>one.kind==="refund").map((one)=>one.id));
  const [reason,setReason]=useState(""),[preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [first,...remainder]=resolution==="waive"?selected:[];
  const input=stopResolution.safeParse({resolution,reason,revision:item.revision,receiptOrAdjustmentRef:first,references:remainder});
  const chosen=item.evidence.filter((one)=>selected.includes(one.id));
  const disposed=item.funds.every((fund)=>fund.sourceMinor===chosen.filter((one)=>one.receiptId===fund.receiptId)
    .reduce((sum,one)=>sum+one.amountMinor,0));
  const eligible=resolution==="retain_manual"?item.kind==="manual"&&item.originalAllocatedMinor===item.currentAllocatedMinor
    &&!item.evidence.some((one)=>one.kind==="refund"):item.currentAllocatedMinor===0&&disposed;
  async function save(event:FormEvent){
    event.preventDefault();
    if(!input.success||!eligible||busy)return;
    if(!preview){setPreview(true);return;}
    setBusy(true);setError("");
    try{const result=await command(`/finance/stop-reviews/${item.id}`,"PATCH",input.data,stopReviewDetail);updated(text[result.state]);}
    catch(problem){if(problem instanceof ApiResponseError&&problem.status===409)updated(text.stale);else setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  return <form className="auth-form" onSubmit={(event)=>void save(event)}>
    <h3>{text.review}</h3>
    {error&&<p role="alert">{error}</p>}
    {preview?<p>{resolution==="waive"?text.waiver:text.keep} · <bdi>{reason.trim()}</bdi></p>:<>
      <label>{billingCopy[locale].status}<select value={resolution} onChange={(event)=>setResolution(event.target.value==="retain_manual"?"retain_manual":"waive")}>
        <option value="waive">{text.waiver}</option>
        {item.kind==="manual"&&<option value="retain_manual">{text.keep}</option>}
      </select></label>
      {resolution==="waive"&&item.evidence.length>0&&<fieldset className="auth-form"><legend>{text.evidence}</legend>
        {item.evidence.map((one)=><label key={one.id}>
          <input type="checkbox" disabled={one.kind==="refund"} checked={selected.includes(one.id)}
            onChange={(event)=>setSelected((previous)=>event.target.checked?[...previous,one.id]:previous.filter((id)=>id!==one.id))}/>
          {one.kind==="refund"?text.refundProof:text.reallocation} · <bdi>{one.reference}</bdi> · <bdi dir="ltr">{financeAmount(one.amountMinor,item.currency,locale)}</bdi>
        </label>)}
      </fieldset>}
      {resolution==="waive"&&!eligible&&<p>{text.missingEvidence}</p>}
      <label>{text.reasonFinance}<textarea minLength={3} maxLength={800} value={reason}
        onChange={(event)=>setReason(event.target.value)} required/></label>
    </>}
    <div className="header-actions">
      <button type="submit" className="primary-button" disabled={!eligible||!input.success||busy}>{preview?text.confirmResolution:text.preview}</button>
      {preview&&<button type="button" className="plain-button" onClick={()=>setPreview(false)} disabled={busy}>{text.edit}</button>}
    </div>
  </form>;
}
