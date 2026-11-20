"use client";

import { useEffect, useRef, useState } from "react";
import {
  attendanceChanges, attendanceClasses, attendancePendingSchema, attendanceSheetSchema, attendanceStatus,
  type AttendanceChanges, type AttendanceRow, type AttendanceSheet, type AttendanceStatus, type Locale,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { TimetableRead, useTimetableRead } from "@/features/school/timetable/shared";
import { RowDetails } from "./RowDetails";
import { useLiveAttendance } from "./LiveAttendance";
import { CachedAttendance } from "./CachedAttendance";
import { sheetSlot } from "./draft-store";
import { useAttendanceDrafts } from "./useAttendanceDrafts";

const words={
  ar:{title:"الحضور اليومي",date:"يوم الحضور",apply:"اعرض اليوم",select:"اختر الفصل",pending:"كشوف بانتظار الاعتماد",
    noPending:"ما فيش كشوف بانتظار الاعتماد في اليوم ده.",open:"افتح كشف الحضور",draft:"مسودة الحضور",
    approved:"تم اعتماد الكشف",unstarted:"الكشف لسه ما اتفتحش.",readonly:"الكشف للعرض فقط.",closed:"اليوم مغلق للتسجيل.",
    present:"حاضر",late:"متأخر",absent_unexcused:"غائب بدون عذر",absent_excused:"غائب بعذر",unmarked:"بدون تسجيل",
    markAll:"سجّل الحضور للي لسه من غير حالة",confirmAll:"تأكيد التسجيل الجماعي",save:"حفظ المسودة",
    approve:"اعتماد الحضور",confirmApproval:"اعتماد الكشف النهائي",locked:"الحالة مقفولة بسبب عذر الأسرة.",
    arrival:"حضور فعلي مؤكد",stale:"تغيّرت الحالة على الخادم.",outside:"الطالب خرج من كشف الفصل لليوم ده.",
    useServer:"استخدم الحالة المحفوظة",reapply:"احتفظ بتعديلي بالمراجعة الجديدة",tally:"كشف الحضور",refresh:"تحديث الكشف",
    conflicts:"بعض الحالات تحتاج مراجعة.",lockedCount:"صفوف مقفولة لم تتغيّر",more:"عرض المزيد",offline:"مسودات الحضور على الجهاز",
    pendingSend:"المسودة محفوظة على الجهاز وبانتظار المزامنة.",closedDraft:"الكشف مقفول. أي تعديلات غير مُرسلة لن تُحفظ لدى المدرسة."},
  de:{title:"Tägliche Anwesenheit",date:"Anwesenheitstag",apply:"Tag anzeigen",select:"Klasse auswählen",pending:"Listen zur Freigabe",
    noPending:"Für diesen Tag sind keine Freigaben offen.",open:"Anwesenheitsliste öffnen",draft:"Anwesenheitsentwurf",
    approved:"Liste bestätigt",unstarted:"Die Liste wurde noch nicht geöffnet.",readonly:"Die Liste kann nur gelesen werden.",closed:"Der Tag ist für die Erfassung geschlossen.",
    present:"Anwesend",late:"Verspätet",absent_unexcused:"Unentschuldigt abwesend",absent_excused:"Entschuldigt abwesend",unmarked:"Ohne Eintrag",
    markAll:"Alle ohne Eintrag als anwesend markieren",confirmAll:"Sammelerfassung bestätigen",save:"Entwurf speichern",
    approve:"Anwesenheit freigeben",confirmApproval:"Endgültige Anwesenheit bestätigen",locked:"Der Status ist durch eine Entschuldigung gesperrt.",
    arrival:"Ankunft bestätigt",stale:"Der gespeicherte Status hat sich geändert.",outside:"Das Kind gehört für diesen Tag nicht mehr zur Liste.",
    useServer:"Gespeicherten Status übernehmen",reapply:"Eigene Auswahl mit der neuen Version übernehmen",tally:"Anwesenheitsliste",refresh:"Liste aktualisieren",
    conflicts:"Einige Einträge müssen geprüft werden.",lockedCount:"Gesperrte Einträge blieben unverändert",more:"Weitere anzeigen",offline:"Anwesenheitsentwürfe auf dem Gerät",
    pendingSend:"Der Entwurf wurde auf dem Gerät gespeichert und wartet auf Abgleich.",closedDraft:"Die Liste ist geschlossen. Ungesendete Änderungen werden nicht bei der Schule gespeichert."},
} as const;

type Conflict=AttendanceChanges["conflicts"][number];
type Outcome={notice:string;problem?:boolean};

function explain(locale:Locale,error:unknown){
  return error instanceof ApiResponseError?localizedError(locale,error.messageKey):dictionary(locale)["error.unavailable"];
}

export function DailyAttendance({locale,initialClass,initialDate}:{
  locale:Locale;initialClass?:string;initialDate?:string;
}){
  const text=words[locale],{persona}=useAccountScope();
  const [selected,setSelected]=useState(initialClass??"");
  const [date,setDate]=useState(initialDate??"");
  const [dateInput,setDateInput]=useState(initialDate??"");
  const [version,setVersion]=useState(0);
  const classes=useTimetableRead(`/attendance/classes${date?`?date=${date}`:""}`,attendanceClasses,version);
  const chosen=classes.value?.data?.classes.find((row)=>row.id===selected);
  const exactDay=classes.value?.data?.date;

  useEffect(()=>{
    const focus=()=>setVersion((count)=>count+1);
    window.addEventListener("focus",focus);
    return ()=>window.removeEventListener("focus",focus);
  },[]);

  function refresh(){
    setVersion((version)=>version+1);
  }

  return <>
    <section className="auth-card">
      <form className="auth-form" onSubmit={(event)=>{event.preventDefault();setDate(dateInput||exactDay||"");}}>
        <label>{text.date}<input type="date" value={dateInput||exactDay||""} onChange={(event)=>setDateInput(event.target.value)}/></label>
        <button type="submit" className="plain-button">{text.apply}</button>
      </form>
      <a className="plain-button" href="/offline/attendance.html">{text.offline}</a>
      <TimetableRead locale={locale} result={classes}>{(catalog)=>catalog.classes.length?
        <label>{text.select}<select value={chosen?.id??""} onChange={(event)=>setSelected(event.target.value)}>
          <option value="">{text.select}</option>
          {catalog.classes.map((room)=><option value={room.id} key={room.id}>{room.code} · {locale==="ar"?room.nameAr:room.nameDe}</option>)}
        </select></label>:<AsyncSurface locale={locale} state={{kind:"empty"}}/>}</TimetableRead>
    </section>
    {persona==="admin"&&exactDay&&<Pending locale={locale} day={exactDay} version={version} choose={setSelected}/>}
    {chosen&&exactDay&&<Sheet key={`${chosen.id}/${exactDay}`} locale={locale} classId={chosen.id} day={exactDay}
      version={version} update={refresh}/>}
  </>;
}

function Pending({locale,day,version,choose}:{locale:Locale;day:string;version:number;choose:(id:string)=>void}){
  const text=words[locale],{persona}=useAccountScope();
  type PendingItem=ReturnType<typeof attendancePendingSchema.parse>["items"][number];
  const [result,setResult]=useState<{day:string;error?:unknown;items?:PendingItem[];cursor?:string}>();
  const [attempt,setAttempt]=useState(0);
  const [busy,setBusy]=useState(false);
  const [moreError,setMoreError]=useState("");
  const path=`/attendance/sheets?date=${day}` as const;
  const current=result?.day===day?result:undefined;

  useEffect(()=>{
    const abort=new AbortController();
    requestApi(path,attendancePendingSchema,{signal:abort.signal,headers:{"X-School-Persona":persona}})
      .then(({data,meta})=>{if(!abort.signal.aborted)setResult({day,items:data.items,cursor:meta?.nextCursor});})
      .catch((error)=>{if(!abort.signal.aborted)setResult({day,error});});
    return ()=>abort.abort();
  },[attempt,day,path,persona,version]);

  async function more(){
    if(!current?.cursor||busy)return;
    setBusy(true);
    setMoreError("");
    try{
      const page=await requestApi(`${path}&cursor=${current.cursor}`,attendancePendingSchema,{headers:{"X-School-Persona":persona}});
      setResult((old)=>old===current?{day,items:[...(old.items??[]),...page.data.items],cursor:page.meta?.nextCursor}:old);
    }catch(error){
      if(error instanceof ApiResponseError&&[401,403,404].includes(error.status))setResult({day,error});
      else setMoreError(explain(locale,error));
    }finally{setBusy(false);}
  }
  return <section className="auth-card">
    <h2>{text.pending}</h2>
    <AsyncSurface locale={locale} state={current?.error
      ? current.error instanceof ApiResponseError&&[401,403,404].includes(current.error.status)?{kind:"forbidden"}
        :{kind:"error",message:explain(locale,current.error),retry:()=>setAttempt((count)=>count+1)}
      :current?.items?{kind:"ready",content:<>
        {!current.items.length&&<p>{text.noPending}</p>}
        <ul className="group-list">{current.items.map((row)=><li key={row.id}>
          <button type="button" className="group-row" onClick={()=>choose(row.classId)}>
            <bdi>{row.classCode}</bdi><bdi>{locale==="ar"?row.nameAr:row.nameDe}</bdi>
          </button>
        </li>)}</ul>
        {current.cursor&&<button type="button" className="plain-button" disabled={busy} onClick={()=>void more()}>{text.more}</button>}
        {moreError&&<p role="alert">{moreError}</p>}
      </>}:{kind:"initialLoading"}}/>
  </section>;
}

function Sheet({locale,classId,day,version,update}:{locale:Locale;classId:string;day:string;version:number;update:()=>void}){
  const text=words[locale],actor=useAccountScope(),{persona}=actor,command=useSchoolCommand(persona);
  const privateDraft=useAttendanceDrafts(actor,locale,sheetSlot(classId,day));
  const {drafts,setDrafts}=privateDraft;
  const [connection,setConnection]=useState(0);
  const lastSync=useRef<string | undefined>(undefined);
  const [patches,setPatches]=useState<Record<string,AttendanceRow>>({});
  const [issues,setIssues]=useState<Conflict[]>([]);
  const [pending,setPending]=useState(false);
  const [outcome,setOutcome]=useState<Outcome>();
  const [confirm,setConfirm]=useState<{
    kind:"bulk"|"approve";rows:{rowId:string;revision:number}[];approvalRevision?:number;
  }>();
  const path=`/attendance/classes/${classId}/days/${day}` as const;
  const current=useTimetableRead(path,attendanceSheetSchema,version);
  const sheet=current.value?.data;
  function patchRows(rows:AttendanceRow[]){
    if(rows.some((row)=>!sheet?.rows.some((saved)=>saved.id===row.id))){update();return;}
    setPatches((old)=>{
      const changes={...old};
      for(const row of rows)if(!changes[row.id]||changes[row.id].revision<row.revision)changes[row.id]=row;
      return changes;
    });
  }
  useLiveAttendance(path,sheet?.state==="open"?sheet.id:null,persona,{patch:patchRows,refresh:update});
  const error=current.value?.error;
  const lost=error instanceof ApiResponseError&&[401,403,404].includes(error.status);
  useEffect(()=>{
    if(lost){privateDraft.forget();setPatches({});setIssues([]);setConfirm(undefined);}
  },[lost,privateDraft.forget]);

  useEffect(()=>{
    if(sheet&&privateDraft.ready)privateDraft.accept(sheet);
  },[sheet,privateDraft.accept,privateDraft.ready]);

  useEffect(()=>{
    const connected=()=>setConnection((count)=>count+1);
    window.addEventListener("online",connected);
    window.addEventListener("focus",connected);
    return ()=>{window.removeEventListener("online",connected);window.removeEventListener("focus",connected);};
  },[]);

  useEffect(()=>{
    if(!privateDraft.ready||!privateDraft.local?.sync||!sheet?.id||pending||!navigator.onLine)return;
    const key=`${sheet.id}/${connection}`;
    if(lastSync.current===key)return;
    lastSync.current=key;
    void action(async()=>{
      const {data}=await requestApi(path,attendanceSheetSchema,{headers:{"X-School-Persona":persona}});
      const result=await privateDraft.send(data,true);
      if(result.changes)applyChanges(result.changes);
      else if(!data.canMark||data.state!=="open")update();
    });
  },[connection,pending,persona,privateDraft.ready,privateDraft.local?.sync,sheet?.id]);

  async function action(operation:()=>Promise<void>){
    setPending(true);
    setOutcome(undefined);
    try {await operation();}
    catch(error){
      if(error instanceof ApiResponseError&&[401,403,404,409].includes(error.status))update();
      setOutcome({notice:explain(locale,error),problem:true});
    }finally{setPending(false);setConfirm(undefined);}
  }
  function discard(id:string){
    setDrafts((current)=>{const after={...current};delete after[id];return after;});
    setIssues((current)=>current.filter((item)=>item.rowId!==id));
  }
  function draft(row:AttendanceRow,status:AttendanceStatus|null){
    if(row.status===status){discard(row.id);return;}
    setDrafts((current)=>({...current,[row.id]:{status,revision:row.revision}}));
    setIssues((current)=>current.filter((item)=>item.rowId!==row.id));
  }
  function applyChanges(changes:AttendanceChanges){
    setIssues(changes.conflicts);
    const notice=changes.conflicts.length?text.conflicts:changes.skippedLocked.length
      ?`${text.lockedCount} · ${changes.skippedLocked.length}`:dictionary(locale).saved;
    setOutcome({notice,problem:changes.conflicts.length>0});
    update();
  }

  if(!lost&&error&&privateDraft.local)return <CachedAttendance locale={locale} entry={privateDraft.local} error={privateDraft.storageUnavailable}
    edit={(row,status)=>setDrafts((existing)=>{
      const next={...existing};
      if(row.status===status)delete next[row.id];
      else next[row.id]={status,revision:row.revision};
      return next;
    },true)}/>;
  return <TimetableRead locale={locale} result={current}>{(confirmed:AttendanceSheet)=>{
    const rows=confirmed.rows.map((row)=>patches[row.id]?.revision>row.revision?patches[row.id]:row);
    const counts={unmarked:0,present:0,late:0,absent_unexcused:0,absent_excused:0};
    for(const row of rows)counts[row.status??"unmarked"]++;
    const value={...confirmed,rows,counts};
    const editable=value.state==="open"&&value.canMark;
    const rowsById=new Map(value.rows.map((row)=>[row.id,row]));
    const remaining=Object.keys(drafts).filter((id)=>!rowsById.has(id));
    const bulk=value.rows.filter((row)=>row.status===null&&!drafts[row.id]&&!row.confirmedArrivalAt);
    const edits=Object.entries(drafts).map(([rowId,edit])=>({rowId,...edit}));
    const id=value.id;
    return <section className="auth-card auth-form">
      <div className="header-actions">
        <h2><bdi>{locale==="ar"?value.classroom.nameAr:value.classroom.nameDe}</bdi></h2>
        <bdi dir="ltr">{value.schoolDate}</bdi>
        <button type="button" className="plain-button" disabled={pending} onClick={update}>{text.refresh}</button>
      </div>
      {!value.teachingDay&&<p className="notice">{text.closed}{value.closedReason&&<> <bdi>{value.closedReason}</bdi></>}</p>}
      {value.state==="unstarted"&&<>
        <p>{text.unstarted}</p>
        {(value.canMark||value.canApprove)&&<button type="button" className="primary-button" disabled={pending} onClick={()=>void action(async()=>{
          await command(`${path}/open`,"POST",{},attendanceSheetSchema);
          update();
        })}>{text.open}</button>}
      </>}
      {id&&<>
        <h3>{value.state==="approved"?text.approved:text.draft}</h3>
        {!editable&&edits.length>0&&<p role="status">{text.closedDraft}</p>}
        {value.approvedAt&&<bdi>{new Date(value.approvedAt).toLocaleString(locale==="ar"?"ar":"de-DE")}</bdi>}
        {value.state==="open"&&!editable&&!value.canApprove&&value.teachingDay&&<p>{text.readonly}</p>}
        <ul className="group-list" aria-label={text.tally}>
          {Object.entries(value.counts).map(([status,count])=><li key={status} className="group-row">
            <span>{text[status as keyof typeof value.counts]}</span><output>{new Intl.NumberFormat(locale).format(count)}</output>
          </li>)}
        </ul>
        <ul className="group-list">
          {value.rows.map((row)=>{
            const local=drafts[row.id];
            const race=issues.find((entry)=>entry.rowId===row.id);
            const conflict=(local&&local.revision!==row.revision)||Boolean(race);
            return <li key={row.id} className="timetable-day">
              <strong><bdi>{row.displayName}</bdi></strong> <small><bdi dir="ltr">{row.studentNumber}</bdi></small>
              {editable&&!row.locked&&!row.confirmedArrivalAt?<label>
                <span className="screen-reader-only">{row.displayName}</span>
                <select disabled={pending||!privateDraft.ready} value={(local?local.status:row.status)??""} onChange={(event)=>{
                  const status=event.target.value?attendanceStatus.parse(event.target.value):null;
                  draft(row,status);
                }}>
                  <option value="">{text.unmarked}</option>
                  {attendanceStatus.options.map((status)=><option key={status} value={status}>{text[status]}</option>)}
                </select>
              </label>:<p>{text[row.status??"unmarked"]}</p>}
              {row.locked&&<p>{text.locked}</p>}
              {row.confirmedArrivalAt&&<p>{text.arrival}</p>}
              {(row.locked || editable&&!row.confirmedArrivalAt) && <RowDetails locale={locale} id={row.id}
                revision={row.revision} markable={editable} changed={(changed)=>{discard(changed.id);patchRows([changed]);update();}}/>}
              {conflict&&<div className="notice">
                <p>{row.locked?text.locked:row.confirmedArrivalAt?text.arrival:text.stale} · {text[row.status??"unmarked"]}</p>
                <button type="button" className="plain-button" disabled={pending} onClick={()=>discard(row.id)}>{text.useServer}</button>
                {local&&editable&&!row.locked&&!row.confirmedArrivalAt&&<button type="button" className="plain-button"
                  disabled={pending} onClick={()=>draft(row,local.status)}>{text.reapply}</button>}
              </div>}
            </li>;
          })}
          {remaining.map((id)=><li className="notice" key={id}>{text.outside}
            <button type="button" className="plain-button" onClick={()=>discard(id)}>{text.useServer}</button>
          </li>)}
        </ul>
        {editable&&<div className="header-actions">
          <button type="button" className="primary-button" disabled={pending||!edits.length} onClick={()=>void action(async()=>{
            const result=await privateDraft.send(value);
            if(result.changes)applyChanges(result.changes);
            else if(result.queued)setOutcome({notice:text.pendingSend});
          })}>{text.save}</button>
          <button type="button" className="plain-button" disabled={pending||!bulk.length} onClick={()=>setConfirm({kind:"bulk",rows:bulk.map(({id,revision})=>({rowId:id,revision}))})}>{text.markAll}</button>
          {confirm?.kind==="bulk"&&<button type="button" className="plain-button" disabled={pending} onClick={()=>void action(async()=>{
            applyChanges(await command(`/attendance/sheets/${id}/mark-present`,"POST",{
              rows:confirm.rows,
            },attendanceChanges));
          })}>{text.confirmAll}</button>}
        </div>}
        {value.canApprove&&value.approvalRevision&&<div className="header-actions">
          <button type="button" className="plain-button" disabled={pending||Boolean(value.counts.unmarked||edits.length)}
            onClick={()=>setConfirm({kind:"approve",approvalRevision:value.approvalRevision??undefined,rows:value.rows.map(({id,revision})=>({rowId:id,revision}))})}>{text.approve}</button>
          {confirm?.kind==="approve"&&<button type="button" className="primary-button"
            disabled={pending||Boolean(value.counts.unmarked||edits.length)} onClick={()=>void action(async()=>{
              await command(`/attendance/sheets/${id}/approve`,"POST",{
                approvalRevision:confirm.approvalRevision,expectedRows:confirm.rows,
              },attendanceSheetSchema);
              setOutcome({notice:text.approved});
              update();
            })}>{text.confirmApproval}</button>}
        </div>}
      </>}
      {outcome&&<p role={outcome.problem?"alert":"status"}>{outcome.notice}</p>}
    </section>;
  }}</TimetableRead>;
}
