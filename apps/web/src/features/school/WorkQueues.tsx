"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { queuePageSchema, schoolPublishingEntry, workQueuesSchema, type Locale, type QueueItem, type WorkQueueKey } from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { dictionary } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { RoleHero } from "@/ui/RoleHero";
import { TimetableRead, timetableError, useTimetableRead } from "./timetable/shared";

const queueLabels: Record<Locale,Record<WorkQueueKey,string>> = {
  ar:{guardian_links:"روابط الأسر للمراجعة",family_imports:"دفعات استيراد مفتوحة",class_assignments:"فصول ينقصها تكليف",
    bounced_invites:"دعوات تعذّر تسليمها",unapproved_attendance:"حضور بانتظار الاعتماد",noncontinuation_requests:"طلبات وقف القيد",
    settlement_review:"مدفوعات للمراجعة",failed_deliveries:"إرسال تعذّر تسليمه"},
  de:{guardian_links:"Familienverknüpfungen zur Prüfung",family_imports:"Offene Familienimporte",class_assignments:"Klassen mit fehlendem Einsatz",
    bounced_invites:"Nicht zugestellte Einladungen",unapproved_attendance:"Offene Anwesenheitsfreigaben",noncontinuation_requests:"Anträge zur Abmeldung",
    settlement_review:"Zahlungen zur Prüfung",failed_deliveries:"Fehlgeschlagene Zustellungen"},
};
const copy={
  ar:{work:"مهام المدرسة",date:"المهام حتى تاريخ",apply:"عرض المهام",open:"فتح المهام",unavailable:"تعذّر تحميل العدد",
    empty:"ما فيش مهام مفتوحة في التاريخ ده.",back:"الصفحة الرئيسية",more:"عرض المزيد",directory:"دليل التواصل"},
  de:{work:"Aufgaben der Schule",date:"Aufgaben bis zum Datum",apply:"Aufgaben anzeigen",open:"Aufgaben öffnen",unavailable:"Anzahl nicht verfügbar",
    empty:"Für dieses Datum liegen keine offenen Aufgaben vor.",back:"Startseite",more:"Weitere anzeigen",directory:"Kontaktverzeichnis"},
} as const;
const query=(asOf?:string)=>asOf?`?asOf=${asOf}`:"";
const queueRoute=(locale:Locale,route:string,asOf:string)=>`/${locale}${route}${query(asOf)}`;
const publications = schoolPublishingEntry.array();
const overviewCopy = {
  ar: {title:"المدرسة في أرقام", quick:"إجراءات سريعة", students:"الطلبة", classes:"الفصول", teachers:"المدرسون",
    guardian:"إضافة ولي أمر", event:"إضافة حدث", invoice:"إصدار فاتورة", announcement:"إرسال إعلان",
    news:"آخر أخبار المدرسة", events:"الأحداث", allNews:"أخبار المدرسة", addStudent:"إضافة طالب", school:"أقسام المدرسة"},
  de: {title:"Die Schule auf einen Blick", quick:"Schnellzugriff", students:"Schüler", classes:"Klassen", teachers:"Lehrkräfte",
    guardian:"Sorgeberechtigte hinzufügen", event:"Neue Veranstaltung", invoice:"Rechnungen ausstellen", announcement:"Mitteilung senden",
    news:"Aktuelles aus der Schule", events:"Veranstaltungen", allNews:"Schulnachrichten", addStudent:"Schüler hinzufügen", school:"Schulbereiche"},
} as const;

function SchoolUpdates({locale,today,version}:{locale:Locale;today:string;version:number}) {
  const labels = overviewCopy[locale], base = `/${locale}/school/more`;
  const news = useTimetableRead("/news?limit=3",publications,version);
  const events = useTimetableRead(`/events?month=${today.slice(0,7)}&limit=60`,publications,version);
  const recent = news.value?.data ?? [];
  const upcoming = events.value?.data?.filter(item => item.kind === "event" &&
    (item.timing.end?.date ?? item.timing.start.date) >= today).slice(0,2) ?? [];
  return <section className="auth-card">
    <h2>{labels.news}</h2>
    <ul className="group-list">{[...recent,...upcoming].map(item => <li key={item.id}>
      <Link className="group-row" href={`${base}/${item.kind === "news" ? "news" : "events"}?item=${item.id}`}>
        {(item.copy[locale] ?? item.copy[item.sourceLocale])?.title}
      </Link>
    </li>)}</ul>
    <div className="header-actions">
      <Link className="plain-button" href={`${base}/news`}>{labels.allNews}</Link>
      <Link className="plain-button" href={`${base}/events`}>{labels.events}</Link>
    </div>
  </section>;
}

export function AdminWork({locale,initialDay}:{locale:Locale;initialDay?:string}){
  const text=copy[locale];
  const [dateText,setDate]=useState(initialDay??"");
  const [asOf,setAsOf]=useState(initialDay);
  const [version,setVersion]=useState(0);
  const result=useTimetableRead(`/school/work-queues${query(asOf)}`,workQueuesSchema,version);
  useEffect(()=>{
    const refresh=()=>setVersion((count)=>count+1);
    window.addEventListener("focus",refresh);
    return ()=>window.removeEventListener("focus",refresh);
  },[]);

  function update(){
    const url=new URL(window.location.href);
    if(dateText)url.searchParams.set("asOf",dateText);
    else url.searchParams.delete("asOf");
    window.history.replaceState(null,"",url);
    setAsOf(dateText||undefined);
  }

  if (!result.value?.data) {
    return <>
      <RoleHero persona="admin" title={text.work}
        detail={locale==="ar"?"متابعة أعمال المدرسة":"Schulaufgaben im Überblick"}
        action={{href:`/${locale}/school/more`,label:locale==="ar"?"أقسام المدرسة":"Schulbereiche"}} />
      <TimetableRead locale={locale} result={result}>{()=>null}</TimetableRead>
    </>;
  }
  return <TimetableRead locale={locale} result={result}>{(summary)=>{
    if (summary.setupRequired === true) {
      return <RoleHero persona="admin" title={text.work}
        detail={locale==="ar"?"إعدادات المدرسة مطلوبة قبل عرض المهام.":"Die Schule muss eingerichtet werden."}
        action={summary.mayConfigure
          ? {href:`/${locale}/school/more/calendar`,label:locale==="ar"?"إعداد المدرسة":"Schule einrichten"}
          : {href:`/${locale}/directory`,label:text.directory}} />;
    }
    const date=summary.asOf;
    const first=summary.queues.find((row)=>row.state==="ready"&&row.count>0);
    const detail=first?queueLabels[locale][first.key]:summary.queues.some((row)=>row.state==="unavailable")?text.unavailable:text.empty;
    const overview=summary.overview, labels=overviewCopy[locale], base=`/${locale}/school`;
    const metrics=(["students","classes","teachers"] as const).filter(key=>overview?.[key] != null);
    const formatter=new Intl.NumberFormat(locale);
    return <>
      <RoleHero persona="admin" title={text.work} detail={detail}
        action={first?{href:queueRoute(locale,first.route,first.filters.asOf),label:text.open}
          :overview?.students != null ? {href:`${base}/students?add=student`,label:labels.addStudent}
          :{href:`${base}/more`,label:labels.school}} />
      {metrics.length>0&&<section className="auth-card">
        <h2>{labels.title}</h2>
        <dl className="school-overview-metrics">{metrics.map(key=><div key={key}>
          <dt>{labels[key]}</dt><dd>{formatter.format(overview![key]!)}</dd>
        </div>)}</dl>
      </section>}
      {overview&&(overview.students != null||overview.mayIssue||overview.mayPublish)&&<section className="auth-card">
        <h2>{labels.quick}</h2>
        <div className="header-actions">
          {overview.students != null&&<Link className="plain-button" href={`${base}/students?add=guardian`}>{labels.guardian}</Link>}
          {overview.mayPublish&&<><Link className="plain-button" href={`${base}/more/events?add=1`}>{labels.event}</Link>
            <Link className="plain-button" href={`${base}/more/broadcasts`}>{labels.announcement}</Link></>}
          {overview.mayIssue&&<Link className="plain-button" href={`${base}/more/issue-invoices`}>{labels.invoice}</Link>}
        </div>
      </section>}
      <section className="auth-card">
        <form className="auth-form" onSubmit={(event)=>{event.preventDefault();update();}}>
          <label>{text.date}<input type="date" value={dateText||date}
            onChange={(event)=>setDate(event.target.value)}/></label>
          <button className="plain-button" type="submit">{text.apply}</button>
        </form>
        <ul className="group-list">{summary.queues.map((entry)=><li key={entry.key}>
          {entry.state==="ready"?<Link className="group-row" href={queueRoute(locale,entry.route,entry.filters.asOf)}>
            <span>{queueLabels[locale][entry.key]}</span><output>{new Intl.NumberFormat(locale).format(entry.count)}</output>
          </Link>:<div className="group-row"><span>{queueLabels[locale][entry.key]}</span><small>{text.unavailable}</small></div>}
        </li>)}</ul>
      </section>
      <SchoolUpdates locale={locale} today={summary.today} version={version} />
    </>;
  }}</TimetableRead>;
}

function action(locale:Locale,entry:QueueItem) {
  const base=`/${locale}/school`;
  const target=entry.target;
  if(target.kind==="guardian_link")return `${base}/students?guardian=${target.guardianId}&link=${target.linkId}`;
  if(target.kind==="family_import")return `${base}/students/import?job=${target.jobId}`;
  if(target.kind==="enrollment_stop")return `${base}/more/enrollment-stops?request=${target.requestId}`;
  if(target.kind==="attendance_sheet")return `${base}/more/attendance?class=${target.classId}&date=${target.date}`;
  if(target.kind==="receipt_match")return `${base}/more/receipts?receipt=${target.receiptId}`;
  if(target.kind==="delivery_review")return `${base}/more/delivery-status?job=${target.deliveryId}`;
  if(target.kind==="bounced_invite")return `/${locale}/staff/invitations?invite=${target.invitationId}`;
  return `${base}/more/assignments?year=${target.yearId}&class=${target.classId}`;
}

export function WorkQueue({locale,queue,asOf}:{locale:Locale;queue:WorkQueueKey;asOf?:string}){
  const text=copy[locale], actor=useAccountScope();
  const [generation,setGeneration]=useState(0);
  const [busy,setBusy]=useState(false);
  const [failure,setFailure]=useState<string>();
  const [state,setState]=useState<{
    key:string;payload?:{items:QueueItem[];asOf:string;next?:string};error?:unknown;
  }>();
  const path=`/school/work-queues/${queue}${query(asOf)}` as const;

  useEffect(()=>{
    const abort=new AbortController();
    const reload=()=>setGeneration((count)=>count+1);
    requestApi(path,queuePageSchema,{signal:abort.signal,headers:{"X-School-Persona":actor.persona}})
      .then(({data,meta})=>{if(!abort.signal.aborted)setState({key:path,payload:{...data,next:meta?.nextCursor}});})
      .catch((error)=>{if(!abort.signal.aborted)setState({key:path,error});});
    window.addEventListener("focus",reload);
    return ()=>{abort.abort();window.removeEventListener("focus",reload);};
  },[actor.persona,generation,path]);

  const current=state?.key===path?state:undefined;
  const payload=current?.payload;

  async function more(){
    if(!payload?.next||busy)return;
    setBusy(true);
    setFailure(undefined);
    try{
      const {data,meta}=await requestApi(`/school/work-queues/${queue}?asOf=${payload.asOf}&cursor=${payload.next}`,queuePageSchema,{
        headers:{"X-School-Persona":actor.persona},
      });
      setState((old)=>old?.payload===payload?{key:path,payload:{asOf:data.asOf,items:[...payload.items,...data.items],next:meta?.nextCursor}}:old);
    }catch(error){
      if(error instanceof ApiResponseError && [401,403,404].includes(error.status))setState({key:path,error});
      else setFailure(timetableError(locale,error));
    }finally{setBusy(false);}
  }

  return <>
    <h1>{queueLabels[locale][queue]}</h1>
    <Link className="plain-button" href={`/${locale}/school/home${query(payload?.asOf??asOf)}`}>{text.back}</Link>
    <AsyncSurface locale={locale} state={current?.error?current.error instanceof ApiResponseError&&[401,403,404].includes(current.error.status)
      ?{kind:"forbidden"}:{kind:"error",retry:()=>setGeneration((count)=>count+1),message:timetableError(locale,current.error)}
      :payload?{kind:"ready",content:<section className="auth-card">
        <p><bdi dir="ltr">{payload.asOf}</bdi></p>
        {payload.items.length===0&&<p>{text.empty}</p>}
        <ul className="group-list">{payload.items.map((entry)=><li key={entry.id}>
          <Link className="group-row" href={action(locale,entry)}>
            <bdi>{locale==="ar"?entry.titleAr:entry.titleDe}</bdi>
            <small><bdi>{locale==="ar"?entry.detailAr:entry.detailDe}</bdi></small>
          </Link>
        </li>)}</ul>
        {payload.next&&<button className="plain-button" onClick={()=>void more()} disabled={busy}>{text.more}</button>}
        {failure&&<p role="alert">{failure}</p>}
      </section>}:{kind:"initialLoading"}}/>
  </>;
}
