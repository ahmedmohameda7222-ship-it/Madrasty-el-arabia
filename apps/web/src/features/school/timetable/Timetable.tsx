"use client";

import { useEffect, useState } from "react";
import {
  childSummarySchema, timetableSlot, timetableWeekSchema,
  type Locale, type TimetableSlot, type TimetableWeek,
} from "@madrasty/contracts";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { TimetableEditor } from "./TimetableEditor";
import { minutes, timetableWords, TimetableRead, useTimetableRead } from "./shared";

const children = childSummarySchema.array();

function offsetDay(date: string, days: number) {
  const stamp=new Date(date+"T00:00:00Z");
  stamp.setUTCDate(stamp.getUTCDate()+days);
  return stamp.toISOString().slice(0,10);
}
function dayLabel(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale==="de"?"de-DE":"ar",{weekday:"long",day:"numeric",month:"long",timeZone:"UTC"})
    .format(new Date(date+"T00:00:00Z"));
}

export function Timetable({ locale, child, initialClass }: {locale:Locale;child?:string;initialClass?:string}) {
  const text=timetableWords[locale], {persona}=useAccountScope();
  const [selection,setSelection]=useState(child ?? "");
  const [date,setDate]=useState("");
  const [classId,setClassId]=useState(initialClass ?? "");
  const [reload,setReload]=useState(0);
  const [editId,setEditId]=useState<string>();
  const [editor,setEditor]=useState(false);
  const own=useTimetableRead(persona==="guardian"?"/me/children?limit=100":null,children,reload);
  const allowed=own.value?.data?.some((record)=>record.id===selection) ?? false;
  const chosen=selection?(allowed?selection:undefined):own.value?.data?.[0]?.id;
  const params=new URLSearchParams();
  if(date)params.set("weekOf",date);
  if(persona==="guardian" && chosen)params.set("childId",chosen);
  if(persona==="admin" && classId)params.set("classId",classId);
  const view=useTimetableRead(persona==="guardian"&&!chosen?null:`/school/timetable?${params}`,timetableWeekSchema,reload);
  const edit=useTimetableRead(editId?`/school/timetable/${editId}`:null,timetableSlot,reload);
  const weekOf=view.value?.data?.weekOf;

  useEffect(()=>{
    const refresh=()=>setReload((version)=>version+1);
    window.addEventListener("focus",refresh);
    return ()=>window.removeEventListener("focus",refresh);
  },[]);

  function saved(slot?: TimetableSlot, starts?: string){
    if(starts)setDate(starts);
    if(slot)setClassId(slot.classId);
    setEditId(undefined);
    setReload((version)=>version+1);
  }

  return <>
    <h1>{text.title}</h1>
    {persona==="guardian"&&<TimetableRead locale={locale} result={own}>{(records)=>records.length > 0 ?
      <section className="auth-card"><label>{text.selectChild}<select value={chosen ?? ""} onChange={(event)=>setSelection(event.target.value)}>
        {!chosen&&<option value="">{text.choose}</option>}
        {records.map((item)=><option value={item.id} key={item.id}>{item.displayName}</option>)}
      </select></label></section> : <AsyncSurface locale={locale} state={{kind:"empty"}} />}
    </TimetableRead>}
    {persona==="guardian" && selection && !chosen && own.value?.data && <AsyncSurface locale={locale} state={{kind:"forbidden"}}/>}
    {(persona!=="guardian"||chosen)&&<>
      <section className="auth-card">
        <div className="header-actions">
          <button type="button" className="plain-button" disabled={!weekOf} onClick={()=>weekOf&&setDate(offsetDay(weekOf,-7))}>{text.previous}</button>
          <button type="button" className="plain-button" disabled={!date} onClick={()=>setDate("")}>{text.today}</button>
          <button type="button" className="plain-button" disabled={!weekOf} onClick={()=>weekOf&&setDate(offsetDay(weekOf,7))}>{text.next}</button>
        </div>
        <label>{text.date}<input type="date" value={date || weekOf || ""} onChange={(event)=>setDate(event.target.value)}/></label>
        {persona==="admin"&&<div className="header-actions">
          {classId&&<button type="button" className="plain-button" onClick={()=>setClassId("")}>{text.allClasses}</button>}
          <button type="button" className="plain-button" onClick={()=>{setEditId(undefined);setEditor(!editor);}}>{text.build}</button>
        </div>}
      </section>
      {persona==="admin"&&editor&&(editId
        ? <TimetableRead locale={locale} result={edit}>{(slot)=><TimetableEditor key={`${slot.id}/${slot.revision}`} locale={locale} initial={slot}
          pickClass={setClassId} saved={saved} close={()=>{setEditId(undefined);setEditor(false);}}/>}</TimetableRead>
        : <TimetableEditor locale={locale} pickClass={setClassId} saved={saved} close={()=>setEditor(false)}/>)}
      <TimetableRead locale={locale} result={view}>{(week)=>
        <WeekRows locale={locale} week={week} edit={persona==="admin"?(id)=>{setEditId(id);setEditor(true);}:undefined}/>
      }</TimetableRead>
    </>}
  </>;
}

export function WeekRows({locale,week,edit}:{locale:Locale;week:TimetableWeek;edit?:(id:string)=>void}){
  const text=timetableWords[locale];
  return <section className="auth-card">
    {week.slots.length===0&&<p>{text.noLessons}</p>}
    <ul className="group-list">
      {week.days.map(({date,teaching})=>{
        const sessions=week.slots.filter((slot)=>slot.date===date);
        return <li className="timetable-day" key={date}>
          <h2>{dayLabel(date,locale)}</h2>
          {!teaching&&<p className="scope-label">{text.canceled}</p>}
          {sessions.map((slot)=><div className="timetable-session" key={slot.id}>
            <bdi dir="ltr">{minutes(slot.start)} – {minutes(slot.end)}</bdi>
            <strong><bdi>{locale==="ar"?slot.subjectNameAr:slot.subjectNameDe}</bdi></strong>
            <small><bdi>{locale==="ar"?slot.classNameAr:slot.classNameDe}</bdi> · <bdi>{slot.roomCode}</bdi> · <bdi>{slot.teacherName}</bdi></small>
            {slot.substitute&&<small>{text.substitute}</small>}
            {!slot.teaching&&teaching&&<small>{text.canceled}</small>}
            {edit&&<button type="button" className="plain-button" onClick={()=>edit(slot.id)}>{text.edit}</button>}
          </div>)}
        </li>;
      })}
    </ul>
  </section>;
}
