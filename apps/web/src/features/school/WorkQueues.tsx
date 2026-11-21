"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { queuePageSchema, workQueuesSchema, type Locale, type QueueItem, type SchoolQueueKey, type WorkQueueKey } from "@madrasty/contracts";
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

export function AdminWork({locale,initialDay}:{locale:Locale;initialDay?:string}){
  const text=copy[locale];
  const [date,setDate]=useState(initialDay??"");
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
    if(date)url.searchParams.set("asOf",date);
    else url.searchParams.delete("asOf");
    window.history.replaceState(null,"",url);
    setAsOf(date||undefined);
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
    const first=summary.queues.find((row)=>row.state==="ready"&&row.count>0);
    const detail=first?queueLabels[locale][first.key]:summary.queues.some((row)=>row.state==="unavailable")?text.unavailable:text.empty;
    return <>
      <RoleHero persona="admin" title={text.work} detail={detail}
        action={first?{href:queueRoute(locale,first.route,first.filters.asOf),label:text.open}
          :{href:`/${locale}/directory`,label:text.directory}} />
      <section className="auth-card">
        <form className="auth-form" onSubmit={(event)=>{event.preventDefault();update();}}>
          <label>{text.date}<input type="date" value={date||summary.asOf}
            onChange={(event)=>setDate(event.target.value)}/></label>
          <button className="plain-button" type="submit">{text.apply}</button>
        </form>
        <ul className="group-list">{summary.queues.map((entry)=><li key={entry.key}>
          {entry.state==="ready"?<Link className="group-row" href={queueRoute(locale,entry.route,entry.filters.asOf)}>
            <span>{queueLabels[locale][entry.key]}</span><output>{new Intl.NumberFormat(locale).format(entry.count)}</output>
          </Link>:<div className="group-row"><span>{queueLabels[locale][entry.key]}</span><small>{text.unavailable}</small></div>}
        </li>)}</ul>
      </section>
    </>;
  }}</TimetableRead>;
}

function action(locale:Locale,entry:QueueItem) {
  const base=`/${locale}/school`;
  const target=entry.target;
  if(target.kind==="guardian_link")return `${base}/students?guardian=${target.guardianId}&link=${target.linkId}`;
  if(target.kind==="family_import")return `${base}/students/import?job=${target.jobId}`;
  return `${base}/more/assignments?year=${target.yearId}&class=${target.classId}`;
}

export function WorkQueue({locale,queue,asOf}:{locale:Locale;queue:SchoolQueueKey;asOf?:string}){
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
