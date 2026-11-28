"use client";

import { useState,type FormEvent } from "react";
import {
  examAnnounce,examAnnouncementReceipt,examChange,examCreate,examEntry,examKind,lessonReceipt,
  type ExamEntry,type Locale,
} from "@madrasty/contracts";
import { ApiResponseError } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { dictionary } from "@/i18n";
import { TimetableRead,timetableError,useTimetableRead } from "@/features/school/timetable/shared";
import { useAccountScope } from "@/ui/AccountScope";
import { AssessmentScope,type AssessmentContext } from "./AssessmentScope";
import { AcademicPageItems,scoreInput,useAcademicPage } from "./shared";
import { ExamMarks } from "./ExamMarks";
import { examCopy,examPoints } from "./exam-copy";

const examRows=examEntry.array();

function dateAndTime(date:string,time?:string|null){return time?`${date} · ${time}`:date;}

export function Exams({locale,initialChild,initial,initialClass}:{locale:Locale;initialChild?:string;initial?:string;initialClass?:string}){
  const {persona}=useAccountScope();
  return <>
    <h1>{examCopy[locale].heading}</h1>
    {persona==="admin"&&initialClass?<>
      <p className="notice">{locale==="ar"?"امتحانات الفصل المحدد · للمتابعة فقط":"Prüfungen dieser Klasse · Nur ansehen"}</p>
      <ExamList locale={locale} classId={initialClass} scope={{version:0}}/>
    </>:<AssessmentScope locale={locale} initialChild={initialChild} initial={initial}
      allow={(item)=>item.canPlan||item.canGrade||item.canPublish}
      staffEmptyMessage={locale==="ar"?"لا توجد فصول أو مواد متاحة لعرض الامتحانات حاليًا.":"Derzeit sind keine Klassen oder Fächer für Prüfungen verfügbar."}>
      {(scope)=><ExamList key={scope.child??scope.offering?.id??"exam"} locale={locale} scope={scope}/>}
    </AssessmentScope>}
  </>;
}
function ExamList({locale,scope,classId}:{locale:Locale;scope:AssessmentContext;classId?:string}){
  const text=examCopy[locale],{child,offering,version}=scope;
  const [id,setId]=useState(scope.initial),[create,setCreate]=useState(false),[updated,setUpdated]=useState(0),[notice,setNotice]=useState("");
  const search=child?`&childId=${child}`:classId?`&classId=${classId}`:offering?`&offeringId=${offering.id}`:"";
  const page=useAcademicPage(`/academics/exams?limit=25${search}`,examRows,version+updated);
  const detail=useTimetableRead(id?`/academics/exams/${id}${child?`?childId=${child}`:""}`:null,examEntry,version+updated);
  return <section className="auth-card auth-form">
    {notice&&<p role="status">{notice}</p>}
    {id?<>
      <button type="button" className="plain-button" onClick={()=>{setId(undefined);setNotice("");}}>{text.back}</button>
      <TimetableRead locale={locale} result={detail}>{(item)=><ExamDetails key={item.id} locale={locale} item={item}
        guardian={Boolean(child)} version={version+updated} changed={(message)=>{if(message)setNotice(message);setUpdated((n)=>n+1);}}/>}</TimetableRead>
    </>:<>
      {offering?.canPlan&&<button type="button" className={create?"plain-button":"primary-button"} onClick={()=>setCreate(true)}>{text.newExam}</button>}
      {offering?.canPlan&&create&&<ExamForm locale={locale} offering={offering.id} cancel={()=>setCreate(false)}
        saved={(key)=>{setCreate(false);setId(key);setNotice(text.saved);setUpdated((n)=>n+1);}}/>}
      <AcademicPageItems locale={locale} page={page} emptyMessage={child
        ? (locale==="ar"?"لا توجد امتحانات مسجلة لهذا الطفل حاليًا.":"Für dieses Kind sind derzeit keine Prüfungen eingetragen.")
        : (locale==="ar"?"لم يتم تسجيل امتحانات لهذا الفصل حتى الآن.":"Für diese Klasse sind noch keine Prüfungen eingetragen.")}>{(items)=><ul className="group-list">{items.map((item)=><li key={item.id}>
        <button type="button" className="group-row" onClick={()=>{setId(item.id);setNotice("");}}>
          <bdi>{item.title}</bdi><span>{text[item.kind]}</span><bdi dir="ltr">{dateAndTime(item.date,item.time)}</bdi>
          <span>{child?(item.resultId?text.result:text.pending):item.announcementId?text.announced:text.draft}</span>
        </button>
      </li>)}</ul>}</AcademicPageItems>
    </>}
  </section>;
}
function ExamDetails({locale,item,guardian,version,changed}:{
  locale:Locale;item:ExamEntry;guardian:boolean;version:number;changed:(message?:string)=>void;
}){
  const text=examCopy[locale];
  const [edit,setEdit]=useState(false),[announce,setAnnounce]=useState(false),[roster,setRoster]=useState(false);
  return <>
    <h2 dir="auto">{item.title}</h2>
    <p><bdi>{item.classCode}</bdi> · <bdi>{locale==="ar"?item.subjectNameAr:item.subjectNameDe}</bdi> · {text[item.kind]}</p>
    {!guardian&&<p>{text.date} · <bdi dir="ltr">{dateAndTime(item.date,item.time)}</bdi></p>}
    <p>{item.announcedDate?<>{text.announced} · <bdi dir="ltr">{dateAndTime(item.announcedDate,item.announcedTime)}</bdi></>:text.draft}</p>
    {!guardian&&item.announcementPending&&<p>{text.unannounced}</p>}
    {guardian?<section className="notice">
      <h3>{text.result}</h3>
      {item.resultId&&item.resultMaxScore!==null?<>
        <p><bdi>{examPoints(locale,item.resultScore,item.resultMaxScore)}</bdi></p>
        {item.resultDate&&<p><bdi dir="ltr">{item.resultDate}</bdi></p>}
        {item.resultFeedback&&<><h4>{text.feedback}</h4><p dir="auto" style={{whiteSpace:"pre-wrap"}}>{item.resultFeedback}</p></>}
      </>:<p>{text.pending}</p>}
    </section>:<>
      <p>{text.maximum} · <bdi>{new Intl.NumberFormat(locale,{maximumFractionDigits:4}).format(item.maxScore)}</bdi></p>
      {!edit&&!announce&&<div className="header-actions">
        {item.canEdit&&<button type="button" className="plain-button" onClick={()=>setEdit(true)}>{text.edit}</button>}
        {item.canAnnounce&&<button type="button" className="plain-button" onClick={()=>setAnnounce(true)}>{item.announcementId?text.reschedule:text.announce}</button>}
        {item.canReview&&<button type="button" className="plain-button" aria-expanded={roster} onClick={()=>setRoster((open)=>!open)}>{text.marks}</button>}
      </div>}
      {edit&&item.canEdit&&<ExamForm locale={locale} offering={item.offeringId} item={item}
        cancel={()=>setEdit(false)} saved={()=>{setEdit(false);changed(text.saved);}}/>}
      {announce&&item.canAnnounce&&<ScheduleReview locale={locale} item={item} cancel={()=>setAnnounce(false)}
        saved={()=>{setAnnounce(false);changed(text.published);}} refresh={()=>changed()}/>}
      {roster&&item.canReview&&<ExamMarks locale={locale} exam={item} version={version} changed={changed}/>}
    </>}
    <button type="button" className="plain-button" onClick={()=>changed()}>{text.refresh}</button>
  </>;
}
function ExamForm({locale,offering,item,cancel,saved}:{locale:Locale;offering:string;item?:ExamEntry;cancel:()=>void;saved:(id:string)=>void}){
  const text=examCopy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [revision]=useState(item?.revision);
  const [draft,setDraft]=useState({title:item?.title??"",date:item?.date??"",time:item?.time??"",kind:item?.kind??"written",
    maximum:item?String(item.maxScore):""});
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function save(event:FormEvent){
    event.preventDefault();
    const input={title:draft.title,date:draft.date,time:draft.time||null,kind:draft.kind,maxScore:scoreInput(draft.maximum)};
    const data=item?examChange.safeParse({...input,revision}):examCreate.safeParse({...input,offeringId:offering});
    if(!data.success){setError(dictionary(locale)["error.validation"]);return;}
    setBusy(true);setError("");
    try{
      const result=await command(item?`/academics/exams/${item.id}`:"/academics/exams",item?"PATCH":"POST",data.data,lessonReceipt);
      saved(result.id);
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  return <form className="auth-form" onSubmit={save}>
    <label>{text.title}<input required maxLength={200} dir="auto" value={draft.title}
      onChange={(event)=>setDraft({...draft,title:event.target.value})}/></label>
    <label>{text.date}<input type="date" required value={draft.date} onChange={(event)=>setDraft({...draft,date:event.target.value})}/></label>
    <label>{text.time}<input type="time" value={draft.time} onChange={(event)=>setDraft({...draft,time:event.target.value})}/></label>
    <label>{text.kind}<select value={draft.kind} onChange={(event)=>setDraft({...draft,kind:examKind.parse(event.target.value)})}>
      {examKind.options.map((kind)=><option value={kind} key={kind}>{text[kind]}</option>)}
    </select></label>
    <label>{text.maximum}<input inputMode="decimal" required maxLength={24} value={draft.maximum}
      onChange={(event)=>setDraft({...draft,maximum:event.target.value})}/></label>
    {error&&<p role="alert">{error}</p>}
    <div className="header-actions">
      <button type="submit" className="primary-button" disabled={busy}>{text.save}</button>
      <button type="button" className="plain-button" onClick={cancel} disabled={busy}>{text.cancel}</button>
    </div>
  </form>;
}
function ScheduleReview({locale,item,cancel,saved,refresh}:{locale:Locale;item:ExamEntry;cancel:()=>void;saved:()=>void;refresh:()=>void}){
  const text=examCopy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [base]=useState(item.revision),[date,setDate]=useState(item.date),[time,setTime]=useState(item.time??"");
  const [reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(event:FormEvent){
    event.preventDefault();
    const input=examAnnounce.safeParse({revision:base,date,time:time||null});
    if(!input.success){setError(dictionary(locale)["error.validation"]);return;}
    if(!reviewed){setReviewed(true);setError("");return;}
    setBusy(true);setError("");
    try{
      await command(`/academics/exams/${item.id}/announce`,"POST",input.data,examAnnouncementReceipt);
      saved();
    }catch(problem){
      setError(timetableError(locale,problem));
      if(problem instanceof ApiResponseError&&[401,403,404,409].includes(problem.status))refresh();
    }finally{setBusy(false);}
  }
  return <form className="notice auth-form" onSubmit={submit}>
    <h3>{text.reviewSchedule}</h3>
    {reviewed?<><p dir="auto">{item.title} · {text[item.kind]}</p><p><bdi dir="ltr">{dateAndTime(date,time)}</bdi></p></>:<>
      <label>{text.date}<input type="date" required value={date} onChange={(event)=>setDate(event.target.value)}/></label>
      <label>{text.time}<input type="time" value={time} onChange={(event)=>setTime(event.target.value)}/></label>
    </>}
    {error&&<p role="alert">{error}</p>}
    <div className="header-actions">
      <button type="submit" className="primary-button" disabled={busy||base!==item.revision}>{reviewed?text.confirmSchedule:text.reviewSchedule}</button>
      {reviewed&&<button type="button" className="plain-button" disabled={busy} onClick={()=>setReviewed(false)}>{text.edit}</button>}
      <button type="button" className="plain-button" disabled={busy} onClick={cancel}>{text.cancel}</button>
    </div>
  </form>;
}
