"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {
  assignmentActions,assignmentSchema,assignmentWithSubstitutesSchema,
  staffSchema,subjectSchema,type Locale,type SchoolClass,type SchoolYear,
} from "@madrasty/contracts";
import {ApiResponseError,requestApi} from "@/api/client";
import {useAdminCommand} from "@/api/commands";
import {dictionary,localizedError} from "@/i18n";
import css from "./StaffWorkspace.module.css";
const assignmentList=assignmentWithSubstitutesSchema.array();
const staffList=staffSchema.array(),subjectsList=subjectSchema.array();
type Assignment=typeof assignmentList._output[number];
type Teacher=typeof staffList._output[number];
type Subject=typeof subjectsList._output[number];
const copy={
 ar:{title:"مدرسو الفصل",add:"تعيين مدرس",leader:"مدرس الفصل",subject:"مدرس مادة",
    name:"المدرس",subjectLabel:"المادة",choose:"اختر",save:"حفظ التكليف",
    cancel:"إلغاء",advanced:"إعدادات متقدمة",details:"التكليفات والبدلاء",
    dates:"فترة التكليف",start:"يبدأ من",end:"ينتهي في",empty:"لا يوجد مدرسون مكلفون بهذا الفصل.",
    exists:"مدرس الفصل موجود بالفعل. تقدر تعدّل تكليفه من التفاصيل المتقدمة.",
    cannot:"لا يوجد مدرسون جاهزون للتكليف. أضف حساب مدرس أولًا.",
    classInfo:"مدرس الفصل مسؤول عن الحضور والتدريس والدرجات والتواصل.",
    subjectInfo:"مدرس المادة مسؤول عن المادة التي تدرّس في هذا الفصل.",
    active:"ساري",revoked:"ملغي",waiting:"جاري التحميل",startTeacher:"إضافة مدرس جديد"},
 de:{title:"Lehrkräfte dieser Klasse",add:"Lehrkraft zuweisen",leader:"Klassenlehrkraft",subject:"Fachlehrkraft",
    name:"Lehrkraft",subjectLabel:"Fach",choose:"Auswählen",save:"Zuordnung speichern",
    cancel:"Abbrechen",advanced:"Erweiterte Einstellungen",details:"Zuordnungen und Vertretungen",
    dates:"Zeitraum der Zuordnung",start:"Beginn",end:"Ende",empty:"Für diese Klasse sind noch keine Lehrkräfte zugeordnet.",
    exists:"Die Klasse hat bereits eine Klassenlehrkraft. Änderungen sind in den erweiterten Details möglich.",
    cannot:"Noch keine zuweisbare Lehrkraft vorhanden. Zuerst ein Konto anlegen.",
    classInfo:"Die Klassenlehrkraft übernimmt Anwesenheit, Unterricht, Noten und Klassenkommunikation.",
    subjectInfo:"Die Fachlehrkraft unterrichtet und verwaltet ihr ausgewähltes Fach.",
    active:"Aktiv",revoked:"Aufgehoben",waiting:"Wird geladen",startTeacher:"Neue Lehrkraft"},
} as const;
function problem(locale:Locale,error:unknown){
 return error instanceof ApiResponseError?localizedError(locale,error.messageKey):dictionary(locale)["error.unavailable"];
}
function defaultStart(starts:string) {
 const today=new Date().toISOString().slice(0,10);
 return today>starts?today:starts;
}
export function ClassTeachersPanel({locale,schoolClass,year,canManage=true}:{
 locale:Locale;schoolClass:SchoolClass;year:SchoolYear;canManage?:boolean;
}){
 const t=copy[locale],cmd=useAdminCommand();
 const [assignments,setAssignments]=useState<Assignment[]>([]),[teachers,setTeachers]=useState<Teacher[]>([]),[subjects,setSubjects]=useState<Subject[]>([]);
 const [open,setOpen]=useState(false),[kind,setKind]=useState<"primary"|"subject">("primary");
 const [teacherId,setTeacherId]=useState(""),[subjectId,setSubjectId]=useState("");
 const [start,setStart]=useState(defaultStart(year.startsOn)),[end,setEnd]=useState(year.endsExclusive);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState(""),[reload,setReload]=useState(0);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);
  Promise.all([
   requestApi(`/school/classes/${schoolClass.id}/assignments`,assignmentList,{signal:controller.signal}),
   requestApi("/school/staff?limit=100",staffList,{signal:controller.signal}),
   requestApi("/school/subjects",subjectsList,{signal:controller.signal}),
  ]).then(([a,b,c])=>{
    setAssignments(a.data);setTeachers(b.data.filter(p=>p.role==="teacher"&&p.accountId&&!p.disabled));setSubjects(c.data);
    setLoading(false);
  }).catch(e=>{if(!controller.signal.aborted){setError(problem(locale,e));setLoading(false);}});
  return()=>controller.abort();
 },[schoolClass.id,locale,reload]);
 const available=assignments.filter(a=>!a.revoked);
 const hasLeader=available.some(a=>a.kind==="primary"&&a.untilExclusive>defaultStart(year.startsOn));
 const onSubmit=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(!teacherId||(kind==="subject"&&!subjectId)){setError(dictionary(locale)["error.validation"]);return;}
  setBusy(true);setError("");setSuccess("");
  const permissions=kind==="primary"?[...assignmentActions]:
     assignmentActions.filter(cap=>cap!=="attendance.mark"&&cap!=="attendance.approve");
  void cmd(`/school/classes/${schoolClass.id}/assignments`,"POST",{
    staffId:teacherId,kind,subjectId:kind==="subject"?subjectId:null,
    from:start,untilExclusive:end,capabilities:permissions,
  },assignmentSchema).then(()=>{
    setReload(v=>v+1);setOpen(false);setTeacherId("");setSubjectId("");
    setSuccess(dictionary(locale).saved);
  }).catch(e=>setError(problem(locale,e))).finally(()=>setBusy(false));
 };
 const detailUrl=`/${locale}/school/more/assignments?advanced=1&year=${year.id}&class=${schoolClass.id}`;
 return <section className={css.card} aria-label={t.title}>
  <div className={css.cardHeader}>
    <h2 className={css.cardTitle}>{t.title}</h2>
    {canManage&&year.state!=="closed"&&<button type="button" className={css.primary}
      onClick={()=>{setOpen(current=>!current);setError("");if(hasLeader)setKind("subject");}}>{t.add}</button>}
  </div>
  {loading?<p role="status" className={css.muted}>{t.waiting}</p>:<div className={css.assignmentList}>
    {available.length===0&&<p className={css.muted}>{t.empty}</p>}
    {available.map(a=><div key={a.id} className={css.assignmentRow}>
      <div className={css.assignmentIdentity}>
        <strong><bdi>{a.staffName}</bdi></strong>
        <span className={css.smallLabel}>{a.kind==="primary"?t.leader:
          `${t.subject} · ${locale==="ar"?a.subjectNameAr:a.subjectNameDe}`}</span>
      </div>
      <span className={css.role}>{t.active}</span>
    </div>)}
  </div>}
  {open&&<form className={css.stack} onSubmit={onSubmit}>
    <hr className={css.rule}/>
    <div className={css.radioCards}>
      <label className={css.radioCard}><input type="radio" checked={kind==="primary"} disabled={hasLeader}
        onChange={()=>setKind("primary")}/>{t.leader}</label>
      <label className={css.radioCard}><input type="radio" checked={kind==="subject"} onChange={()=>setKind("subject")}/>{t.subject}</label>
    </div>
    {hasLeader&&<p className={css.muted}>{t.exists}</p>}
    <p className={css.muted}>{kind==="primary"?t.classInfo:t.subjectInfo}</p>
    <label className={css.field}>{t.name}<select className={css.select} required value={teacherId} onChange={e=>setTeacherId(e.target.value)}>
      <option value="">{t.choose}</option>{teachers.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}
    </select></label>
    {kind==="subject"&&<label className={css.field}>{t.subjectLabel}<select className={css.select} value={subjectId} required onChange={e=>setSubjectId(e.target.value)}>
      <option value="">{t.choose}</option>{subjects.map(s=><option key={s.id} value={s.id}>{locale==="ar"?s.nameAr:s.nameDe}</option>)}
    </select></label>}
    {teachers.length===0&&<p className={css.muted}>{t.cannot}</p>}
    <details className={css.details}><summary>{t.advanced}</summary>
      <div className={css.twoCols}>
        <label className={css.field}>{t.start}<input className={css.input} type="date" value={start}
          min={year.startsOn} max={year.endsExclusive} onChange={e=>setStart(e.target.value)}/></label>
        <label className={css.field}>{t.end}<input className={css.input} type="date" value={end}
          min={start} max={year.endsExclusive} onChange={e=>setEnd(e.target.value)}/></label>
      </div>
    </details>
    <div className={css.actions}>
      <button className={css.primary} disabled={busy||teachers.length===0||year.state==="closed"}>{t.save}</button>
      <button className={css.secondary} type="button" onClick={()=>setOpen(false)}>{t.cancel}</button>
    </div>
  </form>}
  {error&&<p role="alert" className={css.error}>{error}</p>}
  {success&&<p role="status" className={css.success}>{success}</p>}
  {canManage&&<div className={css.actions}>
    <Link className={css.smallButton} href={detailUrl}>{t.details}</Link>
  </div>}
 </section>;
}
