"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  childSummarySchema, teachingViewSchema, timetableWeekSchema, workQueuesSchema, type Locale, type TimetableWeek,
} from "@madrasty/contracts";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { RoleHero } from "@/ui/RoleHero";
import { ScopeSheet } from "@/ui/Shell";
import { AdminWork } from "./WorkQueues";
import { minutes, TimetableRead, useTimetableRead } from "./timetable/shared";

const copy={
  ar:{today:"دروس اليوم",schedule:"افتح الجدول",attendance:"افتح الحضور",assignments:"تكليفاتي الحالية",
    noAssignment:"ما فيش تكليفات سارية اليوم.",noLessons:"ما فيش دروس مواعيدها النهارده.",profile:"افتح بيانات الطفل",
    substitute:"مدرس بديل",children:"أبنائي",subject:"مدرس مادة",primary:"مسؤول الحضور"},
  de:{today:"Unterricht heute",schedule:"Wochenplan öffnen",attendance:"Anwesenheit öffnen",assignments:"Meine aktuellen Einsätze",
    noAssignment:"Heute gibt es keine laufenden Einsätze.",noLessons:"Für heute sind keine Stunden geplant.",profile:"Kind öffnen",
    substitute:"Vertretung",children:"Kinder",subject:"Fachunterricht",primary:"Anwesenheitsverantwortung"},
} as const;
const myTeaching=teachingViewSchema.array(), myChildren=childSummarySchema.array();

export function SchoolHome({locale,asOf}:{locale:Locale;asOf?:string}){
  const {persona}=useAccountScope();
  return persona==="admin"?<AdminWork locale={locale} initialDay={asOf}/>:
    persona==="teacher"?<TeacherHome locale={locale}/>:<GuardianHome locale={locale}/>;
}

function useHomeRefresh(){
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    const reload=()=>setRefresh((count)=>count+1);
    window.addEventListener("focus",reload);
    return ()=>window.removeEventListener("focus",reload);
  },[]);
  return refresh;
}

function TeacherHome({locale}:{locale:Locale}){
  const text=copy[locale], refresh=useHomeRefresh(), base=`/${locale}/school`;
  const assignments=useTimetableRead("/me/teaching",myTeaching,refresh);
  const first=assignments.value?.data?.[0];
  const firstName=first&&(locale==="ar"?first.classNameAr:first.classNameDe);

  return <>
    {first&&firstName&&<RoleHero persona="teacher" title={firstName}
      detail={first.substitute?text.substitute:first.kind==="primary"?text.primary:text.subject}
      action={first.kind==="primary"?{href:`${base}/attendance?class=${first.classId}`,label:text.attendance}
        :{href:`${base}/more/timetable`,label:text.schedule}} />}
    <TimetableRead locale={locale} result={assignments}>{(rows)=><section className="auth-card">
      <h2>{text.assignments}</h2>
      {rows.length===0&&<p>{text.noAssignment}</p>}
      <ul className="group-list">{rows.map((row)=><li key={row.id}>
        <Link className="group-row" href={row.kind==="primary"?`${base}/attendance?class=${row.classId}`:`${base}/more/timetable`}>
          <bdi>{locale==="ar"?row.classNameAr:row.classNameDe}</bdi>
          <small>{row.substitute?text.substitute:row.kind==="primary"?text.primary:locale==="ar"?row.subjectNameAr:row.subjectNameDe}</small>
        </Link>
      </li>)}</ul>
    </section>}</TimetableRead>
    <TodayLessons locale={locale} refresh={refresh} />
  </>;
}

function GuardianHome({locale}:{locale:Locale}){
  const text=copy[locale],refresh=useHomeRefresh(),base=`/${locale}/school`;
  const [selection,setSelection]=useState("");
  const children=useTimetableRead("/me/children?limit=100",myChildren,refresh);
  return <TimetableRead locale={locale} result={children}>{(rows)=>{
    const child=rows.find((row)=>row.id===selection)??rows[0];
    if(!child)return <AsyncSurface locale={locale} state={{kind:"empty"}}/>;
    const classroom=child.currentClass&&(locale==="ar"?child.currentClass.nameAr:child.currentClass.nameDe);
    return <>
      <section className="auth-card"><ScopeSheet locale={locale} choices={rows.map((row)=>({
        id:row.id,label:row.displayName,detail:row.currentClass?.code??row.studentNumber,
      }))} selectedId={child.id} select={setSelection}/></section>
      <RoleHero persona="guardian" title={child.displayName} detail={classroom??text.children}
        action={{href:`${base}/children?child=${child.id}`,label:text.profile}} />
      <TodayLessons locale={locale} refresh={refresh} child={child.id}/>
    </>;
  }}</TimetableRead>;
}

function TodayLessons({locale,refresh,child}:{locale:Locale;refresh:number;child?:string}){
  const date=useTimetableRead("/school/work-queues",workQueuesSchema,refresh);
  const today=date.value?.data?.today;
  return <TimetableRead locale={locale} result={date}>{()=>{
    if(!today)return null;
    return <DaySchedule locale={locale} day={today} child={child} refresh={refresh}/>;
  }}</TimetableRead>;
}

function DaySchedule({locale,day,child,refresh}:{locale:Locale;day:string;child?:string;refresh:number}){
  const text=copy[locale], suffix=child?`?child=${child}`:"";
  const result=useTimetableRead(`/school/timetable?weekOf=${day}${child?`&childId=${child}`:""}`,timetableWeekSchema,refresh);
  return <TimetableRead locale={locale} result={result}>{(week:TimetableWeek)=>{
    const lessons=week.slots.filter((row)=>row.date===day&&row.teaching);
    return <section className="auth-card">
      <h2>{text.today}</h2>
      {!lessons.length&&<p>{text.noLessons}</p>}
      <ul className="group-list">{lessons.map((row)=><li className="timetable-session" key={row.id}>
        <bdi dir="ltr">{minutes(row.start)} – {minutes(row.end)}</bdi>
        <bdi>{locale==="ar"?row.subjectNameAr:row.subjectNameDe}</bdi>
        <small><bdi>{row.classCode} · {row.roomCode}</bdi></small>
        {row.substitute&&<small>{text.substitute}</small>}
      </li>)}</ul>
      <Link className="plain-button" href={`/${locale}/school/more/timetable${suffix}`}>{text.schedule}</Link>
    </section>;
  }}</TimetableRead>;
}
