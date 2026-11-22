"use client";

import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {z} from "zod";
import { useEffect,useState,type FormEvent } from "react";
import {
  curriculumOffering,homeworkEntry,homeworkGradeBulkInput,homeworkGradeBulkReceipt,homeworkGradeCorrection,homeworkGradeInput,
  homeworkGradeReceipt,homeworkGradeRow,homeworkGradingItem,homeworkScore,
  type HomeworkEntry,type HomeworkGradeRow,type Locale,
} from "@madrasty/contracts";
import { ApiResponseError } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { dictionary,localizedError } from "@/i18n";
import { TimetableRead,timetableError,useTimetableRead } from "@/features/school/timetable/shared";
import { useAccountScope } from "@/ui/AccountScope";
import { AcademicPageItems,offeringText,useAcademicPage } from "./shared";
import {readGradebookContext,writeGradebookContext,type GradebookContext} from "./gradebook-context";

const copy={
  ar:{title:"تصحيح الواجبات",class:"الفصل",all:"كل فصولي",roster:"كشف التصحيح",details:"تفاصيل الواجب",back:"رجوع للتصحيح",
    score:"الدرجة من ٢٠",pending:"الدرجة غير مسجلة",graded:"طلاب لهم درجة",bulk:"حفظ الدرجات المحددة",
    feedback:"ملاحظات التصحيح",individual:"تصحيح طالب",reason:"سبب التغيير بعد عرض النتيجة للأسرة",
    save:"حفظ",cancel:"إلغاء",history:"سجل التصحيحات",refresh:"تحديث الكشف",saved:"اتحفظ التصحيح.",
    rebase:"راجع الدرجة الحالية وأعد تطبيق التعديل",before:"القيمة السابقة",after:"القيمة الحالية",emptyFeedback:"بدون ملاحظة"},
  de:{title:"Hausaufgaben korrigieren",class:"Klasse",all:"Alle meine Klassen",roster:"Bewertungsliste",details:"Aufgabe ansehen",back:"Zurück zur Übersicht",
    score:"Punkte von 20",pending:"Noch keine Note erfasst",graded:"Bewertete Schülerinnen und Schüler",bulk:"Ausgewählte Punkte speichern",
    feedback:"Rückmeldung",individual:"Einzelbewertung",reason:"Begründung zur Änderung einer sichtbaren Bewertung",
    save:"Speichern",cancel:"Abbrechen",history:"Korrekturverlauf",refresh:"Liste aktualisieren",saved:"Bewertung gespeichert.",
    rebase:"Aktuelle Punktzahl prüfen und Änderung übernehmen",before:"Vorheriger Wert",after:"Aktueller Wert",emptyFeedback:"Ohne Rückmeldung"},
} as const;
const offerings=curriculumOffering.array(),homework=homeworkGradingItem.array(),roster=homeworkGradeRow.array(),history=homeworkGradeCorrection.array();

export function Gradebook({locale,initial}:{locale:Locale;initial?:string}){
  const text=copy[locale];
  const routeParams=useSearchParams();
  const [id,setId]=useState(initial);
  const [classId,setClassId]=useState(()=>readGradebookContext(routeParams).classId);
  useEffect(()=>{
    const restored=readGradebookContext(routeParams);
    setClassId(restored.classId);
    setId(z.uuid().safeParse(restored.workId).data);
  },[routeParams]);
  function navigate(patch:Partial<GradebookContext>,push=false){
    const next=writeGradebookContext(new URLSearchParams(routeParams.toString()),patch);
    const url=window.location.pathname+(next.size?`?${next}`:"")+window.location.hash;
    if(push)window.history.pushState(null,"",url);
    else window.history.replaceState(null,"",url);
  }
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    const refresh=()=>setVersion((n)=>n+1);
    window.addEventListener("focus",refresh);
    return ()=>window.removeEventListener("focus",refresh);
  },[]);
  const choices=useTimetableRead("/academics/offerings",offerings,version);
  const page=useAcademicPage(id?null:`/academics/grading?limit=25${classId?`&classId=${classId}`:""}`,homework,version);
  const item=useTimetableRead(id?`/academics/homework/${id}`:null,homeworkEntry,version);
  if(id)return <>
    <h1>{text.roster}</h1>
    <button type="button" className="plain-button" onClick={()=>{setId(undefined);navigate({workId:""});setVersion((n)=>n+1);}}>{text.back}</button>
    <TimetableRead locale={locale} result={item}>{(value)=><GradeSheet key={id} locale={locale} item={value} version={version}/>}</TimetableRead>
  </>;
  return <>
    <h1>{text.title}</h1>
    <TimetableRead locale={locale} result={choices}>{(options)=>{
      const classrooms=[...new Map(options.filter((entry)=>entry.canGrade).map((option)=>[option.classId,option])).values()];
      return <label className="auth-card">{text.class}<select value={classId} onChange={(event)=>{setClassId(event.target.value);navigate({classId:event.target.value});}}>
        <option value="">{text.all}</option>{classrooms.map((option)=><option key={option.classId} value={option.classId}>{offeringText(option,locale)}</option>)}
      </select></label>;
    }}</TimetableRead>
    <section className="auth-card">
      <AcademicPageItems locale={locale} page={page}>{(rows)=><ul className="group-list">{rows.map((value)=><li key={value.homeworkId}>
        <button type="button" className="group-row" onClick={()=>{setId(value.homeworkId);navigate({workId:value.homeworkId},true);}}>
          <bdi>{value.title}</bdi><bdi>{value.classCode} · {locale==="ar"?value.subjectNameAr:value.subjectNameDe}</bdi>
          <span>{text.graded} · <bdi>{new Intl.NumberFormat(locale).format(value.graded)} / {new Intl.NumberFormat(locale).format(value.total)}</bdi></span>
        </button>
      </li>)}</ul>}</AcademicPageItems>
    </section>
  </>;
}

type ScoreDraft={raw:string;revision:number;previous:number|null;visible:boolean;reason:string};
const draftOf=(row:HomeworkGradeRow):ScoreDraft=>({
  raw:row.score===null?"":String(row.score),revision:row.revision,previous:row.score,visible:row.visible,reason:"",
});
function decimal(raw:string){
  const normalized=raw.trim().replace(/[٠-٩]/g,(digit)=>String(digit.charCodeAt(0)-0x660))
    .replace(/[۰-۹]/g,(digit)=>String(digit.charCodeAt(0)-0x6f0)).replace(/[,٫]/g,".");
  if(!normalized)return null;
  // Trim insignificant trailing zeroes before converting to a JS number.
  if(!/^\d+(?:\.\d+)?$/.test(normalized))return Number.NaN;
  const [integral,rawFraction=""]=normalized.split(".");
  const fraction=rawFraction.replace(/0+$/,"");
  if(fraction&&fraction!=="5")return Number.NaN;
  return Number(integral)+(fraction?0.5:0);
}
function scoreText(locale:Locale,score:number|null){
  if(score===null)return copy[locale].pending;
  const fmt=new Intl.NumberFormat(locale,{maximumFractionDigits:1});
  return `${fmt.format(score)} / ${fmt.format(20)}`;
}

function GradeSheet({locale,item,version}:{locale:Locale;item:HomeworkEntry;version:number}){
  const text=copy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [updated,setUpdated]=useState(0);
  const [drafts,setDrafts]=useState<Record<string,ScoreDraft>>({});
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [banner,setBanner]=useState<{message:string;error:boolean}>();
  const [busy,setBusy]=useState(false);
  const [report,setReport]=useState<{graded:number;total:number}>();
  const path=`/academics/homework/${item.id}/grades` as const;
  const page=useAcademicPage(`${path}?limit=35`,roster,version+updated);
  const changed=Object.keys(drafts).length;

  function setDraft(row:HomeworkGradeRow,draft?:ScoreDraft){
    setDrafts((old)=>{
      const next={...old};
      if(draft&&decimal(draft.raw)!==draft.previous)next[row.studentId]=draft;
      else delete next[row.studentId];
      return next;
    });
    setErrors((old)=>{const next={...old};delete next[row.studentId];return next;});
  }
  function refresh(){
    setUpdated((count)=>count+1);
    setReport(undefined);
  }
  async function commit(){
    if(!changed||busy)return;
    const prepared=Object.entries(drafts).map(([studentId,draft])=>({
      studentId,revision:draft.revision,score:decimal(draft.raw),reasonIfCorrection:draft.reason.trim()||undefined,
    }));
    const invalid=prepared.filter((row)=>!homeworkScore.nullable().safeParse(row.score).success||
      (drafts[row.studentId].visible&&!row.reasonIfCorrection));
    if(invalid.length){
      setErrors(Object.fromEntries(invalid.map(({studentId})=>[studentId,dictionary(locale)["error.validation"]])));
      return;
    }
    const input=homeworkGradeBulkInput.safeParse({rows:prepared});
    if(!input.success){setBanner({message:dictionary(locale)["error.validation"],error:true});return;}
    setBusy(true);setErrors({});setBanner(undefined);
    try{
      const result=await command(`${path}/bulk`,"POST",input.data,homeworkGradeBulkReceipt);
      setDrafts({});setBanner({message:text.saved,error:false});setUpdated((count)=>count+1);
      setReport({graded:result.graded,total:result.total});
    }catch(error){
      if(error instanceof ApiResponseError){
        if(error.fields)setErrors(Object.fromEntries(Object.entries(error.fields).flatMap(([field,key])=>{
          const match=/^rows\.([^.]+)(?:\.|$)/.exec(field);
          const student=match?(prepared[Number(match[1])]?.studentId??match[1]):null;
          return student?[[student,localizedError(locale,key)]]:[];
        })));
        if([401,403,404].includes(error.status))setDrafts({});
        if([401,403,404,409].includes(error.status))refresh();
      }
      setBanner({message:timetableError(locale,error),error:true});
    }finally{setBusy(false);}
  }
  return <section className="auth-card auth-form">
    <h2 dir="auto">{item.title}</h2>
    <p><bdi>{item.classCode} · {locale==="ar"?item.subjectNameAr:item.subjectNameDe}</bdi></p>
    <div className="header-actions">
      <Link className="plain-button" href={`/${locale}/school/more/homework?work=${item.id}`}>{text.details}</Link>
      <button type="button" className="plain-button" disabled={busy} onClick={refresh}>{text.refresh}</button>
    </div>
    {item.canGrade&&changed>0&&<button type="button" className="primary-button" disabled={busy||!page.visible?.items||!!page.visible.error}
      onClick={()=>void commit()}>{text.bulk} · {new Intl.NumberFormat(locale).format(changed)}</button>}
    {banner&&<p role={banner.error?"alert":"status"}>{banner.message}</p>}
    {report&&<p>{text.graded} · <bdi>{new Intl.NumberFormat(locale).format(report.graded)} / {new Intl.NumberFormat(locale).format(report.total)}</bdi></p>}
    <AcademicPageItems locale={locale} page={page}>{(rows)=><ul className="group-list">{rows.map((row)=>{
      const draft=drafts[row.studentId];
      return <li key={row.studentId} className="timetable-day">
        <strong><bdi>{row.studentName}</bdi></strong> · <bdi dir="ltr">{row.studentNumber}</bdi>
        <p><bdi>{scoreText(locale,row.score)}</bdi></p>
        {row.canEdit&&<label>{text.score}<input aria-label={`${row.studentName} · ${text.score}`} inputMode="decimal" maxLength={24}
          value={draft?.raw??(row.score===null?"":String(row.score))} disabled={busy}
          onChange={(event)=>setDraft(row,{...(draft??draftOf(row)),raw:event.target.value})}/></label>}
        {draft?.visible&&<label>{text.reason}<textarea maxLength={500} value={draft.reason} disabled={busy}
          onChange={(event)=>setDraft(row,{...draft,reason:event.target.value})}/></label>}
        {draft&&draft.revision!==row.revision&&<button type="button" className="plain-button" disabled={busy}
          onClick={()=>setDraft(row,{...draftOf(row),raw:draft.raw,reason:draft.reason})}>{text.rebase}</button>}
        {errors[row.studentId]&&<p role="alert">{errors[row.studentId]}</p>}
        <IndividualGrade locale={locale} item={item} row={row} disabled={busy} refresh={refresh}
          saved={()=>{setDraft(row);refresh();}}/>
      </li>;
    })}</ul>}</AcademicPageItems>
  </section>;
}

function IndividualGrade({locale,item,row,disabled,saved,refresh}:{
  locale:Locale;item:HomeworkEntry;row:HomeworkGradeRow;disabled:boolean;saved:()=>void;refresh:()=>void;
}){
  const text=copy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [editor,setEditor]=useState<ScoreDraft&{feedback:string;beforeFeedback:string|null}>();
  const [displayHistory,setDisplayHistory]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState<string>();
  const path=`/academics/homework/${item.id}/grades/${row.studentId}` as const;
  const entries=useTimetableRead(displayHistory?path:null,history,row.revision);
  async function save(event:FormEvent){
    event.preventDefault();
    if(!editor)return;
    const score=decimal(editor.raw),feedback=editor.feedback.trim()||null;
    const changedScore=score!==editor.previous,changedFeedback=feedback!==editor.beforeFeedback;
    if(!changedScore&&!changedFeedback){setEditor(undefined);return;}
    const input=homeworkGradeInput.safeParse({
      revision:editor.revision,...(changedScore?{score}:{}),...(changedFeedback?{feedback}:{}),
      reasonIfCorrection:editor.reason.trim()||undefined,
    });
    if(!input.success||(editor.visible&&!input.data.reasonIfCorrection)){
      setNotice(dictionary(locale)["error.validation"]);return;
    }
    setSaving(true);setNotice(undefined);
    try{
      await command(path,"PATCH",input.data,homeworkGradeReceipt);
      setEditor(undefined);setNotice(text.saved);saved();
    }catch(error){
      setNotice(timetableError(locale,error));
      if(error instanceof ApiResponseError&&[401,403,404].includes(error.status))setEditor(undefined);
      if(error instanceof ApiResponseError&&[401,403,404,409].includes(error.status))refresh();
    }finally{setSaving(false);}
  }
  return <>
    {row.feedback&&<p dir="auto" style={{whiteSpace:"pre-wrap"}}>{row.feedback}</p>}
    {row.canEdit&&!editor&&<button type="button" className="plain-button" disabled={disabled} onClick={()=>{
      setEditor({...draftOf(row),feedback:row.feedback??"",beforeFeedback:row.feedback});setNotice(undefined);
    }}>{text.individual}</button>}
    {row.canEdit&&editor&&<form className="auth-form" onSubmit={save}>
      <label>{text.score}<input inputMode="decimal" maxLength={24} value={editor.raw} disabled={saving||disabled}
        onChange={(event)=>setEditor({...editor,raw:event.target.value})}/></label>
      <label>{text.feedback}<textarea maxLength={3000} value={editor.feedback} disabled={saving||disabled}
        onChange={(event)=>setEditor({...editor,feedback:event.target.value})}/></label>
      {editor.visible&&<label>{text.reason}<textarea maxLength={500} value={editor.reason} disabled={saving||disabled}
        onChange={(event)=>setEditor({...editor,reason:event.target.value})}/></label>}
      {editor.revision!==row.revision&&<button type="button" className="plain-button" disabled={saving||disabled}
        onClick={()=>setEditor({...draftOf(row),raw:editor.raw,reason:editor.reason,feedback:editor.feedback,beforeFeedback:row.feedback})}>{text.rebase}</button>}
      <button type="submit" className="primary-button" disabled={saving||disabled}>{text.save}</button>
      <button type="button" className="plain-button" disabled={saving||disabled} onClick={()=>setEditor(undefined)}>{text.cancel}</button>
    </form>}
    {notice&&<p aria-live="polite">{notice}</p>}
    {row.corrected&&<button type="button" className="plain-button" aria-expanded={displayHistory}
      onClick={()=>setDisplayHistory((old)=>!old)}>{text.history}</button>}
    {row.corrected&&displayHistory&&<TimetableRead locale={locale} result={entries}>{(items)=><ul className="group-list">
      {items.map((entry)=><li key={entry.revision} className="timetable-day">
        <p><bdi>{entry.occurredAt}</bdi>{entry.actorName&&<> · <bdi>{entry.actorName}</bdi></>}</p>
        <p>{text.before} · <bdi>{scoreText(locale,entry.previousScore)}</bdi> · <bdi>{entry.previousFeedback??text.emptyFeedback}</bdi></p>
        <p>{text.after} · <bdi>{scoreText(locale,entry.score)}</bdi> · <bdi>{entry.feedback??text.emptyFeedback}</bdi></p>
        <p dir="auto">{entry.reason}</p>
      </li>)}
    </ul>}</TimetableRead>}
  </>;
}
