"use client";

import Link from "next/link";
import { useEffect,useState,type FormEvent } from "react";
import {
  childSummarySchema,curriculumLesson,curriculumOffering,curriculumSubject,homeworkChange,homeworkCreate,homeworkEntry,
  type CurriculumLesson,type HomeworkEntry,type Locale,
} from "@madrasty/contracts";
import { HomeworkConversation } from "@/features/comms/StartConversation";
import { useSchoolCommand } from "@/api/commands";
import { dictionary } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { TimetableRead,timetableError,useTimetableRead } from "@/features/school/timetable/shared";
import { AcademicPageItems,offeringText,useAcademicPage } from "./shared";

const copy={
  ar:{title:"الواجبات",child:"الطفل",offering:"المادة والفصل والسنة",newWork:"إضافة واجب",edit:"تعديل الواجب",
    titleLabel:"عنوان الواجب",instructions:"التعليمات",issue:"تاريخ التكليف",due:"موعد التسليم",reference:"الدرس المرتبط",
    noLesson:"بدون درس مرتبط",back:"رجوع للواجبات",save:"حفظ الواجب",cancel:"إلغاء",saved:"اتحفظ الواجب.",
    enrolled:"تاريخ الانضمام للفصل",addedLater:"اتضاف الواجب بعد انضمام الطالب للفصل",
    score:"الدرجة من ٢٠",pending:"الدرجة لسه ما اتسجلتش",feedback:"ملاحظات التصحيح",roster:"عدد الطلاب في الكشف",
    openLesson:"عرض الدرس",refresh:"تحديث",more:"عرض المزيد"},
  de:{title:"Hausaufgaben",child:"Kind",offering:"Fach, Klasse und Schuljahr",newWork:"Hausaufgabe anlegen",edit:"Hausaufgabe bearbeiten",
    titleLabel:"Titel der Hausaufgabe",instructions:"Aufgabenstellung",issue:"Aufgegeben am",due:"Fällig am",reference:"Zugeordnete Unterrichtsstunde",
    noLesson:"Ohne zugeordnete Stunde",back:"Zurück zu den Hausaufgaben",save:"Hausaufgabe speichern",cancel:"Abbrechen",saved:"Hausaufgabe gespeichert.",
    enrolled:"Eintritt in die Klasse",addedLater:"Die Hausaufgabe wurde nach dem Klasseneintritt zugewiesen",
    score:"Punkte von 20",pending:"Noch keine Note erfasst",feedback:"Rückmeldung",roster:"Schülerinnen und Schüler auf der Liste",
    openLesson:"Unterrichtsstunde ansehen",refresh:"Aktualisieren",more:"Weitere anzeigen"},
} as const;
const children=childSummarySchema.array(),offerings=curriculumOffering.array(),subjectOptions=curriculumSubject.array();
const work=homeworkEntry.array(),lessonOptions=curriculumLesson.array();

export function Homework({locale,initialChild,initialWork}:{locale:Locale;initialChild?:string;initialWork?:string}){
  const {persona}=useAccountScope(),text=copy[locale];
  const [child,setChild]=useState(initialChild);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const reload=()=>setRevision((n)=>n+1);
    addEventListener("focus",reload);
    return ()=>removeEventListener("focus",reload);
  },[]);
  const linked=useTimetableRead(persona==="guardian"?"/me/children?limit=100":null,children,revision);
  const active=linked.value?.data?.find((entry)=>entry.id===child)??(!child?linked.value?.data?.[0]:undefined);
  return <>
    <h1>{text.title}</h1>
    {persona==="guardian"?<>
      <TimetableRead locale={locale} result={linked}>{(items)=>items.length?<label className="auth-card">{text.child}
        <select value={active?.id??""} onChange={(event)=>setChild(event.target.value)}>
          {!active&&<option value="">{dictionary(locale).choose}</option>}
          {items.map((entry)=><option key={entry.id} value={entry.id}>{entry.displayName}</option>)}
        </select>
      </label>:<AsyncSurface locale={locale} state={{kind:"empty",message:locale==="ar"?"لا يوجد أطفال مرتبطون بحسابك حاليًا.":"Mit Ihrem Konto sind derzeit keine Kinder verknüpft."}}/>}</TimetableRead>
      {active?<WorkList key={active.id} locale={locale} child={active.id} revision={revision}
        initial={child===initialChild?initialWork:undefined}/>:child&&linked.value?.data&&<AsyncSurface locale={locale} state={{kind:"forbidden"}}/>}
    </>:<StaffHomework locale={locale} revision={revision} initial={initialWork}/>}
  </>;
}

function StaffHomework({locale,revision,initial}:{locale:Locale;revision:number;initial?:string}){
  const text=copy[locale];
  const [selected,setSelected]=useState("");
  const available=useTimetableRead("/academics/offerings",offerings,revision);
  const subjects=useTimetableRead("/academics/subjects?limit=100",subjectOptions,revision);
  const scoped=available.value?.data?.filter((entry)=>entry.canPlan||entry.canGrade)??[];
  const active=scoped.find((entry)=>entry.id===selected)??scoped[0];
  return <>
    <TimetableRead locale={locale} result={available}>{()=>scoped.length?<label className="auth-card">{text.offering}
      <select value={active?.id??""} onChange={(event)=>setSelected(event.target.value)}>
        {scoped.map((item)=>{
          const entry=subjects.value?.data?.find((subject)=>subject.id===item.subjectId);
          const name=entry?(locale==="ar"?entry.nameAr:entry.nameDe):"";
          return <option key={item.id} value={item.id}>{[name,offeringText(item,locale)].filter(Boolean).join(" · ")}</option>;
        })}
      </select>
    </label>:<AsyncSurface locale={locale} state={{kind:"empty",message:locale==="ar"?"لا توجد فصول مسندة إليك للواجبات حاليًا.":"Für Sie sind derzeit keine Klassen für Hausaufgaben verfügbar."}}/>}</TimetableRead>
    {(active||initial)&&<WorkList key={active?.id??"detail"} locale={locale} offering={active?.id} canPlan={active?.canPlan}
      initial={selected?undefined:initial} revision={revision}/>}
  </>;
}

function WorkList({locale,revision,initial,child,offering,canPlan}:{
  locale:Locale;revision:number;initial?:string;child?:string;offering?:string;canPlan?:boolean;
}){
  const text=copy[locale];
  const [id,setId]=useState(initial),[create,setCreate]=useState(false);
  const [changes,setChanges]=useState(0),[notice,setNotice]=useState("");
  const section=child?`&childId=${child}`:offering?`&offeringId=${offering}`:"";
  const detail=useTimetableRead(id?`/academics/homework/${id}${child?`?childId=${child}`:""}`:null,homeworkEntry,revision+changes);
  const page=useAcademicPage(`/academics/homework?limit=25${section}`,work,revision+changes);
  const saved=(key:string)=>{setChanges((n)=>n+1);setId(key);setCreate(false);setNotice(text.saved);};
  return <section className="auth-card auth-form">
    {notice&&<p role="status">{notice}</p>}
    {id?<>
      <button className="plain-button" onClick={()=>{setId(undefined);setNotice("");}}>{text.back}</button>
      <TimetableRead locale={locale} result={detail}>{(value)=><HomeworkDetails key={value.id} locale={locale} value={value} child={child}
        saved={saved} refresh={()=>setChanges((n)=>n+1)}/>}</TimetableRead>
    </>:<>
      {offering&&canPlan&&<button className="plain-button" onClick={()=>setCreate(true)}>{text.newWork}</button>}
      {offering&&canPlan&&create&&<HomeworkForm locale={locale} offering={offering}
        saved={saved} cancel={()=>setCreate(false)}/>}
      <AcademicPageItems locale={locale} page={page} emptyMessage={child
        ? (locale==="ar"?"لا توجد واجبات مسجلة لهذا الطفل حاليًا.":"Für dieses Kind sind derzeit keine Hausaufgaben eingetragen.")
        : (locale==="ar"?"لم يتم تسجيل واجبات لهذا الفصل حتى الآن.":"Für diese Klasse sind noch keine Hausaufgaben eingetragen.")}>{(items)=><ul className="group-list">{items.map((item)=><li key={item.id}>
        <button className="group-row" onClick={()=>{setId(item.id);setNotice("");}}>
          <bdi>{item.title}</bdi><bdi>{locale==="ar"?item.subjectNameAr:item.subjectNameDe}</bdi><bdi dir="ltr">{item.dueOn}</bdi>
        </button>
      </li>)}</ul>}</AcademicPageItems>
    </>}
  </section>;
}

function HomeworkDetails({locale,value,child,saved,refresh}:{
  locale:Locale;value:HomeworkEntry;child?:string;saved:(key:string)=>void;refresh:()=>void;
}) {
  const text=copy[locale],number=new Intl.NumberFormat(locale,{maximumFractionDigits:1});
  const [edit,setEdit]=useState(false);
  return <>
    <h2 dir="auto">{value.title}</h2>
    <p><bdi>{locale==="ar"?value.subjectNameAr:value.subjectNameDe}</bdi> · <bdi>{value.classCode}</bdi> ·
      <bdi>{locale==="ar"?value.classNameAr:value.classNameDe}</bdi> · <bdi dir="ltr">{value.yearStart} – {value.yearEnd}</bdi></p>
    <p>{text.issue} · <bdi dir="ltr">{value.issuedOn}</bdi></p>
    <p>{text.due} · <bdi dir="ltr">{value.dueOn}</bdi></p>
    <h3>{text.instructions}</h3>
    <p dir="auto" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{value.instructions}</p>
    {value.lessonId&&<Link className="plain-button" href={`/${locale}/school/more/curriculum?lesson=${value.lessonId}${child?`&child=${child}`:""}`}>{text.openLesson}</Link>}
    {child?<>
      <HomeworkConversation locale={locale} homework={value.id}/>
      {value.joinedOn&&<p>{text.enrolled} · <bdi dir="ltr">{value.joinedOn}</bdi></p>}
      {value.addedLater&&<p>{text.addedLater}</p>}
      <p>{value.score===null?text.pending:<>{text.score} · <bdi>{number.format(value.score)}</bdi></>}</p>
      {value.feedback&&<><h3>{text.feedback}</h3><p dir="auto" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{value.feedback}</p></>}
    </>:value.rosterCount!==null&&<p>{text.roster} · <bdi>{number.format(value.rosterCount)}</bdi></p>}
    {value.canGrade&&<Link className="plain-button" href={`/${locale}/school/more/grading?work=${value.id}`}>{locale==="ar"?"كشف التصحيح":"Bewertungsliste"}</Link>}
    {value.canEdit&&!edit&&<button className="plain-button" onClick={()=>setEdit(true)}>{text.edit}</button>}
    {value.canEdit&&edit&&<HomeworkForm locale={locale} offering={value.offeringId} item={value}
      cancel={()=>setEdit(false)} saved={(key)=>{setEdit(false);saved(key);}}/>}
    <button className="plain-button" onClick={refresh}>{text.refresh}</button>
  </>;
}

function lessonLabel(item:CurriculumLesson,locale:Locale){
  return locale==="ar"?(item.titleAr||item.titleDe):(item.titleDe||item.titleAr);
}
function HomeworkForm({locale,offering,item,saved,cancel}:{
  locale:Locale;offering:string;item?:HomeworkEntry;saved:(id:string)=>void;cancel:()=>void;
}){
  const text=copy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [base]=useState(item?.revision);
  const [draft,setDraft]=useState({
    title:item?.title??"",instructions:item?.instructions??"",issuedOn:item?.issuedOn??"",dueOn:item?.dueOn??"",lessonId:item?.lessonId??"",
  });
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const links=useAcademicPage(`/academics/lessons?offeringId=${offering}&limit=30`,lessonOptions,0);
  const options=links.visible?.items??[];
  async function save(event:FormEvent){
    event.preventDefault();
    const body={...draft,lessonId:draft.lessonId||null};
    const input=item?homeworkChange.safeParse({...body,revision:base}):homeworkCreate.safeParse({...body,offeringId:offering});
    if(!input.success){setNotice(dictionary(locale)["error.validation"]);return;}
    setBusy(true);setNotice("");
    try{
      const value=await command(item?`/academics/homework/${item.id}`:"/academics/homework",item?"PATCH":"POST",input.data,homeworkEntry);
      saved(value.id);
    }catch(error){setNotice(timetableError(locale,error));}
    finally{setBusy(false);}
  }
  return <form className="auth-form" onSubmit={save}>
    <label>{text.titleLabel}<input required value={draft.title} maxLength={200} dir="auto"
      onChange={(event)=>setDraft({...draft,title:event.target.value})}/></label>
    <label>{text.instructions}<textarea required value={draft.instructions} maxLength={12000} rows={5} dir="auto"
      onChange={(event)=>setDraft({...draft,instructions:event.target.value})}/></label>
    <label>{text.issue}<input type="date" required value={draft.issuedOn} onChange={(event)=>setDraft({...draft,issuedOn:event.target.value})}/></label>
    <label>{text.due}<input type="date" required min={draft.issuedOn||undefined} value={draft.dueOn}
      onChange={(event)=>setDraft({...draft,dueOn:event.target.value})}/></label>
    <label>{text.reference}<select value={draft.lessonId} onChange={(event)=>setDraft({...draft,lessonId:event.target.value})}>
      <option value="">{text.noLesson}</option>
      {draft.lessonId&&!options.some((value)=>value.id===draft.lessonId)&&<option value={draft.lessonId}>{text.reference}</option>}
      {options.map((value)=><option key={value.id} value={value.id}>{lessonLabel(value,locale)}</option>)}
    </select></label>
    {links.visible?.cursor&&<button type="button" className="plain-button" onClick={()=>void links.more()} disabled={links.busy}>{text.more}</button>}
    {notice&&<p role="alert">{notice}</p>}
    <div className="header-actions">
      <button className="primary-button" type="submit" disabled={busy}>{text.save}</button>
      <button className="plain-button" type="button" disabled={busy} onClick={cancel}>{text.cancel}</button>
    </div>
  </form>;
}
