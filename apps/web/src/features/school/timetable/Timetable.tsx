"use client";

import { useEffect, useState } from "react";
import {
  childSummarySchema, schoolClassSchema, timetableSlot, timetableWeekSchema, yearSchema,
  type Locale, type TimetableSlot, type TimetableWeek,
} from "@madrasty/contracts";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { TimetableEditor } from "./TimetableEditor";
import { minutes, timetableWords, TimetableRead, useTimetableRead } from "./shared";
import css from "./Timetable.module.css";

const children=childSummarySchema.array();
const classes=schoolClassSchema.array();
const years=yearSchema.array();

function offsetDay(date:string,days:number) {
  const stamp=new Date(date+"T12:00:00Z");
  stamp.setUTCDate(stamp.getUTCDate()+days);
  return stamp.toISOString().slice(0,10);
}
function dayLabel(date:string,locale:Locale) {
  return new Intl.DateTimeFormat(locale==="de"?"de-DE":"ar-EG",{
    weekday:"long",day:"numeric",month:"short",timeZone:"UTC",
  }).format(new Date(date+"T12:00:00Z"));
}

export function Timetable({locale,child,initialClass,initialYear}:{
  locale:Locale;child?:string;initialClass?:string;initialYear?:string;
}){
  const text=timetableWords[locale],{persona}=useAccountScope();
  const admin=persona==="admin";
  const [selection,setSelection]=useState(child??"");
  const [date,setDate]=useState("");
  const [classId,setClassId]=useState(initialClass??"");
  const [yearId,setYearId]=useState(initialYear??"");
  const [reload,setReload]=useState(0);
  const [edit,setEdit]=useState<{id:string;date:string}>();
  const [editor,setEditor]=useState(false);
  const own=useTimetableRead(persona==="guardian"?"/me/children?limit=100":null,children,reload);
  const allowed=own.value?.data?.some(record=>record.id===selection)??false;
  const chosen=selection?(allowed?selection:undefined):own.value?.data?.[0]?.id;

  const yearList=useTimetableRead(admin?"/school/years":null,years);
  const activeYear=yearList.value?.data?.find(y=>y.state==="active")??
    yearList.value?.data?.find(y=>y.state!=="closed")??yearList.value?.data?.[0];
  const selectedYear=yearId||activeYear?.id||"";
  const classList=useTimetableRead(admin&&selectedYear?`/school/classes?yearId=${selectedYear}&limit=100`:null,classes,reload);
  const classroom=classList.value?.data?.find(c=>c.id===classId);
  const params=new URLSearchParams();
  if(date)params.set("weekOf",date);
  if(persona==="guardian"&&chosen)params.set("childId",chosen);
  if(admin&&classId)params.set("classId",classId);
  const canRead=persona==="guardian"?Boolean(chosen):!admin||Boolean(classId);
  const view=useTimetableRead(canRead?`/school/timetable?${params}`:null,timetableWeekSchema,reload);
  const editRecord=useTimetableRead(edit?`/school/timetable/${edit.id}?date=${edit.date}`:null,timetableSlot,reload);
  const weekOf=view.value?.data?.weekOf;

  useEffect(()=>{
    const onFocus=()=>setReload(version=>version+1);
    window.addEventListener("focus",onFocus);
    return()=>window.removeEventListener("focus",onFocus);
  },[]);
  function saved(slot?:TimetableSlot,starts?:string) {
    if(starts)setDate(starts);
    if(slot)setClassId(slot.classId);
    setEditor(false);setEdit(undefined);
    setReload(version=>version+1);
  }
  function chooseClass(id:string) {
    setClassId(id);setEditor(false);setEdit(undefined);setDate("");
  }
  return <div className={css.page}>
    <section className={css.hero}>
      <div>
        <p className={css.eyebrow}>{locale==="ar"?"تنظيم المدرسة":"SCHULORGANISATION"}</p>
        <h1>{text.title}</h1>
        <p>{admin?(locale==="ar"?"اختار الفصل وراجع الحصص والمواعيد من مكان واحد.":"Klasse wählen, Stunden planen und den Überblick behalten.")
          :persona==="guardian"?(locale==="ar"?"جدول طفلك للأسبوع.":"Der Stundenplan Ihres Kindes.")
          :(locale==="ar"?"حصصك خلال الأسبوع.":"Ihre Unterrichtsstunden dieser Woche.")}</p>
      </div>
      {admin&&classId&&<div className={css.toolbarActions}>
        <button type="button" className="plain-button" onClick={()=>chooseClass("")}>
          {locale==="ar"?"كل الفصول":"Alle Klassen"}</button>
        <button type="button" className="primary-button" onClick={()=>{setEdit(undefined);setEditor(x=>!x);}}>
          {locale==="ar"?"+ إضافة حصة":"+ Stunde hinzufügen"}</button>
      </div>}
    </section>

    {admin&&!classId&&<TimetableRead locale={locale} result={yearList}>{catalog=>
      <section className={css.pickerPanel}>
        <div className={css.pickerTop}>
          <h2>{locale==="ar"?"اختار الفصل":"Klasse auswählen"}</h2>
          <div className={css.toolbar}>
            <label>{text.year}<select value={selectedYear} onChange={e=>setYearId(e.target.value)}>
              {catalog.map(y=><option key={y.id} value={y.id}>{y.startsOn} – {y.endsExclusive}</option>)}
            </select></label>
          </div>
        </div>
        {selectedYear&&<TimetableRead locale={locale} result={classList}>{records=>
          records.length===0?<p className={css.muted}>{locale==="ar"?"لسه مفيش فصول للسنة دي.":"Für dieses Schuljahr gibt es noch keine Klassen."}</p>
            :<div className={css.classGrid}>{records.map(record=><button type="button" key={record.id}
              className={css.classCard} onClick={()=>chooseClass(record.id)}>
              <span className={css.classCode}>{record.code}</span>
              <strong>{locale==="ar"?record.nameAr:record.nameDe}</strong>
              <small>{locale==="ar"?"افتح الجدول الأسبوعي ←":"Wochenplan öffnen →"}</small>
            </button>)}</div>
        }</TimetableRead>}
      </section>
    }</TimetableRead>}

    {persona==="guardian"&&<TimetableRead locale={locale} result={own}>{records=>
      records.length>0?<section className={css.pickerPanel}><label>
        {text.selectChild}<select value={chosen??""} onChange={e=>setSelection(e.target.value)}>
          {records.map(record=><option value={record.id} key={record.id}>{record.displayName}</option>)}
        </select></label></section>:<AsyncSurface locale={locale} state={{kind:"empty"}}/>
    }</TimetableRead>}
    {persona==="guardian"&&selection&&!chosen&&own.value?.data&&<AsyncSurface locale={locale} state={{kind:"forbidden"}}/>}

    {canRead&&<section className={css.pickerPanel}>
      <div className={css.summary}>
        <div>
          <h2>{admin?(classroom?(locale==="ar"?classroom.nameAr:classroom.nameDe):text.classroom)
            :(locale==="ar"?"الأسبوع الدراسي":"Unterrichtswoche")}</h2>
          <p>{admin?classroom?.code??"":locale==="ar"?"تصفح المواعيد الأسبوعية":"Wochenübersicht"}</p>
        </div>
        <div className={css.toolbar}>
          <div className={css.toolbarActions}>
            <button type="button" className="plain-button" disabled={!weekOf} onClick={()=>weekOf&&setDate(offsetDay(weekOf,-7))}>
              {text.previous}</button>
            <button type="button" className="plain-button" disabled={!date} onClick={()=>setDate("")}>{text.today}</button>
            <button type="button" className="plain-button" disabled={!weekOf} onClick={()=>weekOf&&setDate(offsetDay(weekOf,7))}>
              {text.next}</button>
          </div>
          <label>{text.date}<input type="date" value={date||weekOf||""} onChange={e=>setDate(e.target.value)}/></label>
        </div>
      </div>
    </section>}

    {admin&&classId&&editor&&(edit
      ? <TimetableRead locale={locale} result={editRecord}>{slot=><TimetableEditor
          key={slot.id+"/"+slot.revision+"/"+edit.date} locale={locale} initial={slot} occurrenceDate={edit.date}
          initialClass={classId} initialYear={slot.yearId} pickClass={setClassId} saved={saved}
          close={()=>{setEdit(undefined);setEditor(false);}}/>}</TimetableRead>
      :<TimetableEditor locale={locale} initialClass={classId} initialYear={selectedYear}
        pickClass={setClassId} saved={saved} close={()=>setEditor(false)}/>)}

    {canRead&&<TimetableRead locale={locale} result={view}>{week=>
      <WeekRows locale={locale} week={week} edit={admin?(id,schoolDate)=>{setEdit({id,date:schoolDate});setEditor(true);}:undefined}/>
    }</TimetableRead>}
  </div>;
}

export function WeekRows({locale,week,edit}:{
  locale:Locale;week:TimetableWeek;edit?:(id:string,date:string)=>void;
}){
  const text=timetableWords[locale];
  return <section className={css.weekGrid} aria-label={text.title}>
    {week.days.map(({date,teaching})=>{
      const lessons=week.slots.filter(slot=>slot.date===date);
      return <article className={`${css.day} ${teaching?"":css.dayOff}`} key={date}>
        <div className={css.dayHead}><h3>{dayLabel(date,locale)}</h3>
          <span>{teaching?(locale==="ar"?"يوم دراسة":"Unterricht"):(locale==="ar"?"إجازة":"Unterrichtsfrei")}</span></div>
        <div className={css.dayBody}>
          {lessons.length===0&&<p className={css.emptyDay}>{teaching
            ?(locale==="ar"?"مفيش حصص":"Keine Stunden"):text.canceled}</p>}
          {lessons.map(slot=><div className={css.lesson} key={slot.id}>
            <time dir="ltr">{minutes(slot.start)} – {minutes(slot.end)}</time>
            <strong>{locale==="ar"?slot.subjectNameAr:slot.subjectNameDe}</strong>
            <small>{locale==="ar"?slot.classNameAr:slot.classNameDe} · {slot.roomCode}</small>
            <small>{slot.teacherName}</small>
            {slot.substitute&&<span className={css.badge}>{text.substitute}</span>}
            {!teaching&&<span className={css.badge}>{text.canceled}</span>}
            {edit&&<button type="button" className="plain-button" onClick={()=>edit(slot.id,slot.date)}>{text.edit}</button>}
          </div>)}
        </div>
      </article>;
    })}
  </section>;
}
