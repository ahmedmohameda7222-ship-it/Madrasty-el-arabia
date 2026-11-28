"use client";

import { useState,type FormEvent } from "react";
import {
  assessmentPupil,evaluationChange,evaluationCorrect,evaluationCreate,evaluationEntry,evaluationPublication,
  evaluationPublicationReceipt,lessonReceipt,schoolDateSchema,type EvaluationEntry,type Locale,
} from "@madrasty/contracts";
import { ApiResponseError } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { dictionary } from "@/i18n";
import { TimetableRead,timetableError,useTimetableRead } from "@/features/school/timetable/shared";
import { useAccountScope } from "@/ui/AccountScope";
import { AssessmentScope,type AssessmentContext } from "./AssessmentScope";
import { AcademicPageItems,useAcademicPage } from "./shared";

const copy={
  ar:{title:"التقييمات الدورية",newEvaluation:"إضافة تقييم",edit:"تعديل المسودة",pupil:"الطالب",subject:"المادة",
    periodStart:"بداية الفترة",periodEnd:"نهاية الفترة",label:"عنوان التقييم",draft:"مسودة",published:"منشور",
    unpublished:"تعديلات المسودة بانتظار النشر",participation:"المشاركة",understanding:"الفهم",preparation:"التحضير",
    strengths:"نقاط القوة",improvements:"نقاط التحسين",unfilled:"غير محدد",save:"حفظ المسودة",back:"رجوع للتقييمات",
    review:"مراجعة للنشر",publish:"نشر التقييم",correct:"تصحيح تقييم منشور",confirm:"اعتماد التصحيح",
    cancel:"إلغاء",reason:"سبب التصحيح",history:"النسخ المنشورة",done:"اتحفظ التقييم.",live:"اتنشر التقييم.",
    updated:"اتنشر التصحيح.",refresh:"تحديث",more:"عرض المزيد"},
  de:{title:"Regelmäßige Beurteilungen",newEvaluation:"Beurteilung anlegen",edit:"Entwurf bearbeiten",pupil:"Schülerin oder Schüler",subject:"Fach",
    periodStart:"Beginn des Zeitraums",periodEnd:"Ende des Zeitraums",label:"Titel der Beurteilung",draft:"Entwurf",published:"Veröffentlicht",
    unpublished:"Entwurf enthält unveröffentlichte Änderungen",participation:"Mitarbeit",understanding:"Verständnis",preparation:"Vorbereitung",
    strengths:"Stärken",improvements:"Entwicklungsmöglichkeiten",unfilled:"Offen",save:"Entwurf speichern",back:"Zurück zu den Beurteilungen",
    review:"Veröffentlichung prüfen",publish:"Beurteilung veröffentlichen",correct:"Veröffentlichte Beurteilung korrigieren",confirm:"Korrektur bestätigen",
    cancel:"Abbrechen",reason:"Begründung der Korrektur",history:"Veröffentlichte Fassungen",done:"Beurteilung gespeichert.",live:"Beurteilung veröffentlicht.",
    updated:"Korrektur veröffentlicht.",refresh:"Aktualisieren",more:"Weitere anzeigen"},
} as const;
const evaluationRows=evaluationEntry.array(),pupils=assessmentPupil.array(),publications=evaluationPublication.array();
const dimensions=["participation","understanding","preparation"] as const;
type Fields=Pick<EvaluationEntry,"title"|"participation"|"understanding"|"preparation"|"strengths"|"improvements">;
const blank:Fields={title:"",participation:null,understanding:null,preparation:null,strengths:"",improvements:""};

export function Evaluations({locale,initialChild,initial}:{locale:Locale;initialChild?:string;initial?:string}){
  return <>
    <h1>{copy[locale].title}</h1>
    <AssessmentScope locale={locale} initialChild={initialChild} initial={initial}
      allow={(offering)=>offering.canGrade||offering.canPublish}
      staffEmptyMessage={locale==="ar"?"لا توجد فصول متاحة لإعداد التقييمات حاليًا.":"Für Sie sind derzeit keine Klassen zur Beurteilung verfügbar."}>
      {(scope)=><EvaluationList key={scope.child??scope.offering?.id??"record"} locale={locale} scope={scope}/>}
    </AssessmentScope>
  </>;
}
function EvaluationList({locale,scope}:{locale:Locale;scope:AssessmentContext}){
  const text=copy[locale],{child,offering,version}=scope;
  const [selected,setSelected]=useState(scope.initial);
  const [newDraft,setNewDraft]=useState(false),[revise,setRevise]=useState(0),[message,setMessage]=useState("");
  const query=child?`&childId=${child}`:offering?`&offeringId=${offering.id}`:"";
  const list=useAcademicPage(`/academics/evaluations?limit=25${query}`,evaluationRows,version+revise);
  const detail=useTimetableRead(selected?`/academics/evaluations/${selected}${child?`?childId=${child}`:""}`:null,evaluationEntry,version+revise);
  const refresh=()=>setRevise((n)=>n+1);
  return <section className="auth-card auth-form">
    {message&&<p role="status">{message}</p>}
    {selected?<>
      <button className="plain-button" type="button" onClick={()=>{setSelected(undefined);setMessage("");}}>{text.back}</button>
      <TimetableRead locale={locale} result={detail}>{(value)=><EvaluationDetails key={value.id} locale={locale} value={value}
        changed={(notice)=>{if(notice)setMessage(notice);refresh();}}/>}</TimetableRead>
    </>:<>
      {offering?.canGrade&&<button type="button" className={newDraft?"plain-button":"primary-button"} onClick={()=>setNewDraft(true)}>{text.newEvaluation}</button>}
      {offering?.canGrade&&newDraft&&<DraftForm locale={locale} offering={offering.id} cancel={()=>setNewDraft(false)} saved={(id)=>{
        setNewDraft(false);setSelected(id);setMessage(text.done);refresh();
      }}/>}
      <AcademicPageItems locale={locale} page={list} emptyMessage={child
        ? (locale==="ar"?"لا توجد تقييمات منشورة لهذا الطفل حاليًا.":"Für dieses Kind sind noch keine Beurteilungen veröffentlicht.")
        : (locale==="ar"?"لم يتم تسجيل تقييمات لهذا الفصل حتى الآن.":"Für diese Klasse sind noch keine Beurteilungen erfasst.")}>{(rows)=><ul className="group-list">{rows.map((row)=><li key={row.id}>
        <button className="group-row" type="button" onClick={()=>{setSelected(row.id);setMessage("");}}>
          <bdi>{row.title}</bdi><bdi>{row.studentName}</bdi><bdi dir="ltr">{row.periodStart} – {row.periodEnd}</bdi>
          {!child&&<span>{row.publishedId?text.published:text.draft}</span>}
        </button>
      </li>)}</ul>}</AcademicPageItems>
    </>}
  </section>;
}
function FieldsEditor({locale,value,change}:{locale:Locale;value:Fields;change:(value:Fields)=>void}){
  const text=copy[locale],number=new Intl.NumberFormat(locale);
  return <>
    <label>{text.label}<input value={value.title} maxLength={200} dir="auto" required
      onChange={(event)=>change({...value,title:event.target.value})}/></label>
    {dimensions.map((key)=><label key={key}>{text[key]}
      <select value={value[key]??""} onChange={(event)=>change({...value,[key]:event.target.value?Number(event.target.value):null})}>
        <option value="">{text.unfilled}</option>{[1,2,3,4,5].map((score)=><option key={score} value={score}>{number.format(score)}</option>)}
      </select>
    </label>)}
    {(["strengths","improvements"] as const).map((key)=><label key={key}>{text[key]}
      <textarea maxLength={6000} rows={3} dir="auto" value={value[key]} onChange={(event)=>change({...value,[key]:event.target.value})}/>
    </label>)}
  </>;
}
function DraftForm({locale,offering,item,cancel,saved}:{locale:Locale;offering:string;item?:EvaluationEntry;cancel:()=>void;saved:(id:string)=>void}){
  const {persona}=useAccountScope(),text=copy[locale],command=useSchoolCommand(persona);
  const [value,setValue]=useState<Fields>(item??blank),[base]=useState(item?.revision);
  const [from,setFrom]=useState(item?.periodStart??""),[to,setTo]=useState(item?.periodEnd??""),[pupil,setPupil]=useState(item?.studentId??"");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const dated=schoolDateSchema.safeParse(to).success;
  const options=useAcademicPage(!item&&dated?`/academics/evaluations/roster?offeringId=${offering}&date=${to}&limit=30`:null,pupils,0);
  const validPupils=options.visible?.items??[];
  async function save(event:FormEvent){
    event.preventDefault();
    const body={...value,periodStart:from,periodEnd:to};
    const parsed=item?evaluationChange.safeParse({...body,revision:base})
      :evaluationCreate.safeParse({...body,offeringId:offering,studentId:pupil});
    if(!parsed.success){setError(dictionary(locale)["error.validation"]);return;}
    setBusy(true);setError("");
    try{
      const receipt=await command(item?`/academics/evaluations/${item.id}`:"/academics/evaluations",item?"PATCH":"POST",parsed.data,lessonReceipt);
      saved(receipt.id);
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  return <form className="auth-form" onSubmit={save}>
    <label>{text.periodStart}<input type="date" required readOnly={Boolean(item?.publishedId)} value={from}
      onChange={(event)=>setFrom(event.target.value)}/></label>
    <label>{text.periodEnd}<input type="date" min={from||undefined} required readOnly={Boolean(item?.publishedId)} value={to}
      onChange={(event)=>{setTo(event.target.value);if(!item)setPupil("");}}/></label>
    {!item&&dated&&<AcademicPageItems locale={locale} page={options}>{()=><label>{text.pupil}
      <select value={pupil} onChange={(event)=>setPupil(event.target.value)} required>
        <option value="">{dictionary(locale).choose}</option>
        {validPupils.map((row)=><option value={row.studentId} key={row.studentId}>{row.studentName} · {row.studentNumber}</option>)}
      </select>
    </label>}</AcademicPageItems>}
    <FieldsEditor locale={locale} value={value} change={setValue}/>
    {error&&<p role="alert">{error}</p>}
    <div className="header-actions">
      <button className="primary-button" type="submit" disabled={busy||!item&&!validPupils.some((row)=>row.studentId===pupil)}>{text.save}</button>
      <button className="plain-button" type="button" disabled={busy} onClick={cancel}>{text.cancel}</button>
    </div>
  </form>;
}
function Values({locale,value}:{locale:Locale;value:Fields}){
  const text=copy[locale],number=new Intl.NumberFormat(locale);
  return <>
    <dl>{dimensions.map((key)=><div key={key}><dt>{text[key]}</dt>
      <dd>{value[key]===null?text.unfilled:<bdi>{number.format(value[key])} / {number.format(5)}</bdi>}</dd></div>)}</dl>
    {(["strengths","improvements"] as const).map((key)=>value[key]&&<div key={key}><h3>{text[key]}</h3>
      <p dir="auto" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{value[key]}</p>
    </div>)}
  </>;
}
function EvaluationDetails({locale,value,changed}:{locale:Locale;value:EvaluationEntry;changed:(notice?:string)=>void}){
  const {persona}=useAccountScope(),text=copy[locale];
  const [mode,setMode]=useState<"draft"|"review"|"correct">(),[showHistory,setShowHistory]=useState(false);
  const history=useTimetableRead(showHistory&&persona!=="guardian"?`/academics/evaluations/${value.id}/history`:null,publications,value.publishedRevision??0);
  const complete=dimensions.every((key)=>value[key]!==null);
  return <>
    <h2 dir="auto">{value.title}</h2>
    <p><bdi>{value.studentName}</bdi> · <bdi>{value.classCode}</bdi> · <bdi>{locale==="ar"?value.subjectNameAr:value.subjectNameDe}</bdi></p>
    <p><bdi dir="ltr">{value.periodStart} – {value.periodEnd}</bdi></p>
    <p>{value.publishedAt?<>{text.published} · <bdi>{new Date(value.publishedAt).toLocaleString(locale==="ar"?"ar":"de-DE")}</bdi></>:text.draft}</p>
    {value.publishedRevision&&value.publishedRevision!==value.revision&&<p>{text.unpublished}</p>}
    <Values locale={locale} value={value}/>
    {!mode&&<div className="header-actions">
      {value.canEdit&&<button type="button" className="plain-button" onClick={()=>setMode("draft")}>{text.edit}</button>}
      {value.canPublish&&!value.publishedId&&<button type="button" className="plain-button" disabled={!complete} onClick={()=>setMode("review")}>{text.review}</button>}
      {value.canPublish&&value.publishedId&&<button type="button" className="plain-button" onClick={()=>setMode("correct")}>{text.correct}</button>}
    </div>}
    {mode==="draft"&&value.canEdit&&<DraftForm locale={locale} offering={value.offeringId} item={value}
      cancel={()=>setMode(undefined)} saved={()=>{setMode(undefined);changed(text.done);}}/>}
    {mode&&mode!=="draft"&&value.canPublish&&<PublishReview key={mode} locale={locale} value={value} correction={mode==="correct"}
      cancel={()=>setMode(undefined)} saved={()=>{setMode(undefined);changed(mode==="correct"?text.updated:text.live);}}
      refresh={()=>changed()}/>}
    {value.publishedId&&persona!=="guardian"&&<button type="button" className="plain-button" aria-expanded={showHistory}
      onClick={()=>setShowHistory((visible)=>!visible)}>{text.history}</button>}
    {showHistory&&<TimetableRead locale={locale} result={history}>{(versions)=><ul className="group-list">
      {versions.map((entry)=><li className="timetable-day" key={entry.id}>
        <strong><bdi>{entry.title}</bdi></strong><p><bdi>{entry.publishedAt}</bdi>{entry.actorName&&<> · <bdi>{entry.actorName}</bdi></>}</p>
        <Values locale={locale} value={entry}/>
        {entry.reason&&<p dir="auto">{entry.reason}</p>}
      </li>)}
    </ul>}</TimetableRead>}
    <button type="button" className="plain-button" onClick={()=>changed()}>{text.refresh}</button>
  </>;
}
function PublishReview({locale,value,correction,cancel,saved,refresh}:{
  locale:Locale;value:EvaluationEntry;correction:boolean;cancel:()=>void;saved:()=>void;refresh:()=>void;
}){
  const text=copy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [fields,setFields]=useState<Fields>(value),[reason,setReason]=useState(""),[base]=useState(value.revision);
  const [review,setReview]=useState(!correction),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(event:FormEvent){
    event.preventDefault();
    const input=correction?evaluationCorrect.safeParse({revision:base,changes:fields,reason}):{success:true as const,data:{revision:base}};
    if(!input.success){setError(dictionary(locale)["error.validation"]);return;}
    if(!review){setError("");setReview(true);return;}
    setBusy(true);setError("");
    try{
      await command(`/academics/evaluations/${value.id}/${correction?"correct":"publish"}`,"POST",input.data,evaluationPublicationReceipt);saved();
    }catch(problem){
      setError(timetableError(locale,problem));
      if(problem instanceof ApiResponseError&&[401,403,404,409].includes(problem.status))refresh();
    }finally{setBusy(false);}
  }
  return <form className="auth-form notice" onSubmit={submit}>
    <h3>{text.review}</h3>
    {review?<>
      <p><bdi>{fields.title}</bdi></p><Values locale={locale} value={fields}/>
      {correction&&<p dir="auto">{reason}</p>}
    </>:<>
      <FieldsEditor locale={locale} value={fields} change={setFields}/>
      <label>{text.reason}<textarea rows={3} required maxLength={500} value={reason} onChange={(event)=>setReason(event.target.value)}/></label>
    </>}
    {error&&<p role="alert">{error}</p>}
    <div className="header-actions">
      <button type="submit" className="primary-button" disabled={busy||base!==value.revision}>
        {review?(correction?text.confirm:text.publish):text.review}
      </button>
      {review&&correction&&<button type="button" className="plain-button" disabled={busy} onClick={()=>setReview(false)}>{text.edit}</button>}
      <button type="button" className="plain-button" disabled={busy} onClick={cancel}>{text.cancel}</button>
    </div>
  </form>;
}
