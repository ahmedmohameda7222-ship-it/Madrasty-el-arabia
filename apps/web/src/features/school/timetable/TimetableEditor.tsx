"use client";

import { useState, type FormEvent } from "react";
import {
  assignmentWithSubstitutesSchema, roomSchema, schoolClassSchema, subjectSchema,
  timetableDraftSlot, timetablePreviewSchema, timetableSavedSchema,
  timetableSlot, yearSchema, type DraftSlot, type Locale, type TimetablePreview,
  type TimetableRoom, type TimetableSlot,
} from "@madrasty/contracts";
import { requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { webHeaders } from "@/features/identity/SessionControls";
import { dictionary } from "@/i18n";
import { minutes, timetableError, timetableWords, TimetableRead, useTimetableRead, weekdayLabel } from "./shared";
import css from "./Timetable.module.css";

const years=yearSchema.array(), classes=schoolClassSchema.array(),
  assignments=assignmentWithSubstitutesSchema.array(), rooms=roomSchema.array(), subjects=subjectSchema.array();
type Queued={draft:DraftSlot;description:string};
type EditScope="single"|"future";
function parseTime(value:string) {
  if(value==="24:00")return 1440;
  const match=/^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value.trim());
  return match?Number(match[1])*60+Number(match[2]):NaN;
}
function nextDate(value:string) {
  const date=new Date(value+"T12:00:00Z");
  date.setUTCDate(date.getUTCDate()+1);
  return date.toISOString().slice(0,10);
}

export function TimetableEditor({locale,initial,occurrenceDate,initialClass,initialYear,pickClass,saved,close}:{
  locale:Locale;initial?:TimetableSlot;occurrenceDate?:string;initialClass?:string;initialYear?:string;
  pickClass:(id:string)=>void;saved:(record?:TimetableSlot,starts?:string)=>void;close:()=>void;
}) {
  const text=timetableWords[locale],common=dictionary(locale),command=useAdminCommand();
  const [yearId,setYearId]=useState(initial?.yearId??initialYear??"");
  const [classId,setClassId]=useState(initial?.classId??initialClass??"");
  const [subjectId,setSubjectId]=useState(initial?.subjectId??"");
  const [assignmentId,setAssignmentId]=useState(initial?.assignmentId??"");
  const [roomId,setRoomId]=useState(initial?.roomId??"");
  const [weekdays,setWeekdays]=useState<number[]>([initial?.weekday??1]);
  const [start,setStart]=useState(initial?minutes(initial.start):"09:00");
  const [end,setEnd]=useState(initial?minutes(initial.end):"10:00");
  const [from,setFrom]=useState(initial?.from??"");
  const [until,setUntil]=useState(initial?.untilExclusive??"");
  const [scope,setScope]=useState<EditScope>("single");
  const [queued,setQueued]=useState<Queued[]>([]);
  const [reviewed,setReviewed]=useState<TimetablePreview>();
  const [roomsOpen,setRoomsOpen]=useState(false);
  const [roomVersion,setRoomVersion]=useState(0);
  const [confirmCancel,setConfirmCancel]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState<{error:boolean;text:string}>();
  const yearCatalog=useTimetableRead("/school/years",years);
  const yearChoices=yearCatalog.value?.data?.filter(y=>y.state!=="closed")??[];
  const selectedYear=yearId||yearChoices[0]?.id||"";
  const classCatalog=useTimetableRead(selectedYear?`/school/classes?yearId=${selectedYear}&limit=100`:null,classes);
  const terms=useTimetableRead(classId?`/school/classes/${classId}/assignments`:null,assignments);
  const subjectCatalog=useTimetableRead("/school/subjects",subjects);
  const roomCatalog=useTimetableRead("/school/rooms",rooms,roomVersion);
  const teachers=(terms.value?.data??[]).filter(t=>!t.revoked
    &&(t.kind!=="subject"||t.subjectId===subjectId)
    &&(t.kind!=="subject"||!(terms.value?.data??[]).some(other=>other.staffId===t.staffId
      && !other.revoked && (other.kind==="primary"||other.kind==="support"))));
  const teacherChoices=teachers.filter((item,index,all)=>all.findIndex(x=>x.staffId===item.staffId)===index);
  const selected=teacherChoices.find(a=>a.id===assignmentId);
  const errors:Record<string,string>={assignmentId:text.teacher,subjectId:locale==="ar"?"المادة":"Fach",
    roomId:text.room,weekday:text.weekday,start:text.start,end:text.end,from:text.from,
    untilExclusive:text.until,classId:text.classroom,staffId:text.teacher};

  function invalidate(next:Queued[]) {setQueued(next);setReviewed(undefined);setNotice(undefined);}
  async function operation(action:()=>Promise<void>) {
    setBusy(true);setNotice(undefined);
    try {await action();} catch(error) {setNotice({error:true,text:timetableError(locale,error)});}
    finally {setBusy(false);}
  }
  function draftSlot(day:number):DraftSlot {
    return {assignmentId,subjectId,roomId,weekday:day,start:parseTime(start),end:parseTime(end),
      from:initial&&occurrenceDate?(scope==="single"?occurrenceDate:occurrenceDate):from,
      untilExclusive:initial&&occurrenceDate?(scope==="single"?nextDate(occurrenceDate):initial.untilExclusive):until};
  }
  function queue(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const list=weekdays.map(draftSlot);
    const valid=list.every(item=>timetableDraftSlot.safeParse(item).success)
      &&list.every(item=>item.start<item.end)&&selected&&subjectId&&weekdays.length;
    if(!valid){setNotice({error:true,text:text.interval});return;}
    const subject=subjectCatalog.value?.data?.find(item=>item.id===subjectId);
    const name=locale==="ar"?subject?.nameAr:subject?.nameDe;
    const teacher=selected.staffName;
    invalidate(initial?list.map(draft=>({draft,description:`${name??""} · ${teacher}`}))
      :[...queued,...list.map(draft=>({draft,description:`${name??""} · ${teacher}`}))]);
  }
  function editDraft(entry:Queued,index:number){
    const row=entry.draft;
    setAssignmentId(row.assignmentId);setSubjectId(row.subjectId??"");setRoomId(row.roomId);
    setWeekdays([row.weekday]);setStart(minutes(row.start));setEnd(minutes(row.end));
    setFrom(row.from);setUntil(row.untilExclusive);
    invalidate(queued.filter((_,i)=>i!==index));
  }
  async function preview(){
    const result=await requestApi("/school/timetable/preview",timetablePreviewSchema,{
      method:"POST",headers:webHeaders("admin"),
      body:JSON.stringify({yearId:selectedYear,slots:queued.map(({draft})=>draft),
        ...(initial&&{editingId:initial.id})}),
    });
    setReviewed(result.data);
  }
  async function save(){
    if(!reviewed?.canSave)return;
    const checked=reviewed.entries.flatMap(({slot})=>slot?[slot]:[]);
    if(checked.length!==queued.length||!checked[0])return;
    if(initial&&occurrenceDate){
      const changed=await command(`/school/timetable/${initial.id}`,"PATCH",{
        revision:initial.revision,yearRevision:reviewed.yearRevision,slot:checked[0],date:occurrenceDate,scope,
      },timetableSlot);
      saved(changed,occurrenceDate);
    }else if(initial){
      const changed=await command(`/school/timetable/${initial.id}`,"PATCH",{
        revision:initial.revision,yearRevision:reviewed.yearRevision,slot:checked[0],
      },timetableSlot);
      saved(changed,changed.from);
    }else{
      await command("/school/timetable","POST",{yearId:selectedYear,
        yearRevision:reviewed.yearRevision,slots:checked},timetableSavedSchema);
      setNotice({error:false,text:common.saved});invalidate([]);saved(undefined,checked[0].from);
    }
  }
  async function cancelLesson(){
    if(!initial||!occurrenceDate)return;
    const changed=await command(`/school/timetable/${initial.id}`,"PATCH",{
      revision:initial.revision,date:occurrenceDate,scope,cancel:true,
    },timetableSlot);
    saved(changed,occurrenceDate);
  }
  const noSubjects=subjectCatalog.value?.data?.length===0;
  const inEdit=Boolean(initial&&occurrenceDate);
  return <section className={css.editor} aria-label={initial?text.edit:text.build}>
    <div className={css.editorHead}>
      <div><p className={css.eyebrow}>{locale==="ar"?"إدارة الجدول":"STUNDENPLAN"}</p>
        <h2>{initial?text.edit:text.build}</h2></div>
      <div className={css.editorActions}>
        <button type="button" className="plain-button" onClick={()=>setRoomsOpen(x=>!x)}>{text.rooms}</button>
        <button type="button" className="plain-button" onClick={close}>{locale==="ar"?"إغلاق":"Schließen"}</button>
      </div>
    </div>
    {roomsOpen&&<TimetableRead locale={locale} result={roomCatalog}>{items=><RoomsEditor locale={locale} rooms={items}
      changed={room=>{setRoomId(room.id);setRoomVersion(x=>x+1);setReviewed(undefined);}}/>}</TimetableRead>}
    <form className="auth-form" onSubmit={queue}>
      <fieldset disabled={busy} className={css.editorFieldset}>
        <div className={css.fields}>
          <TimetableRead locale={locale} result={yearCatalog}>{catalog=><label>{text.year}
            <select required value={selectedYear} disabled={Boolean(initial)||Boolean(initialYear)} onChange={e=>{
              setYearId(e.target.value);setClassId("");setAssignmentId("");pickClass("");invalidate([]);
            }}>{catalog.filter(y=>y.state!=="closed").map(y=><option key={y.id} value={y.id}>{y.startsOn} – {y.endsExclusive}</option>)}</select>
          </label>}</TimetableRead>
          {selectedYear&&<TimetableRead locale={locale} result={classCatalog}>{catalog=><label>{text.classroom}
            <select required disabled={Boolean(initial)||Boolean(initialClass)} value={classId} onChange={e=>{
              setClassId(e.target.value);setAssignmentId("");pickClass(e.target.value);invalidate([]);
            }}><option value="">{text.choose}</option>{catalog.map(item=><option value={item.id} key={item.id}>
              {item.code} · {locale==="ar"?item.nameAr:item.nameDe}</option>)}</select>
          </label>}</TimetableRead>}
          <TimetableRead locale={locale} result={subjectCatalog}>{catalog=><label>{locale==="ar"?"المادة":"Fach"}
            <select required value={subjectId} onChange={e=>{setSubjectId(e.target.value);setAssignmentId("");setReviewed(undefined);}}>
              <option value="">{text.choose}</option>{catalog.map(item=><option value={item.id} key={item.id}>
                {locale==="ar"?item.nameAr:item.nameDe}</option>)}</select></label>}</TimetableRead>
          {classId&&<TimetableRead locale={locale} result={terms}>{()=> <label>{text.teacher}
            <select required value={assignmentId} onChange={e=>{
              const term=teacherChoices.find(t=>t.id===e.target.value);
              setAssignmentId(e.target.value);
              if(term&&!initial){setFrom(term.from);setUntil(term.untilExclusive);}
              setReviewed(undefined);
            }}><option value="">{text.choose}</option>{teacherChoices.map(item=><option key={item.id} value={item.id}>
              {item.staffName}</option>)}</select>
            {teacherChoices.length===0&&<small>{locale==="ar"?"اربط المدرسين بالفصل أولًا.":"Zuerst Lehrkräfte der Klasse zuordnen."}</small>}
          </label>}</TimetableRead>}
          <TimetableRead locale={locale} result={roomCatalog}>{catalog=><label>{text.room}
            <select required value={roomId} onChange={e=>setRoomId(e.target.value)}><option value="">{text.choose}</option>
              {catalog.map(room=><option key={room.id} value={room.id}>
                {room.code} · {locale==="ar"?room.nameAr:room.nameDe}</option>)}</select>
          </label>}</TimetableRead>}
        </div>
        <div className={css.editorGroup}>
          <h3>{text.weekday}</h3>
          {inEdit?<p>{weekdayLabel(initial!.weekday,locale)} · {occurrenceDate}</p>
            :<div className={css.dayChoices}>{Array.from({length:7},(_,index)=>index+1).map(day=><label key={day} className={css.dayOption}
              data-selected={weekdays.includes(day)}><input type="checkbox" checked={weekdays.includes(day)}
              onChange={e=>setWeekdays(prev=>e.target.checked?[...prev,day].sort():prev.filter(item=>item!==day))}/>
              {weekdayLabel(day,locale)}</label>)}</div>}
        </div>
        <div className={css.fields}>
          <label>{text.start}<input dir="ltr" value={start} required maxLength={5} placeholder="09:00" onChange={e=>setStart(e.target.value)}/></label>
          <label>{text.end}<input dir="ltr" value={end} required maxLength={5} placeholder="10:00" onChange={e=>setEnd(e.target.value)}/></label>
          {!inEdit&&<><label>{text.from}<input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label>
            <label>{text.until}<input type="date" required value={until} onChange={e=>setUntil(e.target.value)}/></label></>}
        </div>
        {inEdit&&<div className={css.scopeSelect} role="group" aria-label={locale==="ar"?"نطاق التعديل":"Änderungsumfang"}>
          {(["single","future"] as const).map(choice=><label key={choice} data-selected={scope===choice}>
            <input type="radio" name="scope" checked={scope===choice} onChange={()=>{setScope(choice);invalidate([]);setConfirmCancel(false);}}/>
            {choice==="single"?(locale==="ar"?"الحصة دي بس":"Nur diesen Termin")
              :(locale==="ar"?"نفس اليوم في كل الأسابيع الجاية":"Alle künftigen Termine dieses Wochentags")}
          </label>)}
        </div>}
        <button type="submit" className="primary-button" disabled={!selected||!subjectId||!roomId||!weekdays.length||noSubjects||busy||
          (queued.length+weekdays.length>60&&!initial)}>
          {initial?(locale==="ar"?"مراجعة التعديل":"Änderung prüfen"):text.add}
        </button>
      </fieldset>
    </form>
    {queued.length>0&&<section className={css.review}>
      <h3>{text.pending} <span>{queued.length}</span></h3>
      <ul className={css.pending}>{queued.map((entry,index)=><li key={index}>
        <strong>{entry.description}</strong>
        <span>{weekdayLabel(entry.draft.weekday,locale)} · <bdi dir="ltr">{minutes(entry.draft.start)}–{minutes(entry.draft.end)}</bdi></span>
        {reviewed?.entries[index]?.issues.map(issue=><p role="alert" key={issue.field+issue.kind}>
          {errors[issue.field]} · {text[issue.kind]}</p>)}
        {!initial&&<div className={css.editorActions}>
          <button type="button" className="plain-button" disabled={busy} onClick={()=>editDraft(entry,index)}>{text.edit}</button>
          <button type="button" className="plain-button" disabled={busy} onClick={()=>invalidate(queued.filter((_,i)=>i!==index))}>{text.remove}</button>
        </div>}
      </li>)}</ul>
      <div className={css.editorActions}>
        <button type="button" className="plain-button" disabled={busy} onClick={()=>void operation(preview)}>{text.preview}</button>
        {reviewed?.canSave&&<button type="button" className="primary-button" disabled={busy} onClick={()=>void operation(save)}>{text.save}</button>}
      </div>
      {reviewed?.canSave&&<p role="status" className={css.success}>{text.available}</p>}
      {reviewed&&!reviewed.canSave&&<p role="alert">{text.adjust}</p>}
    </section>}
    {inEdit&&!initial?.canceled&&<div className={css.cancelPanel}>
      <button type="button" className="plain-button" onClick={()=>setConfirmCancel(x=>!x)}>
        {locale==="ar"?"إلغاء الحصة":"Stunde absagen"}
      </button>
      {confirmCancel&&<div className={css.confirmRow}>
        <p>{scope==="single"?(locale==="ar"?"إلغاء الحصة دي بس؟":"Nur diesen Termin absagen?")
          :(locale==="ar"?"إلغاء الحصص الجاية لنفس اليوم؟":"Alle künftigen Termine dieses Wochentags absagen?")}</p>
        <button type="button" className="primary-button" disabled={busy} onClick={()=>void operation(cancelLesson)}>{text.confirmCancel}</button>
      </div>}
    </div>}
    {notice&&<p role={notice.error?"alert":"status"}>{notice.text}</p>}
  </section>;
}

function RoomsEditor({locale,rooms,changed}:{locale:Locale;rooms:TimetableRoom[];changed:(room:TimetableRoom)=>void}){
  const text=timetableWords[locale];
  const [selected,setSelected]=useState("");
  const active=rooms.find(({id})=>id===selected);
  return <div className="auth-card auth-form">
    <label>{text.room}<select value={selected} onChange={(event)=>setSelected(event.target.value)}>
      <option value="">{text.createRoom}</option>
      {rooms.map((row)=><option key={row.id} value={row.id}>{row.code} · {locale==="ar"?row.nameAr:row.nameDe}</option>)}
    </select></label>
    <RoomForm key={active?`${active.id}/${active.revision}`:"new"} locale={locale} room={active}
      saved={(room)=>{setSelected(room.id);changed(room);}}/>
  </div>;
}

function RoomForm({locale,room,saved}:{locale:Locale;room?:TimetableRoom;saved:(room:TimetableRoom)=>void}){
  const text=timetableWords[locale], command=useAdminCommand();
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const value=new FormData(event.currentTarget);
    setPending(true);
    setError("");
    void command(room?`/school/rooms/${room.id}`:"/school/rooms",room?"PATCH":"POST",{
      code:value.get("code"),nameAr:value.get("ar"),nameDe:value.get("de"),...(room&&{revision:room.revision}),
    },roomSchema).then(saved).catch((cause)=>setError(timetableError(locale,cause))).finally(()=>setPending(false));
  }
  return <form className="auth-form" onSubmit={submit}>
    <label>{text.roomCode}<input required maxLength={24} defaultValue={room?.code} dir="ltr" name="code"/></label>
    <label>{text.nameAr}<input required maxLength={120} defaultValue={room?.nameAr} dir="rtl" name="ar"/></label>
    <label>{text.nameDe}<input required maxLength={120} defaultValue={room?.nameDe} dir="ltr" name="de"/></label>
    <button type="submit" className="primary-button" disabled={pending}>{text.saveRoom}</button>
    {error&&<p role="alert">{error}</p>}
  </form>;
}
