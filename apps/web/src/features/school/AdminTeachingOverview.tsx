"use client";
import {useEffect,useMemo,useState,type FormEvent} from "react";
import Link from "next/link";
import {adminClassOversight,type AdminClassOversight,type Locale} from "@madrasty/contracts";
import {requestApi,ApiResponseError} from "@/api/client";
import {dictionary,localizedError} from "@/i18n";
import css from "./AdminTeachingOverview.module.css";

type Classroom=AdminClassOversight["classes"][number];
const labels={
 ar:{title:"متابعة التدريس",readonly:"للعرض والمتابعة فقط",date:"التاريخ",apply:"عرض",
 search:"ابحث عن فصل",classes:"الفصول",pending:"حضور غير معتمد",
 teaching:"حصص موثّقة",upcoming:"امتحانات خلال ١٤ يوم",classList:"الفصول والمتابعة",
 details:"متابعة الفصل",teacher:"مدرس الفصل",unassigned:"لم يُعيّن مدرس للفصل",
 attendance:"حالة الحضور",not_started:"لم يبدأ",open:"بانتظار الاعتماد",approved:"تم الاعتماد",
 unmarked:"طلاب بدون حالة حضور",homework:"واجبات جارية",exams:"امتحانات قادمة",
 marks:"درجات مسجلة آخر ٣٠ يوم",logs:"حصص موثقة في اليوم",toAttendance:"عرض سجل الحضور",
 toExams:"عرض الامتحانات",toClass:"ملف الفصل",noClasses:"لا توجد فصول في التاريخ المحدد.",
 noMatching:"لا يوجد فصل مطابق للبحث",loading:"جارٍ تحميل حالة الفصول",retry:"إعادة المحاولة"},
 de:{title:"Unterricht im Blick",readonly:"Nur ansehen",date:"Schultag",apply:"Anzeigen",
 search:"Klasse suchen",classes:"Klassen",pending:"Offene Anwesenheit",
 teaching:"Unterrichtseinträge",upcoming:"Prüfungen in 14 Tagen",classList:"Klassenübersicht",
 details:"Status dieser Klasse",teacher:"Klassenlehrkraft",unassigned:"Keine Lehrkraft zugewiesen",
 attendance:"Anwesenheit",not_started:"Noch nicht begonnen",open:"Noch nicht bestätigt",approved:"Bestätigt",
 unmarked:"Schüler ohne Anwesenheitsstatus",homework:"Laufende Hausaufgaben",
 exams:"Anstehende Prüfungen",marks:"Erfasste Noten (30 Tage)",logs:"Unterrichtseinträge heute",
 toAttendance:"Anwesenheit ansehen",toExams:"Prüfungen ansehen",toClass:"Klasse öffnen",
 noClasses:"Keine Klassen für diesen Schultag.",noMatching:"Keine Klasse entspricht der Suche",
 loading:"Klassenstatus wird geladen",retry:"Erneut versuchen"},
} as const;
const labelStatus=(locale:Locale,state:Classroom["attendanceState"])=>
  state===null?"—":labels[locale][state];
const number=(v:number|null|undefined,locale:Locale)=>v===null||v===undefined?"—":new Intl.NumberFormat(locale).format(v);
function friendly(locale:Locale,error:unknown){
 return error instanceof ApiResponseError?localizedError(locale,error.messageKey):dictionary(locale)["error.unavailable"];
}
export function AdminTeachingOverview({locale}:{locale:Locale}){
 const t=labels[locale];
 const [report,setReport]=useState<AdminClassOversight>();
 const [date,setDate]=useState(""),[applied,setApplied]=useState("");
 const [query,setQuery]=useState(""),[selected,setSelected]=useState("");
 const [error,setError]=useState(""),[reload,setReload]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();setError("");
  const path=`/school/oversight${applied?"?date="+encodeURIComponent(applied):""}` as `/${string}`;
  requestApi(path,adminClassOversight,{signal:controller.signal}).then(({data})=>{
   if(controller.signal.aborted)return;
   setReport(data);setDate(data.date);
   setSelected(old=>data.classes.some(item=>item.classId===old)?old:data.classes[0]?.classId??"");
  }).catch(e=>{if(!controller.signal.aborted)setError(friendly(locale,e));});
  return()=>controller.abort();
 },[applied,locale,reload]);
 const rows=useMemo(()=>report?.classes.filter(row=>{
  const text=[row.classCode,row.classNameAr,row.classNameDe,row.teacherName??""].join(" ").toLocaleLowerCase();
  return text.includes(query.trim().toLocaleLowerCase());
 })??[],[report,query]);
 const active=report?.classes.find(row=>row.classId===selected)??rows[0];
 const withAttendance=report?.classes.some(row=>row.attendanceState!==null)??false;
 const withAcademics=report?.classes.some(row=>row.teachingEntries!==null)??false;
 const open=report?.classes.filter(row=>row.attendanceState==="not_started"||row.attendanceState==="open").length??0;
 const total= (key:"teachingEntries"|"upcomingExams")=>
  report?.classes.reduce((sum,row)=>sum+(row[key]??0),0)??0;
 const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setSelected("");setReport(undefined);setApplied(date);};
 return <main className={css.root}>
  <div className={css.header}>
   <h1 className={css.title}>{t.title}</h1>
   <span className={css.readonly}>{t.readonly}</span>
  </div>
  <form className={css.toolbar} onSubmit={submit}>
    <label className={css.label}>{t.date}<input className={css.date} type="date" value={date}
      onChange={e=>setDate(e.target.value)} required/></label>
    <button className={css.button}>{t.apply}</button>
    <label className={css.label}>{t.search}<input className={css.search} type="search" value={query}
      onChange={e=>setQuery(e.target.value)}/></label>
  </form>
  {report&&<div className={css.metrics}>
    <div className={css.metric}><strong className={css.metricValue}>{number(report.classes.length,locale)}</strong><span className={css.metricLabel}>{t.classes}</span></div>
    {withAttendance&&<div className={css.metric}><strong className={css.metricValue}>{number(open,locale)}</strong><span className={css.metricLabel}>{t.pending}</span></div>}
    {withAcademics&&<>
      <div className={css.metric}><strong className={css.metricValue}>{number(total("teachingEntries"),locale)}</strong><span className={css.metricLabel}>{t.teaching}</span></div>
      <div className={css.metric}><strong className={css.metricValue}>{number(total("upcomingExams"),locale)}</strong><span className={css.metricLabel}>{t.upcoming}</span></div>
    </>}
  </div>}
  {error&&<div className={css.error} role="alert">{error}
    <button className={css.button} type="button" onClick={()=>setReload(v=>v+1)}>{t.retry}</button>
  </div>}
  {!report&&!error&&<p role="status" className={css.muted}>{t.loading}</p>}
  {report&&<div className={css.columns}>
    <section className={css.card}>
      <h2 className={css.cardTitle}>{t.classList}</h2>
      {!rows.length&&<p className={css.muted}>{query?t.noMatching:t.noClasses}</p>}
      <ul className={css.list}>{rows.map(row=><li key={row.classId}>
        <button className={css.row} type="button" aria-pressed={active?.classId===row.classId}
          onClick={()=>setSelected(row.classId)}>
          <span className={css.rowHead}><span className={css.rowName}>{row.classCode} · <bdi>{locale==="ar"?row.classNameAr:row.classNameDe}</bdi></span>
            {row.attendanceState!==null&&<span className={css.status}>{labelStatus(locale,row.attendanceState)}</span>}
          </span>
          <span className={css.meta}>{row.teacherName??t.unassigned}</span>
        </button>
      </li>)}</ul>
    </section>
    <section className={css.card}>
      <h2 className={css.cardTitle}>{t.details}</h2>
      {active&&<div className={css.detail}>
       <div className={css.detailTop}><strong>{active.classCode} · <bdi>{locale==="ar"?active.classNameAr:active.classNameDe}</bdi></strong></div>
       <p className={css.muted}>{t.teacher}: <strong>{active.teacherName??t.unassigned}</strong></p>
       <div className={css.stats}>
        {active.attendanceState!==null&&<>
          <div className={css.stat}><strong>{labelStatus(locale,active.attendanceState)}</strong><span>{t.attendance}</span></div>
          <div className={css.stat}><strong>{number(active.unmarkedCount,locale)}</strong><span>{t.unmarked}</span></div>
        </>}
        {active.teachingEntries!==null&&<>
          <div className={css.stat}><strong>{number(active.teachingEntries,locale)}</strong><span>{t.logs}</span></div>
          <div className={css.stat}><strong>{number(active.activeHomework,locale)}</strong><span>{t.homework}</span></div>
          <div className={css.stat}><strong>{number(active.upcomingExams,locale)}</strong><span>{t.exams}</span></div>
          <div className={css.stat}><strong>{number(active.markedExamResults,locale)}</strong><span>{t.marks}</span></div>
        </>}
       </div>
       <div className={css.actions}>
        {active.attendanceState!==null&&<Link className={css.button}
          href={`/${locale}/school/more/attendance?class=${active.classId}&date=${report.date}`}>{t.toAttendance}</Link>}
        {active.teachingEntries!==null&&<Link className={css.button} href={`/${locale}/school/more/exams?class=${active.classId}`}>{t.toExams}</Link>}
        <Link className={css.button} href={`/${locale}/school/more/classes?year=${active.yearId}&class=${active.classId}`}>{t.toClass}</Link>
       </div>
      </div>}
    </section>
  </div>}
 </main>;
}
