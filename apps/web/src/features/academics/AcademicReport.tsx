"use client";

import Link from "next/link";
import { useEffect,useState } from "react";
import {
  academicReport,academicReportQuery,childSummarySchema,curriculumOffering,reportPupil,
  type AcademicReport as Report,type Locale,type ReportSource,
} from "@madrasty/contracts";
import { dictionary } from "@/i18n";
import { TimetableRead,useTimetableRead } from "@/features/school/timetable/shared";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { AcademicPageItems,offeringText,useAcademicPage } from "./shared";

const copy={
  ar:{title:"التقرير الأكاديمي",from:"من تاريخ",to:"إلى تاريخ",show:"عرض التقرير",period:"عرض الفترة",
    pupil:"الطالب",search:"بحث بالاسم أو رقم الطالب",find:"البحث عن طالب",class:"الفصل",allClasses:"كل الفصول المسموح بها",
    subject:"المادة",allSubjects:"كل المواد",enrollment:"الفصول خلال الفترة",attendance:"الحضور المعتمد",
    teaching:"الدروس المشروحة",activity:"درجات الأنشطة",homework:"الواجبات",evaluation:"التقييمات الدورية",exam:"الامتحانات",
    present:"حاضر",late:"متأخر",absent_unexcused:"غائب بدون عذر",absent_excused:"غائب بعذر",cancelled:"يوم ملغى",
    oral:"شفهي",written:"تحريري",approved_day:"يوم معتمد داخل الإجمالي",cancelled_day:"يوم ملغى خارج الإجمالي",
    unmarked_day:"حالة غير مسجلة خارج الإجمالي",delivered_lesson:"شرح فعلي مسجّل",missing_score:"درجة فارغة خارج الحساب",
    recorded_score:"درجة مسجلة داخل الحساب",published_evaluation:"تقييم منشور",published_result:"نتيجة منشورة",
    sources:"السجلات المستخدمة في التقرير",open:"فتح السجل",version:"المراجعة",refresh:"تحديث التقرير",
    participation:"المشاركة",understanding:"الفهم",preparation:"التحضير",emptyMarks:"ما فيش درجات مسجلة",
    mean:"متوسط الواجبات من ٢٠",marked:"درجات مسجلة",assigned:"واجبات مكلّف بها",days:"أيام لها حالة معتمدة",date:"التاريخ"},
  de:{title:"Lernbericht",from:"Ab Datum",to:"Bis Datum",show:"Bericht anzeigen",period:"Zeitraum anzeigen",
    pupil:"Schülerin oder Schüler",search:"Name oder Schülernummer",find:"Schüler suchen",class:"Klasse",allClasses:"Alle berechtigten Klassen",
    subject:"Fach",allSubjects:"Alle Fächer",enrollment:"Klassen im gewählten Zeitraum",attendance:"Bestätigte Anwesenheit",
    teaching:"Erteilter Unterricht",activity:"Bewertete Aktivitäten",homework:"Hausaufgaben",evaluation:"Regelmäßige Beurteilungen",exam:"Prüfungen",
    present:"Anwesend",late:"Verspätet",absent_unexcused:"Unentschuldigt abwesend",absent_excused:"Entschuldigt abwesend",cancelled:"Unterrichtstag abgesagt",
    oral:"Mündlich",written:"Schriftlich",approved_day:"Bestätigter Tag in der Statistik",cancelled_day:"Abgesagter Tag außerhalb der Statistik",
    unmarked_day:"Unmarkierter Tag außerhalb der Statistik",delivered_lesson:"Tatsächlich erteilter Unterricht",missing_score:"Fehlende Punktzahl ohne Wertung",
    recorded_score:"Erfasste Punktzahl mit Wertung",published_evaluation:"Veröffentlichte Beurteilung",published_result:"Veröffentlichtes Ergebnis",
    sources:"Quellen des Berichts",open:"Quelle öffnen",version:"Version",refresh:"Bericht aktualisieren",
    participation:"Mitarbeit",understanding:"Verständnis",preparation:"Vorbereitung",emptyMarks:"Keine Punkte erfasst",
    mean:"Durchschnitt der Hausaufgaben von 20",marked:"Erfasste Wertungen",assigned:"Aufgegebene Hausaufgaben",days:"Tage mit bestätigtem Status",date:"Datum"},
} as const;
const children=childSummarySchema.array(),offerings=curriculumOffering.array(),pupils=reportPupil.array();
type Period={from:string;to:string};
const emptyPeriod:Period={from:"",to:""};

export function AcademicReport({locale,initial,initialPeriod}:{locale:Locale;initial?:string;initialPeriod?:Period}){
  const {persona}=useAccountScope(),text=copy[locale],guardian=persona==="guardian";
  const [filter,setFilter]=useState(initialPeriod??emptyPeriod),[period,setPeriod]=useState<Period|undefined>(initialPeriod);
  const [pupil,setPupil]=useState(initial??""),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const refresh=()=>setRevision((n)=>n+1);
    window.addEventListener("focus",refresh);
    return ()=>window.removeEventListener("focus",refresh);
  },[]);
  const links=useTimetableRead(guardian?"/me/children?limit=100":null,children,revision);
  const active=guardian?(links.value?.data?.find((item)=>item.id===pupil)?.id??(!pupil?links.value?.data?.[0]?.id:undefined)):pupil;
  const valid=academicReportQuery.safeParse(filter).success;
  return <>
    <h1>{text.title}</h1>
    <form className="auth-card auth-form" onSubmit={(event)=>{
      event.preventDefault();
      if(valid){setPeriod({...filter});setRevision((n)=>n+1);}
    }}>
      {guardian&&<TimetableRead result={links} locale={locale}>{(options)=>options.length?<label>{text.pupil}
        <select value={active??""} onChange={(event)=>setPupil(event.target.value)}>
          {!active&&<option value="">{dictionary(locale).choose}</option>}
          {options.map((item)=><option value={item.id} key={item.id}>{item.displayName}</option>)}
        </select>
      </label>:<AsyncSurface locale={locale} state={{kind:"empty"}}/>}</TimetableRead>}
      <label>{text.from}<input type="date" required value={filter.from} onChange={(event)=>setFilter({...filter,from:event.target.value})}/></label>
      <label>{text.to}<input type="date" required value={filter.to} min={filter.from||undefined}
        onChange={(event)=>setFilter({...filter,to:event.target.value})}/></label>
      <button type="submit" className="primary-button" disabled={!valid}>{guardian?text.show:text.period}</button>
    </form>
    {!guardian&&period&&<PupilSearch locale={locale} period={period} revision={revision} selected={pupil} choose={setPupil}/>}
    {guardian&&pupil&&!active&&links.value?.data&&<AsyncSurface locale={locale} state={{kind:"forbidden"}}/>}
    {period&&active&&<ReportPanel key={`${active}/${period.from}/${period.to}`} locale={locale} pupil={active} period={period} revision={revision}
      guardian={guardian} refresh={()=>setRevision((n)=>n+1)}/>}
  </>;
}
function PupilSearch({locale,period,revision,selected,choose}:{
  locale:Locale;period:Period;revision:number;selected:string;choose:(value:string)=>void;
}){
  const text=copy[locale],options=useTimetableRead("/academics/offerings",offerings,revision);
  const [classId,setClass]=useState(""),[query,setQuery]=useState(""),[active,setActive]=useState("");
  const params=new URLSearchParams({from:period.from,to:period.to,limit:"30"});
  if(classId)params.set("classId",classId);
  if(active)params.set("query",active);
  const page=useAcademicPage(`/academics/reports/students?${params}`,pupils,revision);
  return <section className="auth-card">
    <form className="auth-form" onSubmit={(event)=>{event.preventDefault();setActive(query.trim());}}>
      <TimetableRead locale={locale} result={options}>{(values)=>{
        const classes=[...new Map(values.map((item)=>[item.classId,item])).values()];
        return <label>{text.class}<select value={classId} onChange={(event)=>{setClass(event.target.value);choose("");}}>
          <option value="">{text.allClasses}</option>
          {classes.map((item)=><option value={item.classId} key={item.classId}>{offeringText(item,locale)}</option>)}
        </select></label>;
      }}</TimetableRead>
      <label>{text.search}<input type="search" maxLength={120} value={query} onChange={(event)=>setQuery(event.target.value)}/></label>
      <button type="submit" className="plain-button">{text.find}</button>
    </form>
    <AcademicPageItems locale={locale} page={page}>{(values)=><ul className="group-list">{values.map((item)=><li key={item.id}>
      <button type="button" className="group-row" aria-pressed={item.id===selected} onClick={()=>choose(item.id)}>
        <bdi>{item.displayName}</bdi><bdi dir="ltr">{item.studentNumber}</bdi>
      </button>
    </li>)}</ul>}</AcademicPageItems>
  </section>;
}
function ReportPanel({locale,pupil,period,revision,guardian,refresh}:{
  locale:Locale;pupil:string;period:Period;revision:number;guardian:boolean;refresh:()=>void;
}){
  const text=copy[locale],[subject,setSubject]=useState("");
  const query=new URLSearchParams(period);
  if(subject)query.set("subjectId",subject);
  const report=useTimetableRead(`/academics/reports/students/${pupil}?${query}`,academicReport,revision);
  return <section className="auth-card auth-form">
    <div className="header-actions">
      <button type="button" className="plain-button" onClick={refresh}>{text.refresh}</button>
      {subject&&Boolean(report.value?.error)&&<button type="button" className="plain-button" onClick={()=>setSubject("")}>{text.allSubjects}</button>}
    </div>
    <TimetableRead result={report} locale={locale}>{(value)=><>
      <h2><bdi>{value.student.displayName}</bdi></h2>
      <p><bdi dir="ltr">{value.student.studentNumber} · {value.from} – {value.to}</bdi></p>
      {value.subjects.length>0&&<label>{text.subject}<select value={subject} onChange={(event)=>setSubject(event.target.value)}>
        <option value="">{text.allSubjects}</option>
        {value.subjects.map((item)=><option key={item.id} value={item.id}>{locale==="ar"?item.nameAr:item.nameDe}</option>)}
      </select></label>}
      {value.enrollments.length>0&&<details>
        <summary>{text.enrollment}</summary>
        <ul className="group-list">{value.enrollments.map((enrollment)=><li key={enrollment.enrollmentId} className="group-row">
          <bdi>{enrollment.classCode} · {locale==="ar"?enrollment.classNameAr:enrollment.classNameDe}</bdi>
          <bdi dir="ltr">{enrollment.enrolledFrom} – {enrollment.enrolledUntil}</bdi>
        </li>)}</ul>
      </details>}
      <ReportBody locale={locale} value={value} guardian={guardian}/>
    </>}</TimetableRead>
  </section>;
}

function ReportBody({locale,value,guardian}:{locale:Locale;value:Report;guardian:boolean}){
  const text=copy[locale],number=new Intl.NumberFormat(locale,{maximumFractionDigits:4});
  const accepted=(count:number)=>number.format(count);
  const formatPoints=(total:Report["groups"][number]["exams"])=>total.count
    ?`${accepted(total.earned)} / ${accepted(total.possible)} · ${text.marked} ${accepted(total.count)}`:text.emptyMarks;
  const attendance=value.attendance;
  return <>
    <section className="timetable-day">
      <h3>{text.attendance}</h3>
      <p>{text.days} · <bdi>{accepted(attendance.days)}</bdi></p>
      <ul className="group-list">{(["present","late","absent_unexcused","absent_excused","cancelled"] as const).map((status)=><li key={status}>
        {text[status]} · <bdi>{accepted(attendance[status])}</bdi>
      </li>)}</ul>
    </section>
    {value.groups.map((group)=>{
      const subject=value.subjects.find(({id})=>group.subjectId===id);
      if(!subject)return null;
      return <section key={group.subjectId} className="timetable-day">
        <h3><bdi>{locale==="ar"?subject.nameAr:subject.nameDe}</bdi></h3>
        <p>{text.teaching} · <bdi>{accepted(group.teachingCount)}</bdi></p>
        <p>{text.homework} · {accepted(group.homework.assigned)} {text.assigned} · {accepted(group.homework.scored)} {text.marked}</p>
        <p>{text.mean} · <bdi>{group.homework.mean===null?text.emptyMarks:accepted(group.homework.mean)}</bdi></p>
        <p>{text.activity} · <bdi>{formatPoints(group.activities)}</bdi></p>
        <p>{text.exam} · <bdi>{formatPoints(group.exams)}</bdi></p>
        <h4>{text.evaluation}</h4>
        {(["participation","understanding","preparation"] as const).map((scale)=><p key={scale}>
          {text[scale]} · <bdi>{group.evaluations[scale].average===null?text.emptyMarks:
            `${accepted(group.evaluations[scale].average)} / ${accepted(5)} · ${accepted(group.evaluations[scale].count)} ${text.marked}`}</bdi>
        </p>)}
      </section>;
    })}
    <h3>{text.sources}</h3>
    {value.sources.length?<ul className="group-list">{value.sources.map((source)=><li className="timetable-day" key={`${source.kind}/${source.sourceId}`}>
      <SourceRow locale={locale} source={source} value={value} guardian={guardian}/>
    </li>)}</ul>:<AsyncSurface locale={locale} state={{kind:"empty"}}/>}
  </>;
}
function sourceLink(locale:Locale,source:ReportSource,child?:string){
  if(!source.resourceId)return null;
  const id=source.resourceId,base=`/${locale}/school`,context=child?`&child=${child}`:"";
  switch(source.kind){
    case "attendance":return child?`${base}/children/${child}/attendance`:`${base}/more/attendance/history?row=${id}`;
    case "teaching":return `${base}/more/curriculum?lesson=${id}${context}`;
    case "activity":return `${base}/more/academics?activity=${id}${context}`;
    case "homework":return `${base}/more/homework?work=${id}${context}`;
    case "evaluation":return `${base}/more/evaluations?evaluation=${id}${context}`;
    case "exam":return `${base}/more/exams?exam=${id}${context}`;
  }
}
function SourceRow({locale,source,value,guardian}:{locale:Locale;source:ReportSource;value:Report;guardian:boolean}){
  const text=copy[locale],number=new Intl.NumberFormat(locale,{maximumFractionDigits:4});
  const context=value.enrollments.find((item)=>item.enrollmentId===source.enrollmentId);
  const subject=value.subjects.find((item)=>item.id===source.subjectId);
  const title=locale==="ar"?(source.titleAr||source.titleDe):(source.titleDe||source.titleAr);
  const link=sourceLink(locale,source,guardian?value.student.id:undefined);
  return <>
    <strong>{text[source.kind]}{title&&<> · <bdi>{title}</bdi></>}</strong>
    <p><bdi dir="ltr">{source.periodFrom?`${source.periodFrom} – ${source.date}`:source.date}</bdi>
      {context&&<> · <bdi>{context.classCode}</bdi></>}{subject&&<> · <bdi>{locale==="ar"?subject.nameAr:subject.nameDe}</bdi></>}</p>
    <p>{source.status&&<>{text[source.status]} · </>}{text[source.inclusionReason]}</p>
    {source.numerator!==null&&source.maximum!==null&&<p><bdi>{number.format(source.numerator)} / {number.format(source.maximum)}</bdi></p>}
    {(["participation","understanding","preparation"] as const).map((key)=>source[key]!==null&&<p key={key}>
      {text[key]} · <bdi>{number.format(source[key])} / {number.format(5)}</bdi>
    </p>)}
    <p>{text.version} · <bdi>{number.format(source.revision)}</bdi></p>
    {link&&<Link href={link} className="plain-button">{text.open}</Link>}
  </>;
}
