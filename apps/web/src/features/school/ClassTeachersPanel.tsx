"use client";
import {useEffect,useState,type FormEvent} from "react";
import type {z} from "zod";
import Link from "next/link";
import {
  assignmentActions,assignmentSchema,assignmentWithSubstitutesSchema,
  staffSchema,type Locale,type SchoolClass,type SchoolYear,
} from "@madrasty/contracts";
import {ApiResponseError,requestApi} from "@/api/client";
import {useAdminCommand} from "@/api/commands";
import {dictionary,localizedError} from "@/i18n";
import css from "./StaffWorkspace.module.css";
const assignmentList=assignmentWithSubstitutesSchema.array();
const staffList=staffSchema.array();
type Assignment=z.infer<typeof assignmentWithSubstitutesSchema>;
type Teacher=z.infer<typeof staffSchema>;
const copy={
 ar:{title:"مدرسو الفصل",add:"تعيين مدرس",name:"المدرس",choose:"اختر",save:"حفظ التكليف",
    cancel:"إلغاء",advanced:"إعدادات متقدمة",details:"التكليفات والبدلاء",
    start:"يبدأ من",end:"ينتهي في",empty:"لم يُعيَّن مدرس لهذا الفصل بعد.",
    cannot:"لا يوجد مدرسون جاهزون للتكليف. أضف حساب مدرس أولًا.",
    active:"ساري",waiting:"جاري التحميل"},
 de:{title:"Lehrkräfte dieser Klasse",add:"Lehrkraft zuweisen",name:"Lehrkraft",choose:"Auswählen",save:"Zuordnung speichern",
    cancel:"Abbrechen",advanced:"Erweiterte Einstellungen",details:"Zuordnungen und Vertretungen",
    start:"Beginn",end:"Ende",empty:"Dieser Klasse ist noch keine Lehrkraft zugeordnet.",
    cannot:"Noch keine zuweisbare Lehrkraft vorhanden. Zuerst ein Konto anlegen.",
    active:"Aktiv",waiting:"Wird geladen"},
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
 const [assignments,setAssignments]=useState<Assignment[]>([]),[teachers,setTeachers]=useState<Teacher[]>([]);
 const [open,setOpen]=useState(false);
 const [teacherId,setTeacherId]=useState("");
 const [start,setStart]=useState(defaultStart(year.startsOn)),[end,setEnd]=useState(year.endsExclusive);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState(""),[reload,setReload]=useState(0);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);
  Promise.all([
   requestApi(`/school/classes/${schoolClass.id}/assignments`,assignmentList,{signal:controller.signal}),
   requestApi("/school/staff?limit=100",staffList,{signal:controller.signal}),
  ]).then(([a,b])=>{
    setAssignments(a.data);setTeachers(b.data.filter(p=>p.role==="teacher"&&p.accountId&&!p.disabled));
    setLoading(false);
  }).catch(e=>{if(!controller.signal.aborted){setError(problem(locale,e));setLoading(false);}});
  return()=>controller.abort();
 },[schoolClass.id,locale,reload]);
 const available=assignments.filter(a=>!a.revoked&&a.untilExclusive>defaultStart(year.startsOn));
 // Historic primary + subject assignments can belong to one volunteer. Display that person once.
 const visibleTeachers=available.filter((item,index,rows)=>rows.findIndex(row=>row.staffId===item.staffId)===index);
 const hasLeader=available.some(a=>a.kind==="primary"&&a.untilExclusive>defaultStart(year.startsOn));
 const assignable=teachers.filter(p=>!visibleTeachers.some(a=>a.staffId===p.id));
 const onSubmit=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(!teacherId){setError(dictionary(locale)["error.validation"]);return;}
  setBusy(true);setError("");setSuccess("");
  const permissions=hasLeader?assignmentActions.filter(a=>a!=="attendance.mark"&&a!=="attendance.approve"):[...assignmentActions];
  void cmd(`/school/classes/${schoolClass.id}/assignments`,"POST",{
    staffId:teacherId,kind:hasLeader?"support":"primary",subjectId:null,
    from:start,untilExclusive:end,capabilities:permissions,
  },assignmentSchema).then(()=>{
    setReload(v=>v+1);setOpen(false);setTeacherId("");
    setSuccess(dictionary(locale).saved);
  }).catch(e=>setError(problem(locale,e))).finally(()=>setBusy(false));
 };
 const detailUrl=`/${locale}/school/more/assignments?advanced=1&year=${year.id}&class=${schoolClass.id}`;
 return <section className={css.card} aria-label={t.title}>
  <div className={css.cardHeader}>
    <h2 className={css.cardTitle}>{t.title}</h2>
    {canManage&&!loading&&year.state!=="closed"&&assignable.length>0&&<button type="button" className={css.primary}
      onClick={()=>{setOpen(current=>!current);setError("");}}>{t.add}</button>}
  </div>
  {loading?<p role="status" className={css.muted}>{t.waiting}</p>:<div className={css.assignmentList}>
    {visibleTeachers.length===0&&<p className={css.muted}>{t.empty}</p>}
    {visibleTeachers.map(a=><div key={a.id} className={css.assignmentRow}>
      <div className={css.assignmentIdentity}>
        <strong><bdi>{a.staffName}</bdi></strong>
      </div>
      <span className={css.role}>{t.active}</span>
    </div>)}
  </div>}
  {open&&<form className={css.stack} onSubmit={onSubmit}>
    <hr className={css.rule}/>
    <label className={css.field}>{t.name}<select className={css.select} required value={teacherId} onChange={e=>setTeacherId(e.target.value)}>
      <option value="">{t.choose}</option>{assignable.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}
    </select></label>
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
      <button className={css.primary} disabled={busy||assignable.length===0||year.state==="closed"}>{t.save}</button>
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
