"use client";

import {useEffect,useMemo,useState,type ReactNode} from "react";
import {
  yearSchema,adminMonitorClass,adminMonitorDashboard,adminMonitorStudent,
  type Locale,type AdminMonitorDashboard,type AdminMonitorStudent,
} from "@madrasty/contracts";
import {useTimetableRead,TimetableRead} from "@/features/school/timetable/shared";
import styles from "./AdminClassMonitor.module.css";

type Section="students"|"attendance"|"exams"|"homework"|"activities"|"evaluations"|"teaching";
const sections:Section[]=["students","attendance","exams","homework","activities","evaluations","teaching"];
const yearsSchema=yearSchema.array(),classesSchema=adminMonitorClass.array();
const copy={
 ar:{
  classes:"الفصول",search:"ابحث عن فصل",year:"السنة الدراسية",classView:"عرض الفصل",
  noClasses:"لا توجد فصول لهذه السنة",noSearch:"لا توجد فصول مطابقة",
  teacher:"المدرس",notAssigned:"لم يُعين مدرس",students:"الطلبة",attendance:"الحضور",
  exams:"الامتحانات والدرجات",homework:"الواجبات",activities:"الأنشطة",
  evaluations:"التقييمات",teaching:"سجل الحصص",
  dashboard:"متابعة الفصل",readonly:"عرض فقط",backClasses:"الرجوع للفصول",
  recentAttendance:"آخر حضور معتمد",published:"نتائج منشورة",upcoming:"امتحانات معلنة",
  noAttendance:"لا يوجد كشف حضور معتمد",attendanceHelp:"السجل المعتمد من المدرس فقط",
  present:"حاضر",late:"متأخر",absent_unexcused:"غائب",absent_excused:"غائب بعذر",
  unmarked:"غير مسجل",noData:"لا توجد بيانات رسمية لعرضها",
  noOfficial:"لم تُنشر النتيجة",noGrades:"لم تُنشر نتائج بعد",
  details:"التفاصيل",profile:"ملف الطالب",viewProfile:"عرض ملف الطالب",
  backClass:"الرجوع للفصل",score:"الدرجة",subject:"المادة",
  announced:"معلن",publishedCount:"نتائج منشورة",max:"الدرجة النهائية",
  period:"الفترة",date:"التاريخ",feedback:"ملاحظات المدرس",
  participation:"المشاركة",understanding:"الفهم",preparation:"التحضير",
  strengths:"نقاط القوة",improvements:"نقاط للتحسين",
  instructions:"تفاصيل الواجب",recordedBy:"سجله",refresh:"بيانات المدرسة الرسمية فقط",
  noContent:"لا توجد معلومات منشورة",name:"اسم الطالب",studentNumber:"رقم الطالب",
 },
 de:{
  classes:"Klassen",search:"Klasse suchen",year:"Schuljahr",classView:"Klasse ansehen",
  noClasses:"Keine Klassen in diesem Schuljahr",noSearch:"Keine passende Klasse",
  teacher:"Lehrkraft",notAssigned:"Keine Lehrkraft",students:"Schüler",attendance:"Anwesenheit",
  exams:"Prüfungen und Noten",homework:"Hausaufgaben",activities:"Aktivitäten",
  evaluations:"Beurteilungen",teaching:"Unterrichtsverlauf",
  dashboard:"Klassenübersicht",readonly:"Nur ansehen",backClasses:"Zurück zu Klassen",
  recentAttendance:"Letzte bestätigte Anwesenheit",published:"Veröffentlichte Ergebnisse",
  upcoming:"Angekündigte Prüfungen",noAttendance:"Noch keine bestätigte Anwesenheit",
  attendanceHelp:"Nur bestätigte Einträge der Lehrkraft",present:"Anwesend",late:"Verspätet",
  absent_unexcused:"Fehlt",absent_excused:"Entschuldigt",unmarked:"Nicht erfasst",
  noData:"Noch keine offiziellen Daten",noOfficial:"Noch kein veröffentlichtes Ergebnis",
  noGrades:"Noch kein veröffentlichtes Ergebnis",
  details:"Details",profile:"Schülerprofil",viewProfile:"Schülerprofil ansehen",
  backClass:"Zurück zur Klasse",score:"Punkte",subject:"Fach",announced:"Angekündigt",
  publishedCount:"Ergebnisse veröffentlicht",max:"Höchstpunktzahl",
  period:"Zeitraum",date:"Datum",feedback:"Rückmeldung",participation:"Mitarbeit",
  understanding:"Verständnis",preparation:"Vorbereitung",strengths:"Stärken",
  improvements:"Was besser werden kann",instructions:"Aufgabe",recordedBy:"Eingetragen von",
  refresh:"Nur offizielle Schulangaben",noContent:"Noch nichts veröffentlicht",
  name:"Name",studentNumber:"Schülernummer",
 }
} as const;

type Copy=typeof copy["ar"]|typeof copy["de"];
type Labelled={subjectAr:string;subjectDe:string};
function subject(row:Labelled,locale:Locale){return locale==="ar"?row.subjectAr:row.subjectDe;}
function dateLabel(value:string,locale:Locale){
 const date=new Date(value+"T12:00:00Z");
 return Number.isNaN(date.valueOf())?value:new Intl.DateTimeFormat(locale==="ar"?"ar-EG":"de-DE",{
  day:"2-digit",month:"short",year:"numeric",timeZone:"UTC",
 }).format(date);
}
function number(value:number,locale:Locale){return new Intl.NumberFormat(locale==="ar"?"ar-EG":"de-DE").format(value);}
function Empty({message}:{message:string}){return <p className={styles.empty}>{message}</p>;}
function labelStatus(status:string|null,t:Copy){
 switch(status){
  case "present":return t.present;case "late":return t.late;
  case "absent_unexcused":return t.absent_unexcused;
  case "absent_excused":return t.absent_excused;
  default:return t.unmarked;
 }
}
function Count({label,value}:{label:string;value:string|number}){
 return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>;
}
function Topic({title,meta,children}:{title:string;meta?:string;children?:ReactNode}){
 return <article className={styles.topic}><div className={styles.topicTitle}><strong>{title}</strong>{meta&&<span>{meta}</span>}</div>{children}</article>;
}

function ClassDetails({locale,report,section,setSection,openStudent,goBack}:{
 locale:Locale;report:AdminMonitorDashboard;section:Section;setSection:(value:Section)=>void;
 openStudent:(id:string)=>void;goBack:()=>void;
}){
 const t=copy[locale],pupilNames=new Map(report.students.map(row=>[row.studentId,row.name]));
 const [filter,setFilter]=useState("");
 const shownStudents=report.students.filter(row=>[row.name,row.number].join(" ").toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
 const resultCount=report.exams.reduce((sum,row)=>sum+row.publishedCount,0);
 return <>
  <div className={styles.toolbar}>
   <button type="button" className={styles.back} onClick={goBack}>{t.backClasses}</button>
   <span className={styles.readonly}>{t.readonly}</span>
  </div>
  <header className={styles.header}>
   <span className={styles.eyebrow}>{t.dashboard}</span>
   <h1>{report.classroom.code} · <bdi>{locale==="ar"?report.classroom.nameAr:report.classroom.nameDe}</bdi></h1>
   <p>{t.teacher}: {report.classroom.teacherName??t.notAssigned}</p>
  </header>
  <div className={styles.metrics}>
   <Count label={t.students} value={number(report.students.length,locale)}/>
   <Count label={t.recentAttendance} value={report.lastAttendance?dateLabel(report.lastAttendance.date,locale):"—"}/>
   <Count label={t.upcoming} value={number(report.exams.length,locale)}/>
   <Count label={t.published} value={number(resultCount,locale)}/>
  </div>
  {report.lastAttendance&&<div className={styles.attendanceSummary}>
   <strong>{t.recentAttendance} · {dateLabel(report.lastAttendance.date,locale)}</strong>
   <div className={styles.chips}>
    <span>{t.present} {number(report.lastAttendance.present,locale)}</span>
    <span>{t.late} {number(report.lastAttendance.late,locale)}</span>
    <span>{t.absent_unexcused} {number(report.lastAttendance.absentUnexcused,locale)}</span>
    <span>{t.absent_excused} {number(report.lastAttendance.absentExcused,locale)}</span>
   </div>
  </div>}
  <nav className={styles.sections} aria-label={t.dashboard}>
   {sections.map(key=><button key={key} type="button" className={section===key?styles.selected:styles.section}
     aria-current={section===key?"page":undefined} onClick={()=>setSection(key)}>{t[key]}</button>)}
  </nav>
  <section className={styles.sectionBody} aria-live="polite">
   <h2>{t[section]}</h2>
   {section==="students"&&<>
    <label className={styles.field}>{t.search}<input value={filter} onChange={e=>setFilter(e.target.value)} type="search"
      placeholder={t.name}/></label>
    {!shownStudents.length?<Empty message={report.students.length?t.noSearch:t.noData}/>:<div className={styles.list}>
     {shownStudents.map(p=><div key={p.studentId} className={styles.pupilRow}>
      <div className={styles.pupilName}><strong><bdi>{p.name}</bdi></strong><small>{t.studentNumber}: <bdi>{p.number}</bdi></small></div>
      <button type="button" className={styles.action} onClick={()=>openStudent(p.studentId)}>{t.viewProfile}</button>
     </div>)}
    </div>}
   </>}
   {section==="attendance"&&<>
    <p className={styles.muted}>{t.attendanceHelp}</p>
    {report.attendance.length===0?<Empty message={t.noAttendance}/>:<div className={styles.list}>
      {report.attendance.map((row,index)=><Topic key={row.studentId+"-"+row.date+"-"+index}
       title={pupilNames.get(row.studentId)??t.name} meta={dateLabel(row.date,locale)}>
       <span className={styles.status}>{labelStatus(row.status,t)}</span>
      </Topic>)}
    </div>}
   </>}
   {section==="exams"&&(!report.exams.length?<Empty message={t.noContent}/>:<div className={styles.list}>
    {report.exams.map(row=><Topic key={row.id} title={row.title} meta={dateLabel(row.date,locale)}>
     <p>{t.subject}: {subject(row,locale)}{row.time?" · "+row.time:""}</p>
     <p>{t.max}: {number(row.maxScore,locale)} · {t.publishedCount}: {number(row.publishedCount,locale)}</p>
    </Topic>)}
   </div>)}
   {section==="homework"&&(!report.homework.length?<Empty message={t.noContent}/>:<div className={styles.list}>
    {report.homework.map(row=><Topic key={row.id} title={row.title} meta={dateLabel(row.dueOn,locale)}>
     <p>{t.subject}: {subject(row,locale)} · {t.publishedCount}: {number(row.publishedCount,locale)}</p>
     <p className={styles.pre}>{row.instructions}</p>
    </Topic>)}
   </div>)}
   {section==="activities"&&(!report.activities.length?<Empty message={t.noContent}/>:<div className={styles.list}>
    {report.activities.map(row=><Topic key={row.id} title={row.title} meta={dateLabel(row.date,locale)}>
     <p>{t.subject}: {subject(row,locale)} · {t.publishedCount}: {number(row.publishedCount,locale)}</p>
    </Topic>)}
   </div>)}
   {section==="evaluations"&&(!report.evaluations.length?<Empty message={t.noContent}/>:<div className={styles.list}>
    {report.evaluations.map(row=><Topic key={row.id} title={row.title} meta={dateLabel(row.periodEnd,locale)}>
     <p>{row.studentName} · {subject(row,locale)}</p>
     <div className={styles.chips}><span>{t.participation} {number(row.participation,locale)}/5</span>
      <span>{t.understanding} {number(row.understanding,locale)}/5</span>
      <span>{t.preparation} {number(row.preparation,locale)}/5</span></div>
     {row.strengths&&<p className={styles.pre}><b>{t.strengths}:</b> {row.strengths}</p>}
     {row.improvements&&<p className={styles.pre}><b>{t.improvements}:</b> {row.improvements}</p>}
     <button className={styles.action} type="button" onClick={()=>openStudent(row.studentId)}>{t.viewProfile}</button>
    </Topic>)}
   </div>)}
   {section==="teaching"&&(!report.teaching.length?<Empty message={t.noContent}/>:<div className={styles.list}>
    {report.teaching.map(row=><Topic key={row.id} title={subject(row,locale)} meta={dateLabel(row.date,locale)}>
     <p className={styles.pre}>{row.notes}</p>
     {row.teacher&&<p>{t.recordedBy}: {row.teacher}</p>}
    </Topic>)}
   </div>)}
  </section>
 </>;
}
function StudentDetails({locale,report,goBack}:{locale:Locale;report:AdminMonitorStudent;goBack:()=>void}){
 const t=copy[locale],student=report.student;
 const totals={present:0,late:0,absent_unexcused:0,absent_excused:0};
 for(const row of report.attendance)if(row.status&&row.status in totals)totals[row.status]++;
 const score=(value:number|null,max:number)=>value===null?t.noOfficial:`${number(value,locale)} / ${number(max,locale)}`;
 return <>
  <div className={styles.toolbar}><button type="button" className={styles.back} onClick={goBack}>{t.backClass}</button>
   <span className={styles.readonly}>{t.readonly}</span></div>
  <header className={styles.header}>
   <span className={styles.eyebrow}>{student.classCode} · {locale==="ar"?student.classNameAr:student.classNameDe}</span>
   <h1>{t.profile}</h1><p>{student.name} · {t.studentNumber}: {student.number}</p>
  </header>
  <div className={styles.panel}>
   <h2>{t.attendance}</h2>
   {report.attendance.length?<><div className={styles.metrics}>
    <Count label={t.present} value={number(totals.present,locale)}/>
    <Count label={t.late} value={number(totals.late,locale)}/>
    <Count label={t.absent_unexcused} value={number(totals.absent_unexcused,locale)}/>
    <Count label={t.absent_excused} value={number(totals.absent_excused,locale)}/>
   </div><div className={styles.list}>{report.attendance.map((a,index)=><Topic key={a.date+index}
    title={dateLabel(a.date,locale)}><span className={styles.status}>{labelStatus(a.status,t)}</span></Topic>)}</div></>:
    <Empty message={t.noAttendance}/>}
  </div>
  <div className={styles.panel}><h2>{t.exams}</h2>
   {!report.exams.length?<Empty message={t.noGrades}/>:report.exams.map(row=><Topic key={row.id}
    title={row.title} meta={dateLabel(row.date,locale)}>
    <p>{subject(row,locale)} · {t.score}: <strong>{score(row.score,row.maxScore)}</strong></p>
    {row.feedback&&<p className={styles.pre}>{t.feedback}: {row.feedback}</p>}
   </Topic>)}
  </div>
  <div className={styles.panel}><h2>{t.homework}</h2>
   {!report.homework.length?<Empty message={t.noData}/>:report.homework.map(row=><Topic key={row.id}
    title={row.title} meta={dateLabel(row.dueOn,locale)}>
    <p>{subject(row,locale)} · {t.score}: <strong>{score(row.score,20)}</strong></p>
    {row.feedback&&<p className={styles.pre}>{t.feedback}: {row.feedback}</p>}
   </Topic>)}
  </div>
  <div className={styles.panel}><h2>{t.activities}</h2>
   {!report.activities.length?<Empty message={t.noData}/>:report.activities.map(row=><Topic key={row.id}
    title={row.title} meta={dateLabel(row.date,locale)}>
    <p>{subject(row,locale)} · {t.score}: <strong>{score(row.score,row.maxScore)}</strong></p>
   </Topic>)}
  </div>
  <div className={styles.panel}><h2>{t.evaluations}</h2>
   {!report.evaluations.length?<Empty message={t.noData}/>:report.evaluations.map(row=><Topic key={row.id}
    title={row.title} meta={dateLabel(row.periodEnd,locale)}>
    <p>{subject(row,locale)} · {t.period}: {dateLabel(row.periodStart,locale)} – {dateLabel(row.periodEnd,locale)}</p>
    <div className={styles.chips}><span>{t.participation} {number(row.participation,locale)}/5</span>
     <span>{t.understanding} {number(row.understanding,locale)}/5</span>
     <span>{t.preparation} {number(row.preparation,locale)}/5</span></div>
    {row.strengths&&<p className={styles.pre}><b>{t.strengths}:</b> {row.strengths}</p>}
    {row.improvements&&<p className={styles.pre}><b>{t.improvements}:</b> {row.improvements}</p>}
   </Topic>)}
  </div>
 </>;
}
export function AdminClassMonitor({locale}:{locale:Locale}){
 const t=copy[locale],years=useTimetableRead("/school/years",yearsSchema);
 const [yearId,setYearId]=useState(""),[classId,setClassId]=useState(""),[studentId,setStudentId]=useState("");
 const [query,setQuery]=useState(""),[section,setSection]=useState<Section>("students");
 const classList=useTimetableRead(yearId?`/school/monitor/classes?yearId=${yearId}`:null,classesSchema);
 const classRead=useTimetableRead(classId?`/school/monitor/classes/${classId}`:null,adminMonitorDashboard);
 const studentRead=useTimetableRead(classId&&studentId?`/school/monitor/classes/${classId}/students/${studentId}`:null,adminMonitorStudent);
 useEffect(()=>{
  const restore=()=>{const params=new URLSearchParams(window.location.search);
   setYearId(params.get("year")??"");setClassId(params.get("class")??"");setStudentId(params.get("student")??"");};
  restore();window.addEventListener("popstate",restore);
  return()=>window.removeEventListener("popstate",restore);
 },[]);
 useEffect(()=>{
  if(yearId||!years.value?.data?.length)return;
  const selected=years.value.data.find(value=>value.state==="active")??years.value.data[0];
  setYearId(selected.id);
 },[yearId,years.value?.data]);
 function navigate(year:string,schoolClass="",student=""){
  setYearId(year);setClassId(schoolClass);setStudentId(student);
  const params=new URLSearchParams();
  if(year)params.set("year",year);if(schoolClass)params.set("class",schoolClass);
  if(student)params.set("student",student);
  window.history.pushState(null,"",window.location.pathname+(params.size?"?"+params:""));
 }
 const visible=useMemo(()=>classList.value?.data?.filter(row=>{
  const text=[row.code,row.nameAr,row.nameDe,row.teacherName??""].join(" ").toLocaleLowerCase();
  return text.includes(query.trim().toLocaleLowerCase());
 }),[classList.value?.data,query]);
 return <main className={styles.root} dir={locale==="ar"?"rtl":"ltr"}>
  {!classId?<><header className={styles.header}><span className={styles.eyebrow}>{t.refresh}</span>
   <h1>{t.classes}</h1></header>
   <TimetableRead locale={locale} result={years}>{(items)=><label className={styles.field}>
    {t.year}<select value={yearId} onChange={e=>navigate(e.target.value)}>
     {items.map(y=><option key={y.id} value={y.id}>{y.startsOn} – {y.endsExclusive}</option>)}
    </select></label>}</TimetableRead>
   <label className={styles.field}>{t.search}<input type="search" placeholder={t.search}
    value={query} onChange={e=>setQuery(e.target.value)}/></label>
   {yearId&&<TimetableRead locale={locale} result={classList}>{()=>{
    if(!visible?.length)return <Empty message={query?t.noSearch:t.noClasses}/>;
    return <div className={styles.classList}>{visible.map(row=><button type="button" key={row.classId}
      aria-label={row.code+" · "+t.classView} className={styles.classCard}
      onClick={()=>navigate(yearId,row.classId)}>
       <span className={styles.classHeadline}><strong>{row.code} · {locale==="ar"?row.nameAr:row.nameDe}</strong>
        <span>{t.classView}</span></span>
       <span>{t.teacher}: {row.teacherName??t.notAssigned}</span>
       <span>{t.students}: {number(row.studentCount,locale)} · {t.recentAttendance}: {row.lastAttendanceDate?dateLabel(row.lastAttendanceDate,locale):"—"}</span>
      </button>)}</div>;
   }}</TimetableRead>}
  </>:studentId?<TimetableRead locale={locale} result={studentRead}>{(profile)=>
    <StudentDetails locale={locale} report={profile} goBack={()=>navigate(yearId,classId)}/>}</TimetableRead>
  :<TimetableRead locale={locale} result={classRead}>{(report)=>
    <ClassDetails locale={locale} report={report} section={section} setSection={setSection}
      goBack={()=>navigate(yearId)} openStudent={id=>navigate(yearId,classId,id)}/>}</TimetableRead>}
 </main>;
}
