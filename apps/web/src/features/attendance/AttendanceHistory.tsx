"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  approvedAttendanceEntry, attendanceCancellationSchema, attendanceCorrectionSchema, attendanceRevisionHistory, attendanceStatus,
  childSummarySchema, familyAttendanceHistory, staffAttendanceQuery,
  type ApprovedAttendanceEntry, type AttendanceRevisionHistory, type AttendanceStatus, type Locale,
} from "@madrasty/contracts";
import { ApiResponseError,requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary,localizedError } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { TimetableRead,useTimetableRead } from "@/features/school/timetable/shared";

const copy={
  ar:{title:"تاريخ الحضور",from:"من تاريخ",to:"إلى تاريخ",filter:"عرض السجل",status:"حالة الحضور",all:"كل الحالات",child:"الطفل",
    present:"حاضر",late:"متأخر",absent_unexcused:"غائب بدون عذر",absent_excused:"غائب بعذر",cancelled:"يوم دراسي ملغى",
    preliminary:"أعذار استلمتها المدرسة وفي انتظار الاعتماد",seeExcuse:"عرض إيصال العذر",empty:"ما فيش حضور معتمد في الفترة دي.",
    more:"عرض المزيد",detail:"تفاصيل الاعتماد والتصحيحات",back:"رجوع لسجل الحضور",approval:"الاعتماد الأصلي",correction:"تصحيح معتمد",
    calendar_cancellation:"إلغاء اليوم بعد الاعتماد",correct:"تصحيح الحالة",cancelDate:"إلغاء اليوم الدراسي لهذا الفصل",
    reason:"سبب التصحيح",preview:"مراجعة التغيير",confirm:"اعتماد التصحيح",confirmCancel:"تأكيد إلغاء اليوم",
    current:"الحالة المعتمدة الحالية",after:"الحالة المقترحة",reviewReason:"السبب المحفوظ مع التصحيح",updated:"اتحفظ التصحيح.",
    calendarDone:"اليوم اتلغى وسجل الاعتماد الأصلي محفوظ.",calendarExplain:"اليوم الملغى هيخرج من إجماليات الحضور.",
    original:"حالة قبل التغيير",date:"اليوم الدراسي"},
  de:{title:"Anwesenheitsverlauf",from:"Ab Datum",to:"Bis Datum",filter:"Verlauf anzeigen",status:"Anwesenheitsstatus",all:"Alle Status",child:"Kind",
    present:"Anwesend",late:"Verspätet",absent_unexcused:"Unentschuldigt abwesend",absent_excused:"Entschuldigt abwesend",cancelled:"Unterrichtstag abgesagt",
    preliminary:"Eingegangene Entschuldigungen vor Freigabe",seeExcuse:"Entschuldigungsbeleg anzeigen",empty:"Für diesen Zeitraum liegt keine bestätigte Anwesenheit vor.",
    more:"Weitere anzeigen",detail:"Bestätigung und Korrekturen",back:"Zurück zum Anwesenheitsverlauf",approval:"Ursprüngliche Bestätigung",correction:"Bestätigte Korrektur",
    calendar_cancellation:"Absage nach Bestätigung",correct:"Anwesenheitsstatus korrigieren",cancelDate:"Unterrichtstag für diese Klasse absagen",
    reason:"Begründung der Korrektur",preview:"Änderung prüfen",confirm:"Korrektur bestätigen",confirmCancel:"Absage des Tages bestätigen",
    current:"Aktuell bestätigter Status",after:"Vorgeschlagener Status",reviewReason:"Hinterlegte Begründung",updated:"Die Korrektur wurde gespeichert.",
    calendarDone:"Der Tag wurde abgesagt. Die ursprüngliche Bestätigung bleibt erhalten.",calendarExplain:"Der abgesagte Tag zählt nicht zur Anwesenheitsstatistik.",
    original:"Vorheriger Status",date:"Schultag"},
} as const;

type Filters={from:string;to:string;status:string};
const initial={from:"",to:"",status:""};
const childrenSchema=childSummarySchema.array();
const staffRows=approvedAttendanceEntry.array();
const affected=(error:unknown)=>error instanceof ApiResponseError&&[401,403,404].includes(error.status);

function message(locale:Locale,error:unknown){
  return error instanceof ApiResponseError?localizedError(locale,error.messageKey):dictionary(locale)["error.unavailable"];
}

export function AttendanceHistory({locale,childId,classId,rowId}:{
  locale:Locale;childId?:string;classId?:string;rowId?:string;
}){
  const text=copy[locale],{persona}=useAccountScope();
  const [child,setChild]=useState(childId??"");
  const [row,setRow]=useState(rowId);
  const [draft,setDraft]=useState(initial);
  const [filter,setFilter]=useState(initial);
  const [validation,setValidation]=useState("");
  const guardian=persona==="guardian";
  const [refresh,setRefresh]=useState(0);
  const childOptions=useTimetableRead(guardian?"/me/children?limit=100":null,childrenSchema,refresh);
  useEffect(()=>{
    const reload=()=>setRefresh((count)=>count+1);
    window.addEventListener("focus",reload);
    return()=>window.removeEventListener("focus",reload);
  },[]);
  const params=new URLSearchParams({limit:"30"});
  if(filter.from)params.set("from",filter.from);
  if(filter.to)params.set("to",filter.to);
  if(!guardian&&filter.status)params.set("status",filter.status);
  if(!guardian&&classId)params.set("classId",classId);
  const current=guardian?childOptions.value?.data?.find(({id})=>id===child)?.id:undefined;

  return <>
    <h1>{text.title}</h1>
    {row&&!guardian?<><button className="plain-button" onClick={()=>setRow(undefined)}>{text.back}</button>
      <RecordHistory key={row} locale={locale} id={row} revision={refresh} />
    </>:<>
      <form className="auth-card auth-form" onSubmit={(event)=>{
        event.preventDefault();
        const query=staffAttendanceQuery.safeParse({from:draft.from||undefined,to:draft.to||undefined,status:draft.status||undefined});
        if(query.success){setFilter(draft);setValidation("");}
        else setValidation(dictionary(locale)["error.validation"]);
      }}>
        {guardian&&<TimetableRead locale={locale} result={childOptions}>{(values)=><label>{text.child}
          <select value={current??""} onChange={(event)=>setChild(event.target.value)}>
            <option value="">{dictionary(locale).choose}</option>
            {values.map((value)=><option key={value.id} value={value.id}>{value.displayName}</option>)}
          </select>
        </label>}</TimetableRead>}
        <label>{text.from}<input type="date" value={draft.from} onChange={(event)=>setDraft({...draft,from:event.target.value})}/></label>
        <label>{text.to}<input type="date" value={draft.to} onChange={(event)=>setDraft({...draft,to:event.target.value})}/></label>
        {!guardian&&<label>{text.status}<select value={draft.status} onChange={(event)=>setDraft({...draft,status:event.target.value})}>
          <option value="">{text.all}</option>
          {[...attendanceStatus.options,"cancelled" as const].map((option)=><option key={option} value={option}>{text[option]}</option>)}
        </select></label>}
        <button className="plain-button" type="submit">{text.filter}</button>
        {validation&&<p role="alert">{validation}</p>}
      </form>
      {guardian&&child&&childOptions.value?.data&&!current&&<AsyncSurface locale={locale} state={{kind:"forbidden"}}/>}
      {(!guardian||current)&&<HistoryRows locale={locale} child={current} params={params.toString()} refresh={refresh} open={guardian?undefined:setRow}/>}
    </>}
  </>;
}

type HistoryPage={
  entries:ApprovedAttendanceEntry[];
  ownPreliminary: ReturnType<typeof familyAttendanceHistory.parse>["ownPreliminary"];
  cursor?:string;
};
function HistoryRows({locale,child,params,refresh,open}:{locale:Locale;child?:string;params:string;refresh:number;open?:(id:string)=>void}){
  const text=copy[locale],{persona}=useAccountScope();
  const path=child?`/children/${child}/attendance?${params}` as const:`/attendance/history?${params}` as const;
  const [result,setResult]=useState<{path:string;page?:HistoryPage;error?:unknown}>();
  const [attempt,setAttempt]=useState(0);
  const [loading,setLoading]=useState(false);
  const [failure,setFailure]=useState("");
  const known=result?.path===path?result:undefined;

  async function request(url:`/${string}`,signal?:AbortSignal){
    const headers={"X-School-Persona":persona};
    if(child){
      const {data,meta}=await requestApi(url,familyAttendanceHistory,{signal,headers});
      return {...data,cursor:meta?.nextCursor};
    }
    const {data,meta}=await requestApi(url,staffRows,{signal,headers});
    return {entries:data,ownPreliminary:[],cursor:meta?.nextCursor};
  }

  useEffect(()=>{
    const abort=new AbortController();
    void request(path,abort.signal).then((page)=>{if(!abort.signal.aborted)setResult({path,page});})
      .catch((error)=>{if(!abort.signal.aborted)setResult({path,error});});
    return()=>abort.abort();
  },[path,refresh,attempt,persona]);

  async function more(){
    const before=known?.page;
    if(!before?.cursor||loading)return;
    setLoading(true);setFailure("");
    try{
      const page=await request(`${path}&cursor=${encodeURIComponent(before.cursor)}`);
      setResult((old)=>old?.page===before?{path,page:{...page,entries:[...before.entries,...page.entries]}}:old);
    }catch(error){
      if(affected(error))setResult({path,error});
      else setFailure(message(locale,error));
    }finally{setLoading(false);}
  }
  const page=known?.page;
  return <AsyncSurface locale={locale} state={known?.error
    ? affected(known.error)?{kind:"forbidden"}:{kind:"error",message:message(locale,known.error),retry:()=>setAttempt((count)=>count+1)}
    : page?{kind:"ready",content:<>
      {child&&page.ownPreliminary.length>0&&<section className="auth-card">
        <h2>{text.preliminary}</h2>
        <ul className="group-list">{page.ownPreliminary.map((entry)=><li className="group-row" key={entry.id}>
          <bdi dir="ltr">{entry.schoolDate}</bdi>
          <Link className="plain-button" href={`/${locale}/school/children/${child}/excuse?date=${entry.schoolDate}`}>{text.seeExcuse}</Link>
        </li>)}</ul>
      </section>}
      <section className="auth-card">
        {!page.entries.length&&<p>{text.empty}</p>}
        <ul className="group-list">{page.entries.map((entry)=><li className="timetable-day" key={entry.id}>
          <bdi dir="ltr">{entry.schoolDate}</bdi> · <bdi>{locale==="ar"?entry.classNameAr:entry.classNameDe}</bdi>
          {open&&<p><bdi>{entry.studentName}</bdi> · <bdi dir="ltr">{entry.studentNumber}</bdi></p>}
          <p>{entry.status?text[entry.status]:text.cancelled}</p>
          {open&&<button className="plain-button" onClick={()=>open(entry.id)}>{text.detail}</button>}
        </li>)}</ul>
        {page.cursor&&<button className="plain-button" onClick={()=>void more()} disabled={loading}>{text.more}</button>}
        {failure&&<p role="alert">{failure}</p>}
      </section>
    </>}: {kind:"initialLoading"}}/>;
}

export function RecordHistory({locale,id,revision=0}:{locale:Locale;id:string;revision?:number}){
  const text=copy[locale],command=useAdminCommand();
  const [refresh,setRefresh]=useState(0);
  const [mode,setMode]=useState<"correct"|"cancel">();
  const [status,setStatus]=useState<AttendanceStatus>();
  const [reason,setReason]=useState("");
  const [review,setReview]=useState<{rowRevision:number;approvalRevision:number;reason:string;status?:AttendanceStatus}>();
  const [pending,setPending]=useState(false);
  const [notice,setNotice]=useState<{text:string;error:boolean}>();
  const record=useTimetableRead(`/attendance/rows/${id}/history`,attendanceRevisionHistory,refresh+revision);

  function start(next:"correct"|"cancel"){
    setMode(next);setStatus(undefined);setReason("");setReview(undefined);setNotice(undefined);
  }
  async function commit(current:AttendanceRevisionHistory){
    if(!review)return;
    setPending(true);setNotice(undefined);
    try{
      if(mode==="correct"&&review.status){
        await command(`/attendance/rows/${id}/corrections`,"POST",{revision:review.rowRevision,status:review.status,reason:review.reason},attendanceCorrectionSchema);
        setNotice({text:text.updated,error:false});
      }else if(mode==="cancel"){
        await command(`/attendance/sheets/${current.sheetId}/cancel-for-calendar`,"POST",{
          approvalRevision:review.approvalRevision,reason:review.reason,
        },attendanceCancellationSchema);
        setNotice({text:text.calendarDone,error:false});
      }
      setMode(undefined);
    }catch(error){setNotice({text:message(locale,error),error:true});}
    finally{setPending(false);setReview(undefined);setRefresh((count)=>count+1);}
  }

  return <TimetableRead locale={locale} result={record}>{(value)=><section className="auth-card auth-form">
    <h2><bdi>{value.row.displayName}</bdi></h2>
    <p>{text.date} · <bdi dir="ltr">{value.schoolDate}</bdi></p>
    {value.calendarCancelled&&<p>{text.cancelled}</p>}
    <p>{text.current} · {value.row.status?text[value.row.status]:text.cancelled}</p>
    <ul className="group-list">{value.revisions.map((entry)=><li key={entry.id} className="timetable-day">
      <strong>{text[entry.kind]}</strong>
      <p><bdi>{new Date(entry.occurredAt).toLocaleString(locale==="ar"?"ar":"de-DE")}</bdi>
        {entry.actorName&&<> · <bdi>{entry.actorName}</bdi></>}</p>
      {entry.priorStatus&&<p>{text.original} · {text[entry.priorStatus]}</p>}
      <p>{text[entry.status]}</p>
      {entry.reason&&<p><bdi>{entry.reason}</bdi></p>}
    </li>)}</ul>
    <div className="header-actions">
      {value.canCorrect&&<button className="plain-button" disabled={pending} onClick={()=>start("correct")}>{text.correct}</button>}
      {value.canCancel&&<button className="plain-button" disabled={pending} onClick={()=>start("cancel")}>{text.cancelDate}</button>}
    </div>
    {mode&&<form className="auth-form" onSubmit={(event)=>{
      event.preventDefault();
      if(reason.trim())setReview({rowRevision:value.row.revision,approvalRevision:value.approvalRevision,reason:reason.trim(),status});
    }}>
      {mode==="correct"&&<label>{text.after}<select required value={status??""} disabled={pending} onChange={(event)=>{
        setStatus(attendanceStatus.safeParse(event.target.value).data);setReview(undefined);
      }}>
        <option value="">{dictionary(locale).choose}</option>
        {attendanceStatus.options.filter((option)=>option!==value.row.status&&(!value.calendarCancelled||option!=="absent_unexcused"))
          .map((option)=><option value={option} key={option}>{text[option]}</option>)}
      </select></label>}
      {mode==="cancel"&&<p>{text.calendarExplain}</p>}
      <label>{text.reason}<textarea required maxLength={500} value={reason} disabled={pending}
        onChange={(event)=>{setReason(event.target.value);setReview(undefined);}}/></label>
      <button type="submit" className="plain-button" disabled={pending||!reason.trim()||(mode==="correct"&&!status)}>{text.preview}</button>
      {review&&<div className="notice">
        <p>{text.reviewReason} · <bdi>{review.reason}</bdi></p>
        {review.status&&<p>{text.after} · {text[review.status]}</p>}
        <button type="button" className="primary-button" disabled={pending} onClick={()=>void commit(value)}>
          {mode==="cancel"?text.confirmCancel:text.confirm}
        </button>
      </div>}
    </form>}
    {notice&&<p role={notice.error?"alert":"status"}>{notice.text}</p>}
  </section>}</TimetableRead>;
}
