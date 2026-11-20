"use client";

import Link from "next/link";
import { useEffect,useState,type FormEvent } from "react";
import {
  caseStatus,inboxSchema,officeCase,officeCaseInput,threadDetail,threadSummary,type Locale,type ThreadReferenceView,type ThreadSummary,
} from "@madrasty/contracts";
import { ApiResponseError } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { dictionary } from "@/i18n";
import { AcademicPageItems,useAcademicPage } from "@/features/academics/shared";
import { TimetableRead,timetableError,useTimetableRead } from "@/features/school/timetable/shared";

const copy={
  ar:{heading:"المحادثات",directory:"دليل التواصل",all:"الكل",direct:"المحادثات الخاصة",office:"المكاتب",student_affairs:"شؤون الطلبة",accounts:"الحسابات",
    back:"رجوع للمحادثات",open:"مفتوحة",in_progress:"قيد المتابعة",closed:"مغلقة",status:"حالة الطلب",caseTitle:"متابعة الطلب",
    assignee:"الموظف المسؤول",unassigned:"بدون مسؤول",save:"حفظ",saved:"اتحدث الطلب.",references:"السجلات المرتبطة",
    homework:"واجب",attendance:"الحضور",invoice:"فاتورة",refresh:"تحديث"},
  de:{heading:"Unterhaltungen",directory:"Kontaktverzeichnis",all:"Alle",direct:"Private Unterhaltungen",office:"Schulbüros",student_affairs:"Schulbüro",accounts:"Buchhaltung",
    back:"Zurück zu den Unterhaltungen",open:"Offen",in_progress:"In Bearbeitung",closed:"Geschlossen",status:"Vorgangsstatus",caseTitle:"Vorgang bearbeiten",
    assignee:"Zuständige Person",unassigned:"Nicht zugewiesen",save:"Speichern",saved:"Vorgang aktualisiert.",references:"Verknüpfte Einträge",
    homework:"Hausaufgabe",attendance:"Anwesenheit",invoice:"Rechnung",refresh:"Aktualisieren"},
} as const;
const options=threadSummary.array();
const filters=["all","direct","office",...inboxSchema.options] as const;
type Filter=typeof filters[number];
function title(locale:Locale,item:ThreadSummary){
  return item.contactName??(item.inbox?copy[locale][item.inbox]:copy[locale].direct);
}

export function ThreadInbox({locale,thread}:{locale:Locale;thread?:string}){
  const text=copy[locale];
  const [selected,setSelected]=useState<Filter>("all");
  const [version,setVersion]=useState(0);
  const reload=()=>setVersion((n)=>n+1);
  useEffect(()=>{
    const focus=()=>setVersion((n)=>n+1);
    window.addEventListener("focus",focus);
    return ()=>window.removeEventListener("focus",focus);
  },[]);
  const query=selected==="all"?"":selected==="direct"||selected==="office"?`&kind=${selected}`:`&inbox=${selected}`;
  const list=useAcademicPage(thread?null:`/threads?limit=30${query}`,options,version);
  const detail=useTimetableRead(thread?`/threads/${thread}`:null,threadDetail,version);
  const root=`/${locale}/school/messages`;
  if(thread)return <>
    <Link className="plain-button" href={root}>{text.back}</Link>
    <TimetableRead locale={locale} result={detail}>{(value)=><section className="auth-card auth-form">
      <h2><bdi>{title(locale,value)}</bdi></h2>
      {value.inbox&&value.contactName&&<p>{text[value.inbox]}</p>}
      {value.caseStatus&&<p>{text.status} · {text[value.caseStatus]}</p>}
      {value.references.length>0&&<ul className="group-list" aria-label={text.references}>{value.references.map((reference)=><li key={`${reference.kind}/${reference.id}`}>
        <ReferenceLink locale={locale} reference={reference}/>
      </li>)}</ul>}
      {value.canManageCase&&value.caseId&&<CaseEditor key={value.caseId} locale={locale} id={value.caseId} version={version} changed={reload}/>}
      <button type="button" className="plain-button" onClick={reload}>{text.refresh}</button>
    </section>}</TimetableRead>
  </>;
  return <section className="auth-card auth-form">
    <Link className="plain-button" href={`/${locale}/directory`}>{text.directory}</Link>
    <div className="header-actions">{filters.map((filter)=><button className="plain-button" type="button" key={filter}
      aria-pressed={selected===filter} onClick={()=>setSelected(filter)}>{text[filter]}</button>)}</div>
    <AcademicPageItems locale={locale} page={list}>{(rows)=><ul className="group-list">{rows.map((item)=><li key={item.id}>
      <Link className="group-row" href={`${root}?thread=${item.id}`}>
        <bdi>{title(locale,item)}</bdi>{item.inbox&&item.contactName&&<span>{text[item.inbox]}</span>}
        {item.caseStatus&&<span>{text[item.caseStatus]}</span>}
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
  return <span>{text[reference.kind]}</span>;
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
