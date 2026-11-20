"use client";

import { useState, type FormEvent } from "react";
import {
  assignmentWithSubstitutesSchema, roomSchema, schoolClassSchema, timetableDraftSlot, timetablePreviewSchema,
  timetableSavedSchema, timetableSlot, yearSchema, type DraftSlot, type Locale, type TimetablePreview, type TimetableRoom, type TimetableSlot,
} from "@madrasty/contracts";
import { requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { webHeaders } from "@/features/identity/SessionControls";
import { dictionary } from "@/i18n";
import { minutes, timetableError, timetableWords, TimetableRead, useTimetableRead, weekdayLabel } from "./shared";

const years=yearSchema.array(), classes=schoolClassSchema.array(), assignments=assignmentWithSubstitutesSchema.array(), rooms=roomSchema.array();
type Queued = { draft: DraftSlot; classId:string; description:string };

function parseTime(value:string) {
  if(value==="24:00")return 1440;
  const match=/^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value.trim());
  return match?Number(match[1])*60+Number(match[2]):NaN;
}

export function TimetableEditor({locale,initial,pickClass,saved,close}:{
  locale:Locale;initial?:TimetableSlot;pickClass:(id:string)=>void;saved:(record?:TimetableSlot,starts?:string)=>void;close:()=>void;
}) {
  const text=timetableWords[locale], common=dictionary(locale), command=useAdminCommand();
  const [yearId,setYearId]=useState(initial?.yearId ?? "");
  const [classId,setClassId]=useState(initial?.classId ?? "");
  const [assignmentId,setAssignmentId]=useState(initial?.assignmentId ?? "");
  const [roomId,setRoomId]=useState(initial?.roomId ?? "");
  const [weekday,setWeekday]=useState(initial?.weekday ?? 1);
  const [start,setStart]=useState(initial?minutes(initial.start):"");
  const [end,setEnd]=useState(initial?minutes(initial.end):"");
  const [from,setFrom]=useState(initial?.from ?? "");
  const [until,setUntil]=useState(initial?.untilExclusive ?? "");
  const [queued,setQueued]=useState<Queued[]>([]);
  const [preview,setPreview]=useState<TimetablePreview>();
  const [roomsOpen,setRoomsOpen]=useState(false);
  const [roomVersion,setRoomVersion]=useState(0);
  const [cancel,setCancel]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState<{error:boolean; text:string}>();
  const yearCatalog=useTimetableRead("/school/years",years);
  const yearChoices=yearCatalog.value?.data?.filter((item)=>item.state!=="closed") ?? [];
  const selectedYear=yearId||yearChoices[0]?.id||"";
  const classCatalog=useTimetableRead(selectedYear?`/school/classes?yearId=${selectedYear}&limit=100`:null,classes);
  const terms=useTimetableRead(classId?`/school/classes/${classId}/assignments`:null,assignments);
  const roomCatalog=useTimetableRead("/school/rooms",rooms,roomVersion);
  const selected=terms.value?.data?.find((term)=>term.id===assignmentId && term.kind==="subject" && !term.revoked);

  function invalidate(next:Queued[]){
    setQueued(next);
    setPreview(undefined);
    setNotice(undefined);
  }
  async function operation(action:()=>Promise<void>){
    setBusy(true);
    setNotice(undefined);
    try {await action();}
    catch(error){setNotice({error:true,text:timetableError(locale,error)});}
    finally{setBusy(false);}
  }

  function queue(event: FormEvent<HTMLFormElement>){
    event.preventDefault();
    const value=timetableDraftSlot.safeParse({assignmentId,roomId,weekday,start:parseTime(start),end:parseTime(end),from,untilExclusive:until});
    if(!value.success || !selected){setNotice({error:true,text:text.interval});return;}
    const language=locale==="ar"?selected.subjectNameAr:selected.subjectNameDe;
    const room=roomCatalog.value?.data?.find((item)=>item.id===roomId);
    const write={draft:value.data,classId,description:`${language??""} · ${selected.classCode} · ${room?.code??""}`};
    invalidate(initial?[write]:[...queued,write]);
  }

  function useDraft(entry:Queued,index:number){
    setClassId(entry.classId);
    setAssignmentId(entry.draft.assignmentId);
    setRoomId(entry.draft.roomId);
    setWeekday(entry.draft.weekday);
    setStart(minutes(entry.draft.start));
    setEnd(minutes(entry.draft.end));
    setFrom(entry.draft.from);
    setUntil(entry.draft.untilExclusive);
    invalidate(queued.filter((_,position)=>position!==index));
  }

  async function review() {
    setPreview(undefined);
    const result=await requestApi("/school/timetable/preview",timetablePreviewSchema,{
      method:"POST",headers:webHeaders("admin"),
      body:JSON.stringify({yearId:selectedYear,slots:queued.map(({draft})=>draft),...(initial&&{editingId:initial.id})}),
    });
    setPreview(result.data);
  }

  async function save() {
    if(!preview?.canSave)return;
    const checked=preview.entries.flatMap(({slot})=>slot?[slot]:[]);
    if(checked.length!==queued.length || !checked[0])return;
    if(initial){
      const result=await command(`/school/timetable/${initial.id}`,"PATCH",{
        revision:initial.revision,yearRevision:preview.yearRevision,slot:checked[0],
      },timetableSlot);
      saved(result,result.from);
    }else{
      await command("/school/timetable","POST",{yearId:selectedYear,yearRevision:preview.yearRevision,slots:checked},timetableSavedSchema);
      setNotice({error:false,text:common.saved});
      setPreview(undefined);
      setQueued([]);
      saved(undefined,checked[0].from);
    }
  }

  const fields: Record<string,string>={assignmentId:text.assignment,roomId:text.room,weekday:text.weekday,start:text.start,end:text.end,
    from:text.from,untilExclusive:text.until,classId:text.classroom,staffId:text.teacher};

  return <section className="auth-card auth-form">
    <div className="header-actions">
      <h2>{initial?text.edit:text.build}</h2>
      <button className="plain-button" type="button" onClick={close}>{text.clear}</button>
      <button className="plain-button" type="button" aria-expanded={roomsOpen} onClick={()=>setRoomsOpen(!roomsOpen)}>{text.rooms}</button>
    </div>
    {roomsOpen&&<TimetableRead locale={locale} result={roomCatalog}>{(roomList)=><RoomsEditor locale={locale} rooms={roomList}
      changed={(room)=>{setRoomId(room.id);setRoomVersion((count)=>count+1);setPreview(undefined);}}/>}</TimetableRead>}
    <TimetableRead locale={locale} result={yearCatalog}>{(catalog)=><form className="auth-form" onSubmit={queue}>
      <fieldset disabled={busy}>
        <label>{text.year}<select value={selectedYear} disabled={Boolean(initial)} required onChange={(event)=>{
          setYearId(event.target.value);setClassId("");setAssignmentId("");pickClass("");invalidate([]);
        }}>
          <option value="">{text.choose}</option>{catalog.map((year)=><option disabled={year.state==="closed"} value={year.id} key={year.id}>
            {year.startsOn} – {year.endsExclusive}
          </option>)}
        </select></label>
        {selectedYear&&<TimetableRead locale={locale} result={classCatalog}>{(available)=><label>{text.classroom}
          <select required value={classId} onChange={(event)=>{setClassId(event.target.value);setAssignmentId("");pickClass(event.target.value);setPreview(undefined);}}>
            <option value="">{text.choose}</option>{available.map((item)=><option value={item.id} key={item.id}>
              {item.code} · {locale==="ar"?item.nameAr:item.nameDe}
            </option>)}
          </select>
        </label>}</TimetableRead>}
        {classId&&<TimetableRead locale={locale} result={terms}>{(catalog)=><label>{text.assignment}
          <select required value={assignmentId} onChange={(event)=>{
            setAssignmentId(event.target.value);
            const record=catalog.find(({id})=>id===event.target.value);
            if(record){setFrom(record.from);setUntil(record.untilExclusive);}
          }}><option value="">{text.choose}</option>
            {catalog.filter((term)=>term.kind==="subject"&&!term.revoked).map((term)=><option value={term.id} key={term.id}>
              {locale==="ar"?term.subjectNameAr:term.subjectNameDe} · {term.staffName} · {term.from} – {term.untilExclusive}
            </option>)}
          </select>
        </label>}</TimetableRead>}
        <TimetableRead locale={locale} result={roomCatalog}>{(catalog)=><label>{text.room}
          <select required value={roomId} onChange={(event)=>setRoomId(event.target.value)}>
            <option value="">{text.choose}</option>{catalog.map((item)=><option value={item.id} key={item.id}>
              {item.code} · {locale==="ar"?item.nameAr:item.nameDe}
            </option>)}
          </select>
        </label>}</TimetableRead>
        <label>{text.weekday}<select value={weekday} onChange={(event)=>setWeekday(Number(event.target.value))}>
          {Array.from({length:7},(_,index)=>index+1).map((value)=><option value={value} key={value}>{weekdayLabel(value,locale)}</option>)}
        </select></label>
        <label>{text.start}<input required dir="ltr" value={start} onChange={(event)=>setStart(event.target.value)} maxLength={5} placeholder="09:00" /></label>
        <label>{text.end}<input required dir="ltr" value={end} onChange={(event)=>setEnd(event.target.value)} maxLength={5} placeholder="10:00" /></label>
        <label>{text.from}<input type="date" required value={from} onChange={(event)=>setFrom(event.target.value)} /></label>
        <label>{text.until}<input type="date" required value={until} onChange={(event)=>setUntil(event.target.value)} /></label>
        <button type="submit" className="primary-button" disabled={!selected||(queued.length>=60&&!initial)}>{text.add}</button>
      </fieldset>
    </form>}</TimetableRead>
    {queued.length>0&&<section>
      <h3>{text.pending}</h3>
      <ul className="group-list">{queued.map((entry,index)=><li key={index} className="timetable-day">
        <bdi>{entry.description}</bdi>
        <p>{weekdayLabel(entry.draft.weekday,locale)} · <bdi dir="ltr">{minutes(entry.draft.start)} – {minutes(entry.draft.end)}</bdi></p>
        <p><bdi dir="ltr">{entry.draft.from} – {entry.draft.untilExclusive}</bdi></p>
        {preview?.entries[index].issues.map((issue)=><p key={issue.field+issue.kind}>{fields[issue.field]} · {text[issue.kind]}</p>)}
        <button type="button" className="plain-button" disabled={busy} onClick={()=>useDraft(entry,index)}>{text.edit}</button>
        <button type="button" className="plain-button" disabled={busy}
          onClick={()=>invalidate(queued.filter((_,position)=>position!==index))}>{text.remove}</button>
      </li>)}</ul>
      {preview?.canSave&&<p role="status">{text.available}</p>}
      {preview&&!preview.canSave&&<p role="status">{text.adjust}</p>}
      <div className="header-actions">
        <button type="button" className="plain-button" disabled={busy} onClick={()=>void operation(review)}>{text.preview}</button>
        {preview?.canSave&&<button type="button" className="primary-button" disabled={busy} onClick={()=>void operation(save)}>{text.save}</button>}
      </div>
    </section>}
    {initial&&!initial.canceled&&<div className="header-actions">
      <button type="button" className="plain-button" aria-pressed={cancel} onClick={()=>setCancel(!cancel)}>{text.cancelSlot}</button>
      {cancel&&<button type="button" className="plain-button" disabled={busy} onClick={()=>void operation(async()=>{
        const record=await command(`/school/timetable/${initial.id}`,"PATCH",{revision:initial.revision,cancel:true},timetableSlot);
        saved(record);
      })}>{text.confirmCancel}</button>}
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
