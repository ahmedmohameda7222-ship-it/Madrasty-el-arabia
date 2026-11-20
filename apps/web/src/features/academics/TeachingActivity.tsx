"use client";

import { useEffect,useState,type FormEvent } from "react";
import {
  activityCreate,activityEntry,activityHistoryRow,activityMarkInput,activityMarkReceipt,activityRosterRow,
  childSummarySchema,curriculumLesson,curriculumOffering,curriculumSubject,lessonReceipt,schoolDateSchema,
  teachingAssignmentChoice,teachingEntry,teachingLogChange,teachingLogCreate,
  type ActivityEntry,type ActivityRosterRow,type Locale,type TeachingEntry,
} from "@madrasty/contracts";
import { useSchoolCommand } from "@/api/commands";
import { dictionary } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { TimetableRead,timetableError,useTimetableRead } from "@/features/school/timetable/shared";
import { AcademicPageItems,offeringText,useAcademicPage } from "./shared";

const copy={
  ar:{title:"الشرح والأنشطة",teaching:"سجل الشرح",activity:"الأنشطة والتقييم",child:"الطفل",context:"المادة والفصل والسنة",
    newLog:"تسجيل شرح",addActivity:"إضافة نشاط",date:"التاريخ الفعلي",notes:"محتوى الشرح الفعلي",teacher:"تكليف المدرس",
    plan:"خطة الدرس",planDate:"التاريخ المخطّط",planned:"الخطة الحالية",published:"النسخة المنشورة",none:"بدون درس مرتبط",
    edit:"تعديل",save:"حفظ",cancel:"إلغاء",back:"رجوع",name:"اسم النشاط",maximum:"الدرجة القصوى",score:"الدرجة",
    pending:"الدرجة غير مسجلة",correction:"سبب تصحيح الدرجة المعروضة للأسرة",history:"التصحيحات السابقة",
    more:"عرض المزيد",saved:"اتحفظت التغييرات.",token:"اختر التكليف المناسب",refresh:"تحديث",classRoster:"كشف درجات النشاط"},
  de:{title:"Unterricht und Aktivitäten",teaching:"Unterrichtsdokumentation",activity:"Bewertete Aktivitäten",child:"Kind",context:"Fach, Klasse und Schuljahr",
    newLog:"Unterricht dokumentieren",addActivity:"Aktivität anlegen",date:"Tatsächliches Datum",notes:"Tatsächlich unterrichteter Inhalt",teacher:"Lehrauftrag",
    plan:"Unterrichtsplan",planDate:"Geplanter Termin",planned:"Aktueller Plan",published:"Veröffentlichte Fassung",none:"Ohne zugeordnete Stunde",
    edit:"Bearbeiten",save:"Speichern",cancel:"Abbrechen",back:"Zurück",name:"Name der Aktivität",maximum:"Höchstpunktzahl",score:"Punkte",
    pending:"Noch keine Punktzahl erfasst",correction:"Begründung zur Korrektur der veröffentlichten Punktzahl",history:"Bisherige Korrekturen",
    more:"Weitere anzeigen",saved:"Änderungen gespeichert.",token:"Lehrauftrag auswählen",refresh:"Aktualisieren",classRoster:"Punkteliste der Klasse"},
} as const;
const children=childSummarySchema.array(),offeringOptions=curriculumOffering.array(),subjectOptions=curriculumSubject.array();
const logs=teachingEntry.array(),activities=activityEntry.array(),roster=activityRosterRow.array();
const assignments=teachingAssignmentChoice.array(),lessonOptions=curriculumLesson.array(),corrections=activityHistoryRow.array();

export function TeachingActivity({locale,initialChild,initialActivity}:{locale:Locale;initialChild?:string;initialActivity?:string}){
  const {persona}=useAccountScope(),guardian=persona==="guardian",text=copy[locale];
  const [child,setChild]=useState(initialChild);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    const reload=()=>setRefresh((n)=>n+1);
    window.addEventListener("focus",reload);
    return ()=>window.removeEventListener("focus",reload);
  },[]);
  const childRead=useTimetableRead(guardian?"/me/children?limit=100":null,children,refresh);
  const linked=childRead.value?.data?.find((item)=>item.id===child)??(!child?childRead.value?.data?.[0]:undefined);
  return <>
    <h1>{guardian?text.activity:text.title}</h1>
    {guardian?<><TimetableRead locale={locale} result={childRead}>{(options)=>options.length?<label>{text.child}
      <select value={linked?.id??""} onChange={(event)=>setChild(event.target.value)}>
        {!linked&&<option value="">{dictionary(locale).choose}</option>}
        {options.map((option)=><option key={option.id} value={option.id}>{option.displayName}</option>)}
      </select>
    </label>:<AsyncSurface locale={locale} state={{kind:"empty"}}/>}</TimetableRead>
      {linked?<ActivitiesPanel key={linked.id} locale={locale} refresh={refresh} child={linked.id}
        initial={child===initialChild?initialActivity:undefined}/>:child&&childRead.value?.data&&<AsyncSurface locale={locale} state={{kind:"forbidden"}}/>}
    </>:<StaffWork locale={locale} refresh={refresh} initialActivity={initialActivity}/>}
  </>;
}

function StaffWork({locale,refresh,initialActivity}:{locale:Locale;refresh:number;initialActivity?:string}){
  const text=copy[locale];
  const options=useTimetableRead("/academics/offerings",offeringOptions,refresh);
  const subjects=useTimetableRead("/academics/subjects?limit=100",subjectOptions,refresh);
  const [type,setType]=useState<"teaching"|"activity">(initialActivity?"activity":"teaching");
  const [offering,setOffering]=useState("");
  const usable=options.value?.data?.filter((item)=>type==="teaching"?item.canLog:item.canGrade)??[];
  const selected=usable.find((item)=>item.id===offering)??usable[0];
  return <>
    <div className="header-actions">
      <button className="plain-button" aria-pressed={type==="teaching"} onClick={()=>setType("teaching")}>{text.teaching}</button>
      <button className="plain-button" aria-pressed={type==="activity"} onClick={()=>setType("activity")}>{text.activity}</button>
    </div>
    <TimetableRead result={options} locale={locale}>{()=>usable.length?<label className="auth-card">{text.context}
      <select value={selected?.id??""} onChange={(event)=>setOffering(event.target.value)}>
        {usable.map((option)=>{
          const subject=subjects.value?.data?.find((item)=>item.id===option.subjectId);
          const name=subject?(locale==="ar"?subject.nameAr:subject.nameDe):"";
          return <option key={option.id} value={option.id}>{[name,offeringText(option,locale)].filter(Boolean).join(" · ")}</option>;
        })}
      </select>
    </label>:<AsyncSurface locale={locale} state={{kind:"empty"}}/>}</TimetableRead>
    {type==="teaching"&&selected&&<TeachingPanel key={selected.id} locale={locale} offering={selected.id} refresh={refresh}/>}
    {type==="activity"&&(selected||initialActivity)&&<ActivitiesPanel key={selected?.id??"detail"} locale={locale} offering={selected?.id}
      refresh={refresh} initial={initialActivity}/>}
  </>;
}

function TeachingPanel({locale,offering,refresh}:{locale:Locale;offering:string;refresh:number}){
  const text=copy[locale];
  const [changed,setChanged]=useState(0);
  const [editing,setEditing]=useState<TeachingEntry|"new">();
  const list=useAcademicPage(`/academics/teaching-log?offeringId=${offering}&limit=25`,logs,refresh+changed);
  return <section className="auth-card auth-form">
    <h2>{text.teaching}</h2>
    <button className="plain-button" onClick={()=>setEditing("new")}>{text.newLog}</button>
    {editing&&<TeachingForm key={editing==="new"?"new":editing.id} locale={locale} offering={offering}
      item={editing==="new"?undefined:editing} cancel={()=>setEditing(undefined)} saved={()=>{setEditing(undefined);setChanged((n)=>n+1);}}/>}
    <AcademicPageItems locale={locale} page={list}>{(rows)=><ul className="group-list">{rows.map((entry)=><li key={entry.id} className="timetable-day">
      <strong>{text.date} · <bdi dir="ltr">{entry.actualDate}</bdi></strong>
      {entry.recordedByName&&<p><bdi>{entry.recordedByName}</bdi></p>}
      {(entry.planTitleAr||entry.planTitleDe)&&<p>{text.plan} · <bdi>{locale==="ar"?(entry.planTitleAr||entry.planTitleDe):(entry.planTitleDe||entry.planTitleAr)}</bdi></p>}
      {entry.plannedDate&&<p>{text.planDate} · <bdi dir="ltr">{entry.plannedDate}</bdi></p>}
      <p dir="auto" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{entry.deliveredNotes}</p>
      {entry.canEdit&&<button className="plain-button" onClick={()=>setEditing(entry)}>{text.edit}</button>}
    </li>)}</ul>}</AcademicPageItems>
  </section>;
}

function TeachingForm({locale,offering,item,cancel,saved}:{locale:Locale;offering:string;item?:TeachingEntry;cancel:()=>void;saved:()=>void}){
  const text=copy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [date,setDate]=useState(item?.actualDate??""),[teacher,setTeacher]=useState(item?.assignmentId??"");
  const [notes,setNotes]=useState(item?.deliveredNotes??""),[lesson,setLesson]=useState(item?.lessonId??"");
  const [version,setVersion]=useState(item?.lessonVersionId??"");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [base]=useState(item?.revision);
  const validDate=schoolDateSchema.safeParse(date).success;
  const choices=useTimetableRead(validDate?`/academics/teaching-log/assignments?offeringId=${offering}&date=${date}`:null,assignments);
  const list=useAcademicPage(`/academics/lessons?offeringId=${offering}&limit=30`,lessonOptions,0);
  const plans=list.visible?.items??[],currentPlan=plans.find((plan)=>plan.id===lesson);
  async function submit(event:FormEvent){
    event.preventDefault();
    const options=choices.value?.data??[];
    const assignmentId=options.find((option)=>option.id===teacher)?.id??(options.length===1?options[0].id:null);
    if(!assignmentId){setError(text.token);return;}
    const body={assignmentId,lessonId:lesson||null,lessonVersionId:version||null,actualDate:date,deliveredNotes:notes};
    const input=item?teachingLogChange.safeParse({...body,revision:base}):teachingLogCreate.safeParse({...body,offeringId:offering});
    if(!input.success){setError(dictionary(locale)["error.validation"]);return;}
    setBusy(true);setError("");
    try{
      await command(item?`/academics/teaching-log/${item.id}`:"/academics/teaching-log",item?"PATCH":"POST",input.data,lessonReceipt);
      saved();
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  return <form className="auth-form" onSubmit={submit}>
    <label>{text.date}<input type="date" required value={date} onChange={(event)=>{setDate(event.target.value);setTeacher("");}}/></label>
    {validDate&&<TimetableRead locale={locale} result={choices}>{(items)=><label>{text.teacher}
      <select value={items.some((option)=>option.id===teacher)?teacher:(items.length===1?items[0].id:"")} required
        onChange={(event)=>setTeacher(event.target.value)}>
        <option value="">{text.token}</option>{items.map((option)=><option key={option.id} value={option.id}>{option.teacherName}</option>)}
      </select>
    </label>}</TimetableRead>}
    <label>{text.plan}<select value={lesson} onChange={(event)=>{setLesson(event.target.value);setVersion("");}}>
      <option value="">{text.none}</option>
      {lesson&&!currentPlan&&<option value={lesson}>{item?.planTitleAr||item?.planTitleDe||text.plan}</option>}
      {plans.map((plan)=><option value={plan.id} key={plan.id}>{locale==="ar"?(plan.titleAr||plan.titleDe):(plan.titleDe||plan.titleAr)}</option>)}
    </select></label>
    {list.visible?.cursor&&<button type="button" className="plain-button" disabled={list.busy} onClick={()=>void list.more()}>{text.more}</button>}
    {(currentPlan?.publicationId||version)&&<label>{text.plan}<select value={version} onChange={(event)=>setVersion(event.target.value)}>
      <option value="">{text.planned}</option>
      {version&&version!==currentPlan?.publicationId&&<option value={version}>{text.published}</option>}
      {currentPlan?.publicationId&&<option value={currentPlan.publicationId}>{text.published}</option>}
    </select></label>}
    <label>{text.notes}<textarea required maxLength={12000} rows={5} dir="auto" value={notes} onChange={(event)=>setNotes(event.target.value)}/></label>
    {error&&<p role="alert">{error}</p>}
    <button type="submit" className="primary-button" disabled={busy||!validDate}>{text.save}</button>
    <button type="button" className="plain-button" disabled={busy} onClick={cancel}>{text.cancel}</button>
  </form>;
}

function ActivitiesPanel({locale,offering,child,refresh,initial}:{locale:Locale;offering?:string;child?:string;refresh:number;initial?:string}){
  const text=copy[locale];
  const [id,setId]=useState(initial),[creating,setCreating]=useState(false),[updated,setUpdated]=useState(0);
  const query=child?`&childId=${child}`:offering?`&offeringId=${offering}`:"";
  const page=useAcademicPage(`/academics/activities?limit=30${query}`,activities,refresh+updated);
  const selected=useTimetableRead(id?`/academics/activities/${id}${child?`?childId=${child}`:""}`:null,activityEntry,refresh+updated);
  if(id)return <section className="auth-card auth-form">
    <button className="plain-button" onClick={()=>setId(undefined)}>{text.back}</button>
    <TimetableRead locale={locale} result={selected}>{(value)=><>
      <h2 dir="auto">{value.title}</h2>
      <p><bdi>{value.classCode}</bdi> · <bdi>{locale==="ar"?value.subjectNameAr:value.subjectNameDe}</bdi> · <bdi dir="ltr">{value.date}</bdi></p>
      {child?<p>{scoreLabel(locale,value.score,value.maxScore)}</p>:<ActivityRoster locale={locale} activity={value} refresh={refresh}/>}
    </>}</TimetableRead>
  </section>;
  return <section className="auth-card auth-form">
    {offering&&!child&&<button className="plain-button" onClick={()=>setCreating(true)}>{text.addActivity}</button>}
    {offering&&!child&&creating&&<NewActivity locale={locale} offering={offering} cancel={()=>setCreating(false)}
      saved={(key)=>{setId(key);setCreating(false);setUpdated((n)=>n+1);}}/>}
    <AcademicPageItems locale={locale} page={page}>{(items)=><ul className="group-list">{items.map((item)=><li key={item.id}>
      <button type="button" className="group-row" onClick={()=>setId(item.id)}>
        <bdi>{item.title}</bdi><bdi dir="ltr">{item.date}</bdi>{child&&<span>{scoreLabel(locale,item.score,item.maxScore)}</span>}
      </button>
    </li>)}</ul>}</AcademicPageItems>
  </section>;
}

function scoreInput(raw:string){
  const normalized=raw.trim().replace(/[٠-٩]/g,(digit)=>String(digit.charCodeAt(0)-0x660))
    .replace(/[۰-۹]/g,(digit)=>String(digit.charCodeAt(0)-0x6f0)).replace(/[٬]/g,"").replace(/[,٫]/g,".");
  if(!normalized)return null;
  return /^\d+(?:\.\d{1,4})?$/.test(normalized)?Number(normalized):Number.NaN;
}
function scoreLabel(locale:Locale,score:number|null,maximum:number){
  const format=new Intl.NumberFormat(locale,{maximumFractionDigits:4});
  return score===null?copy[locale].pending:`${format.format(score)} / ${format.format(maximum)}`;
}

function NewActivity({locale,offering,cancel,saved}:{locale:Locale;offering:string;cancel:()=>void;saved:(id:string)=>void}){
  const text=copy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [date,setDate]=useState(""),[title,setTitle]=useState(""),[max,setMax]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(event:FormEvent){
    event.preventDefault();
    const input=activityCreate.safeParse({offeringId:offering,date,title,maxScore:scoreInput(max)});
    if(!input.success){setError(dictionary(locale)["error.validation"]);return;}
    setBusy(true);setError("");
    try{const value=await command("/academics/activities","POST",input.data,activityEntry);saved(value.id);}
    catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  return <form className="auth-form" onSubmit={submit}>
    <label>{text.name}<input required maxLength={200} value={title} onChange={(event)=>setTitle(event.target.value)}/></label>
    <label>{text.date}<input type="date" required value={date} onChange={(event)=>setDate(event.target.value)}/></label>
    <label>{text.maximum}<input inputMode="decimal" required value={max} onChange={(event)=>setMax(event.target.value)}/></label>
    {error&&<p role="alert">{error}</p>}
    <button className="primary-button" type="submit" disabled={busy}>{text.save}</button>
    <button className="plain-button" type="button" disabled={busy} onClick={cancel}>{text.cancel}</button>
  </form>;
}

function ActivityRoster({locale,activity,refresh}:{locale:Locale;activity:ActivityEntry;refresh:number}){
  const [updated,setUpdated]=useState(0),text=copy[locale];
  const list=useAcademicPage(`/academics/activities/${activity.id}/marks?limit=30`,roster,refresh+updated);
  return <>
    <h3>{text.classRoster}</h3>
    <button type="button" className="plain-button" onClick={()=>setUpdated((n)=>n+1)}>{text.refresh}</button>
    <AcademicPageItems locale={locale} page={list}>{(rows)=><ul className="group-list">{rows.map((row)=><li key={row.studentId} className="timetable-day">
      <strong><bdi>{row.studentName}</bdi></strong> · <bdi dir="ltr">{row.studentNumber}</bdi>
      <ActivityMark locale={locale} activity={activity} row={row} changed={()=>setUpdated((n)=>n+1)}/>
    </li>)}</ul>}</AcademicPageItems>
  </>;
}

function ActivityMark({locale,activity,row,changed}:{locale:Locale;activity:ActivityEntry;row:ActivityRosterRow;changed:()=>void}){
  const [draft,setDraft]=useState<{score:string;revision:number;original:number|null;visible:boolean;reason:string}>();
  const [showHistory,setShowHistory]=useState(false),[busy,setBusy]=useState(false);
  const [notice,setNotice]=useState<{copy:string;error:boolean}>();
  const text=copy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const path=`/academics/activities/${activity.id}/marks/${row.studentId}` as const;
  const history=useTimetableRead(showHistory?path:null,corrections,row.revision);
  const proposed=draft?scoreInput(draft.score):null;
  async function submit(event:FormEvent){
    event.preventDefault();
    if(!draft)return;
    const input=activityMarkInput.safeParse({revision:draft.revision,score:proposed,reasonIfCorrection:draft.reason.trim()||undefined});
    if(!input.success||(proposed!==null&&proposed>activity.maxScore)||(draft.visible&&proposed!==draft.original&&!input.data.reasonIfCorrection)){
      setNotice({copy:dictionary(locale)["error.validation"],error:true});return;
    }
    setBusy(true);
    try{
      await command(path,"PUT",input.data,activityMarkReceipt);
      setDraft(undefined);setNotice({copy:text.saved,error:false});changed();
    }catch(problem){setNotice({copy:timetableError(locale,problem),error:true});}
    finally{setBusy(false);}
  }
  return <>
    <p>{scoreLabel(locale,row.score,activity.maxScore)}</p>
    {activity.canEdit&&!draft&&<button className="plain-button" onClick={()=>setDraft({
      score:row.score===null?"":String(row.score),original:row.score,revision:row.revision,visible:row.visible,reason:"",
    })}>{text.edit}</button>}
    {activity.canEdit&&draft&&<form className="auth-form" onSubmit={submit}>
      <label>{text.score}<input inputMode="decimal" value={draft.score} onChange={(event)=>setDraft({...draft,score:event.target.value})}/></label>
      {draft.visible&&proposed!==draft.original&&<label>{text.correction}<textarea required maxLength={500} value={draft.reason}
        onChange={(event)=>setDraft({...draft,reason:event.target.value})}/></label>}
      <button className="primary-button" type="submit" disabled={busy}>{text.save}</button>
      <button className="plain-button" type="button" disabled={busy} onClick={()=>setDraft(undefined)}>{text.cancel}</button>
    </form>}
    {notice&&<p role={notice.error?"alert":"status"}>{notice.copy}</p>}
    {row.revision>2&&<button className="plain-button" onClick={()=>setShowHistory((visible)=>!visible)}>{text.history}</button>}
    {row.revision>2&&showHistory&&<TimetableRead locale={locale} result={history}>{(records)=><ul className="group-list">
      {records.map((record)=><li key={record.revision} className="timetable-day">
        <p>{scoreLabel(locale,record.previousScore,activity.maxScore)} → {scoreLabel(locale,record.score,activity.maxScore)}</p>
        <p><bdi>{record.occurredAt}</bdi>{record.actorName&&<> · <bdi>{record.actorName}</bdi></>}</p>
        <p dir="auto">{record.reason}</p>
      </li>)}
    </ul>}</TimetableRead>}
  </>;
}
