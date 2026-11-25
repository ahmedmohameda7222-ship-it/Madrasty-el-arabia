"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect,useState,type FormEvent } from "react";
import {
  caseStatus,officeCase,officeCaseInput,threadDetail,threadSummary,type Locale,type ThreadReferenceView,type ThreadSummary,
} from "@madrasty/contracts";
import { ApiResponseError } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { dictionary } from "@/i18n";
import { AcademicPageItems,useAcademicPage } from "@/features/academics/shared";
import { TimetableRead,timetableError,useTimetableRead } from "@/features/school/timetable/shared";
import { Conversation } from "./Conversation";
import { readInboxContext, writeInboxContext, withInboxThread, type InboxContext } from "./inbox-context";

const copy={
  ar:{heading:"المحادثات",directory:"رسالة جديدة",all:"الكل",direct:"المحادثات الخاصة",office:"المكاتب",student_affairs:"شؤون الطلبة",accounts:"الحسابات",
    back:"رجوع للمحادثات",open:"مفتوحة",in_progress:"قيد المتابعة",closed:"مغلقة",status:"حالة الطلب",caseTitle:"متابعة الطلب",
    assignee:"الموظف المسؤول",unassigned:"بدون مسؤول",save:"حفظ",saved:"اتحدث الطلب.",references:"السجلات المرتبطة",
    homework:"واجب",attendance:"الحضور",invoice:"فاتورة",refresh:"تحديث",search:"ابحث في الرسائل",find:"بحث",archived:"المؤرشفة",unread:"رسائل غير مقروءة"},
  de:{heading:"Unterhaltungen",directory:"Neue Nachricht",all:"Alle",direct:"Private Unterhaltungen",office:"Schulbüros",student_affairs:"Schulbüro",accounts:"Buchhaltung",
    back:"Zurück zu den Unterhaltungen",open:"Offen",in_progress:"In Bearbeitung",closed:"Geschlossen",status:"Vorgangsstatus",caseTitle:"Vorgang bearbeiten",
    assignee:"Zuständige Person",unassigned:"Nicht zugewiesen",save:"Speichern",saved:"Vorgang aktualisiert.",references:"Verknüpfte Einträge",
    homework:"Hausaufgabe",attendance:"Anwesenheit",invoice:"Rechnung",refresh:"Aktualisieren",search:"Nachrichten durchsuchen",find:"Suchen",archived:"Archiviert",unread:"Ungelesene Nachrichten"},
} as const;
const options=threadSummary.array();
const filters=["all","unread"] as const;
function title(locale:Locale,item:ThreadSummary){
  return item.contactName??(item.inbox?copy[locale][item.inbox]:copy[locale].direct);
}

export function ThreadInbox({locale,thread}:{locale:Locale;thread?:string}){
  const text=copy[locale];
  const routeParams=useSearchParams();
  const {filter:selected,search:term,archived}=readInboxContext(routeParams,filters);
  const [version,setVersion]=useState(0);
  const [search,setSearch]=useState(term);
  useEffect(()=>setSearch(term),[term]);
  const reload=()=>setVersion((n)=>n+1);
  useEffect(()=>{
    const focus=()=>setVersion((n)=>n+1);
    window.addEventListener("focus",focus);
    window.addEventListener("online",focus);
    return ()=>{window.removeEventListener("focus",focus);window.removeEventListener("online",focus);};
  },[]);
  const query=selected==="unread"?"&unread=true":"";
  const list=useAcademicPage(thread?null:`/threads?limit=30&includeEmpty=false${query}&archived=${archived}${term?`&q=${encodeURIComponent(term)}`:""}`,options,version);
  const detail=useTimetableRead(thread?`/threads/${thread}`:null,threadDetail,version);
  const root=`/${locale}/school/messages`;
  const backParams=withInboxThread(routeParams).toString();
  const backHref=backParams?`${root}?${backParams}`:root;
  const patch=(changes:Partial<InboxContext>)=>{
    const url=new URL(window.location.href);
    url.search=writeInboxContext(url.searchParams,changes).toString();
    window.history.replaceState(null,"",url);
  };
  if(thread)return <>
    <Link className="plain-button" href={backHref}>{text.back}</Link>
    <TimetableRead locale={locale} result={detail}>{(value)=><section className="auth-card auth-form">
      <h2><bdi>{title(locale,value)}</bdi></h2>
      {value.inbox&&value.contactName&&<p>{text[value.inbox]}</p>}
      {(value.caseStatus||value.references.length>0||value.canManageCase)&&<details className="comms-legacy-details"><summary>{text.references}</summary>
      {value.caseStatus&&<p>{text.status} · {text[value.caseStatus]}</p>}
      {value.references.length>0&&<ul className="group-list" aria-label={text.references}>{value.references.map((reference)=><li key={`${reference.kind}/${reference.id}`}>
        <ReferenceLink locale={locale} reference={reference}/>
      </li>)}</ul>}
      {value.canManageCase&&value.caseId&&<CaseEditor key={value.caseId} locale={locale} id={value.caseId} version={version} changed={reload}/>}
      </details>}
      <Conversation key={value.id} locale={locale} thread={value} changed={reload}/>
      <button type="button" className="plain-button" onClick={reload}>{text.refresh}</button>
    </section>}</TimetableRead>
  </>;
  return <section className="auth-card auth-form inbox-panel">
    <div className="comms-inbox-heading"><h2>{locale==="ar"?"المحادثات":"Chats"}</h2><Link className="primary-button" href={`/${locale}/directory`}>{text.directory}</Link></div>
    <form className="auth-form inbox-search" role="search" onSubmit={(event)=>{event.preventDefault();patch({search});}}>
      <label>{text.search}<input type="search" value={search} maxLength={120} onChange={(event)=>setSearch(event.target.value)}/></label>
      <button className="plain-button" type="submit">{text.find}</button>
    </form>
    <div className="inbox-filter-strip" role="group" aria-label={locale==="ar"?"تصفية المحادثات":"Unterhaltungen filtern"}>
      {filters.map(filter=><button className="plain-button" type="button" key={filter} aria-pressed={!archived&&selected===filter} onClick={()=>patch({filter,archived:false})}>{filter==="unread"?(locale==="ar"?"غير مقروءة":"Ungelesen"):text.all}</button>)}
      <button className="plain-button" type="button" aria-pressed={archived} onClick={()=>patch({archived:!archived,filter:"all"})}>{text.archived}</button>
    </div>
    <AcademicPageItems locale={locale} page={list} emptyMessage={term ? undefined : archived ? (locale==="ar"?"مفيش محادثات في الأرشيف.":"Keine archivierten Unterhaltungen.") : (locale==="ar"?"مفيش محادثات هنا. افتح دليل التواصل لبدء محادثة.":"Keine Unterhaltungen hier. Öffnen Sie das Kontaktverzeichnis, um eine zu beginnen.")}>{(rows)=><ul className="group-list">{rows.map((item)=><li key={item.id}>
      <Link className="comms-person-row comms-thread-row" href={`${root}?${withInboxThread(routeParams,item.id).toString()}`}>
        <span className="comms-avatar" aria-hidden="true">{title(locale,item).trim().slice(0,1).toUpperCase()}</span>
        <span className="comms-thread-copy"><strong><bdi>{title(locale,item)}</bdi></strong><small dir="auto">{item.latestPreview??(locale==="ar"?"محادثة":"Unterhaltung")}</small></span>
        <span className="comms-thread-meta"><small>{new Date(item.activityAt).toLocaleDateString(locale==="ar"?"ar":"de-DE",{day:"numeric",month:"short"})}</small>{item.unread>0&&<span className="notice-count" aria-label={text.unread}>{new Intl.NumberFormat(locale).format(item.unread)}</span>}</span>
      </Link>
    </li>)}</ul>}</AcademicPageItems>
  </section>;
}

function ReferenceLink({locale,reference}:{locale:Locale;reference:ThreadReferenceView}){
  const text=copy[locale],base=`/${locale}/school`;
  if(reference.kind==="homework")return <Link className="plain-button"
    href={`${base}/more/homework?work=${reference.id}${reference.childId?`&child=${reference.childId}`:""}`}>{text.homework}</Link>;
  if(reference.kind==="attendance")return <Link className="plain-button"
    href={reference.childId?`${base}/children/${reference.childId}/attendance`:`${base}/more/attendance/history?row=${reference.id}`}>{text.attendance}</Link>;
  return <Link className="plain-button" href={`${base}/more/invoices?invoice=${reference.id}`}>{text.invoice}</Link>;
}

function CaseEditor({locale,id,version,changed}:{locale:Locale;id:string;version:number;changed:()=>void}){
  const record=useTimetableRead(`/office-cases/${id}`,officeCase,version);
  return <TimetableRead locale={locale} result={record}>{(view)=>view.canManage&&
    <CaseFields key={view.revision} locale={locale} view={view} changed={changed}/>}</TimetableRead>;
}
function CaseFields({locale,view,changed}:{locale:Locale;view:ReturnType<typeof officeCase.parse>;changed:()=>void}){
  const text=copy[locale],command=useSchoolCommand("admin");
  const [status,setStatus]=useState(view.status),[assignee,setAssignee]=useState(view.assigneeId??"");
  const [pending,setPending]=useState(false),[notice,setNotice]=useState("");
  async function save(event:FormEvent){
    event.preventDefault();
    const parsed=officeCaseInput.safeParse({revision:view.revision,status,assigneeId:assignee||null});
    if(!parsed.success){setNotice(dictionary(locale)["error.validation"]);return;}
    setPending(true);setNotice("");
    try{
      await command(`/office-cases/${view.id}`,"PATCH",parsed.data,officeCase);
      changed();
    }catch(error){
      setNotice(timetableError(locale,error));
      if(error instanceof ApiResponseError&&[401,403,404,409].includes(error.status))changed();
    }finally{setPending(false);}
  }
  return <form className="auth-form" onSubmit={save}>
    <h3>{text.caseTitle}</h3>
    <label>{text.status}<select value={status} onChange={(event)=>setStatus(caseStatus.parse(event.target.value))}>
      {caseStatus.options.map((value)=><option value={value} key={value}>{text[value]}</option>)}
    </select></label>
    <label>{text.assignee}<select value={assignee} onChange={(event)=>setAssignee(event.target.value)}>
      <option value="">{text.unassigned}</option>{view.delegates.map((person)=><option value={person.accountId} key={person.accountId}>{person.displayName}</option>)}
    </select></label>
    {notice&&<p role="alert">{notice}</p>}
    <button type="submit" className="primary-button" disabled={pending||status===view.status&&assignee===(view.assigneeId??"")}>{text.save}</button>
  </form>;
}
