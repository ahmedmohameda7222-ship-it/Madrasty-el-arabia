"use client";

import { useState,type FormEvent } from "react";
import {
  examMarkInput,examMarkReceipt,examResultBatchReceipt,examResultCorrect,examResultCorrectionReceipt,
  examResultHistory,examResultPublish,examRosterRow,type ExamEntry,type ExamRosterRow,type Locale,
} from "@madrasty/contracts";
import { ApiResponseError } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { dictionary } from "@/i18n";
import { TimetableRead,timetableError,useTimetableRead } from "@/features/school/timetable/shared";
import { useAccountScope } from "@/ui/AccountScope";
import { AcademicPageItems,scoreInput,useAcademicPage } from "./shared";
import { examCopy,examPoints } from "./exam-copy";

const roster=examRosterRow.array(),history=examResultHistory.array();
type Chosen={studentId:string;name:string;revision:number;score:number};
export function ExamMarks({locale,exam,version,changed}:{
  locale:Locale;exam:ExamEntry;version:number;changed:(message?:string)=>void;
}){
  const {persona}=useAccountScope(),text=examCopy[locale],command=useSchoolCommand(persona);
  const [selected,setSelected]=useState<Record<string,Chosen>>({});
  const [review,setReview]=useState<{revision:number;rows:Chosen[]}>();
  const [updated,setUpdated]=useState(0),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const page=useAcademicPage(`/academics/exams/${exam.id}/marks?limit=30`,roster,version+updated);
  const entries=Object.values(selected);
  const number=new Intl.NumberFormat(locale);
  function pick(row:ExamRosterRow,include:boolean){
    if(row.score===null)return;
    const choice={studentId:row.studentId,name:row.studentName,revision:row.revision,score:row.score};
    setSelected((old)=>{
      const result={...old};
      if(include)result[row.studentId]=choice;
      else delete result[row.studentId];
      return result;
    });
  }
  function refresh(){
    setUpdated((n)=>n+1);
    changed();
  }
  async function publish(){
    if(!review||review.revision!==exam.revision)return;
    const input=examResultPublish.safeParse({revision:review.revision,reviewedRows:review.rows.map(({studentId,revision})=>({studentId,revision}))});
    if(!input.success){setNotice(dictionary(locale)["error.validation"]);return;}
    setBusy(true);setNotice("");
    try{
      await command(`/academics/exams/${exam.id}/results/publish`,"POST",input.data,examResultBatchReceipt);
      setSelected({});setReview(undefined);changed(text.batchDone);
    }catch(problem){
      setNotice(timetableError(locale,problem));
      if(problem instanceof ApiResponseError&&[401,403,404,409].includes(problem.status)){
        setReview(undefined);setSelected({});refresh();
      }
    }finally{setBusy(false);}
  }
  return <section className="auth-form">
    <h3>{text.marks}</h3>
    {exam.canPublish&&entries.length>0&&!review&&<button className="plain-button" type="button"
      onClick={()=>setReview({revision:exam.revision,rows:entries})}>{text.batchReview} · {number.format(entries.length)}</button>}
    {review&&exam.canPublish&&<div className="notice auth-form">
      <h4>{text.batchReview}</h4>
      <ul className="group-list">{review.rows.map((row)=><li className="group-row" key={row.studentId}>
        <bdi>{row.name}</bdi><bdi>{examPoints(locale,row.score,exam.maxScore)}</bdi>
      </li>)}</ul>
      <button className="primary-button" type="button" disabled={busy||review.revision!==exam.revision} onClick={()=>void publish()}>{text.batchConfirm}</button>
      <button className="plain-button" type="button" disabled={busy} onClick={()=>setReview(undefined)}>{text.cancel}</button>
    </div>}
    {notice&&<p role="alert">{notice}</p>}
    <AcademicPageItems locale={locale} page={page}>{(rows)=><ul className="group-list">{rows.map((row)=><li key={row.studentId} className="timetable-day">
      <strong><bdi>{row.studentName}</bdi></strong> · <bdi dir="ltr">{row.studentNumber}</bdi>
      <p>{row.publishedId?text.result:text.pending} · <bdi>{examPoints(locale,row.score,row.publishedMaxScore??exam.maxScore)}</bdi></p>
      {row.score!==null&&!row.publishedId&&!row.readyToPublish&&<p>{text.rescheduleMark}</p>}
      {exam.canPublish&&row.readyToPublish&&<label>
        <input type="checkbox" checked={selected[row.studentId]?.revision===row.revision} disabled={busy||Boolean(review)}
          onChange={(event)=>pick(row,event.target.checked)}/>{text.reviewed}
      </label>}
      <ExamMark locale={locale} exam={exam} row={row} locked={busy||Boolean(review)}
        saved={(message)=>{pick(row,false);changed(message);}} refresh={refresh}/>
    </li>)}</ul>}</AcademicPageItems>
  </section>;
}

function ExamMark({locale,exam,row,locked,saved,refresh}:{
  locale:Locale;exam:ExamEntry;row:ExamRosterRow;locked:boolean;saved:(message:string)=>void;refresh:()=>void;
}){
  const {persona}=useAccountScope(),text=examCopy[locale],command=useSchoolCommand(persona);
  const [edit,setEdit]=useState<{raw:string;feedback:string;reason:string;revision:number;examRevision:number}>();
  const [showHistory,setShowHistory]=useState(false),[reviewed,setReviewed]=useState(false);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const published=Boolean(row.publishedId);
  const root=`/academics/exams/${exam.id}` as const;
  const records=useTimetableRead(showHistory?`${root}/results/${row.studentId}/history`:null,history,row.revision);
  function start(){
    setEdit({raw:row.score===null?"":String(row.score),feedback:row.feedback??"",reason:"",revision:row.revision,examRevision:exam.revision});
    setNotice("");setReviewed(false);
  }
  async function save(event:FormEvent){
    event.preventDefault();
    if(!edit)return;
    const score=scoreInput(edit.raw),feedback=edit.feedback.trim()||null;
    const body={score,feedback,revision:edit.revision};
    const input=published?examResultCorrect.safeParse({...body,reason:edit.reason,examRevision:edit.examRevision})
      :examMarkInput.safeParse(body);
    if(!input.success||score!==null&&score>exam.maxScore){setNotice(dictionary(locale)["error.validation"]);return;}
    if(published&&!reviewed){setReviewed(true);setNotice("");return;}
    setBusy(true);setNotice("");
    try{
      if(published)await command(`${root}/results/${row.studentId}/correct`,"POST",input.data,examResultCorrectionReceipt);
      else await command(`${root}/marks/${row.studentId}`,"PUT",input.data,examMarkReceipt);
      setEdit(undefined);setReviewed(false);saved(published?text.corrected:text.markSaved);
    }catch(problem){
      setNotice(timetableError(locale,problem));
      if(problem instanceof ApiResponseError&&[401,403,404].includes(problem.status))setEdit(undefined);
      if(problem instanceof ApiResponseError&&[401,403,404,409].includes(problem.status))refresh();
    }finally{setBusy(false);}
  }
  return <>
    {row.feedback&&<p dir="auto" style={{whiteSpace:"pre-wrap"}}>{row.feedback}</p>}
    {!edit&&(row.canMark||row.canCorrect)&&<button className="plain-button" type="button" disabled={locked} onClick={start}>
      {published?text.correction:text.mark}
    </button>}
    {edit&&(row.canMark||row.canCorrect)&&<form className="auth-form" onSubmit={save}>
      {reviewed?<div className="notice">
        <strong>{text.reviewCorrection}</strong>
        <p><bdi>{examPoints(locale,scoreInput(edit.raw),exam.maxScore)}</bdi></p>
        {edit.feedback&&<p dir="auto">{edit.feedback}</p>}<p dir="auto">{edit.reason}</p>
      </div>:<>
        <label>{text.score}<input inputMode="decimal" maxLength={24} value={edit.raw}
          onChange={(event)=>setEdit({...edit,raw:event.target.value})}/></label>
        <label>{text.feedback}<textarea rows={3} maxLength={3000} value={edit.feedback}
          onChange={(event)=>setEdit({...edit,feedback:event.target.value})}/></label>
        {published&&<label>{text.reason}<textarea rows={3} required maxLength={500} value={edit.reason}
          onChange={(event)=>setEdit({...edit,reason:event.target.value})}/></label>}
      </>}
      <div className="header-actions">
        <button type="submit" className="primary-button" disabled={busy||locked||edit.revision!==row.revision||edit.examRevision!==exam.revision}>
          {published?(reviewed?text.confirmCorrection:text.reviewCorrection):text.save}
        </button>
        {reviewed&&<button type="button" className="plain-button" disabled={busy} onClick={()=>setReviewed(false)}>{text.edit}</button>}
        <button type="button" className="plain-button" disabled={busy} onClick={()=>{setEdit(undefined);setNotice("");}}>{text.cancel}</button>
      </div>
    </form>}
    {notice&&<p role="alert">{notice}</p>}
    {published&&<button type="button" className="plain-button" aria-expanded={showHistory} onClick={()=>setShowHistory((open)=>!open)}>{text.history}</button>}
    {showHistory&&<TimetableRead locale={locale} result={records}>{(versions)=><ul className="group-list">{versions.map((entry)=><li
      className="timetable-day" key={entry.publicationId}>
      <bdi>{examPoints(locale,entry.score,entry.maxScore)}</bdi>
      <p><bdi>{entry.occurredAt}</bdi>{entry.actorName&&<> · <bdi>{entry.actorName}</bdi></>}</p>
      {entry.feedback&&<p dir="auto">{entry.feedback}</p>}{entry.reason&&<p dir="auto">{entry.reason}</p>}
    </li>)}</ul>}</TimetableRead>}
  </>;
}
