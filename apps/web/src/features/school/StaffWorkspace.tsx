"use client";
import {useEffect,useMemo,useState,type FormEvent} from "react";
import Link from "next/link";
import {staffSchema,type StaffProfile,type Locale} from "@madrasty/contracts";
import {requestApi,ApiResponseError} from "@/api/client";
import {useAdminCommand} from "@/api/commands";
import {dictionary,localizedError} from "@/i18n";
import {DirectStaffForm} from "./DirectStaffForm";
import css from "./StaffWorkspace.module.css";

const list=staffSchema.array();
const labels={
 ar:{heading:"المدرسون والإدارة",teacher:"مدرس",admin:"Admin",teachers:"المدرسون",admins:"الإدارة",all:"إجمالي الفريق",
 search:"ابحث عن مدرس أو إداري",addTeacher:"إضافة مدرس",addAdmin:"إضافة Admin",list:"أعضاء الفريق",
 details:"بيانات العضو",edit:"تعديل البيانات",save:"حفظ التعديلات",cancel:"إلغاء",
 name:"الاسم",email:"البريد الإلكتروني",phone:"التليفون",activeFrom:"تاريخ بدء العمل",activeUntil:"تاريخ نهاية العمل",
 classLink:"فتح الفصول والتكليفات",noResults:"لا توجد نتائج مطابقة",notLinked:"الحساب غير مربوط",
 inactive:"غير نشط",active:"نشط",saved:"تم حفظ التعديلات",more:"عرض المزيد"},
 de:{heading:"Lehrkräfte und Verwaltung",teacher:"Lehrkraft",admin:"Admin",teachers:"Lehrkräfte",admins:"Admins",all:"Team",
 search:"Lehrkraft oder Admin suchen",addTeacher:"Lehrkraft hinzufügen",addAdmin:"Admin hinzufügen",list:"Teammitglieder",
 details:"Personaldaten",edit:"Angaben bearbeiten",save:"Änderungen speichern",cancel:"Abbrechen",
 name:"Name",email:"E-Mail-Adresse",phone:"Telefon",activeFrom:"Tätig ab",activeUntil:"Tätig bis",
 classLink:"Klassen und Zuordnungen öffnen",noResults:"Keine passenden Personen",notLinked:"Konto nicht verknüpft",
 inactive:"Inaktiv",active:"Aktiv",saved:"Änderungen gespeichert",more:"Weitere anzeigen"},
} as const;
function err(locale:Locale,error:unknown){return error instanceof ApiResponseError?localizedError(locale,error.messageKey):dictionary(locale)["error.unavailable"];}
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase();
export function StaffWorkspace({locale,canCreateAdmin}:{locale:Locale;canCreateAdmin:boolean}){
 const t=labels[locale],cmd=useAdminCommand();
 const [people,setPeople]=useState<StaffProfile[]>([]),[query,setQuery]=useState(""),[selected,setSelected]=useState<string|null>(null);
 const [cursor,setCursor]=useState<string|undefined>(),[reload,setReload]=useState(0);
 const [newRole,setNewRole]=useState<"teacher"|"admin"|null>(null),[editing,setEditing]=useState(false);
 const [busy,setBusy]=useState(false),[problem,setProblem]=useState(""),[feedback,setFeedback]=useState("");
 useEffect(()=>{
  const ctrl=new AbortController();
  requestApi("/school/staff?limit=100",list,{signal:ctrl.signal})
   .then(({data,meta})=>{setPeople(data);setCursor(meta?.nextCursor);setSelected(current=>current??data[0]?.id??null);})
   .catch(e=>{if(!ctrl.signal.aborted)setProblem(err(locale,e));});
  return()=>ctrl.abort();
 },[reload]);
 const visible=useMemo(()=>people.filter(person=>person.displayName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())||person.workEmail?.toLowerCase().includes(query.trim().toLowerCase())),[people,query]);
 const chosen=people.find(person=>person.id===selected);
 const onSave=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!chosen)return;
  const form=new FormData(event.currentTarget);
  setBusy(true);setProblem("");setFeedback("");
  void cmd(`/school/staff/${chosen.id}`,"PATCH",{
    displayName:form.get("name"),role:chosen.role,titleAr:chosen.titleAr,titleDe:chosen.titleDe,
    workEmail:form.get("email")||null,workPhone:form.get("phone")||null,
    activeFrom:chosen.activeFrom,activeUntil:chosen.activeUntil,accountId:chosen.accountId,revision:chosen.revision,
  },staffSchema).then(updated=>{
    setPeople(prev=>prev.map(item=>item.id===updated.id?updated:item));
    setEditing(false);setFeedback(t.saved);
  }).catch(e=>setProblem(err(locale,e))).finally(()=>setBusy(false));
 };
 return <main className={css.root}>
  <div className={css.heading}>
    <h1 className={css.title}>{t.heading}</h1>
    <div className={css.actions}>
      <button className={css.primary} onClick={()=>{setNewRole("teacher");setEditing(false);}}>{t.addTeacher}</button>
      {canCreateAdmin&&<button className={css.secondary} onClick={()=>{setNewRole("admin");setEditing(false);}}>{t.addAdmin}</button>}
    </div>
  </div>
  <div className={css.toolbar}>
    <div className={css.counts}>
      <span className={css.counter}><strong>{people.filter(x=>x.role==="teacher").length}</strong>{t.teachers}</span>
      <span className={css.counter}><strong>{people.filter(x=>x.role==="admin").length}</strong>{t.admins}</span>
      <span className={css.counter}><strong>{people.length}</strong>{t.all}</span>
    </div>
  </div>
  {newRole&&<DirectStaffForm locale={locale} role={newRole} canCreateAdmin={canCreateAdmin}
    saved={()=>{setNewRole(null);setReload(value=>value+1);}} cancel={()=>setNewRole(null)}/>}
  <div className={css.grid}>
    <section className={css.card}>
      <div className={css.cardHeader}><h2 className={css.cardTitle}>{t.list}</h2></div>
      <label className={css.field}>{t.search}
        <input className={css.input} value={query} onChange={e=>setQuery(e.target.value)} type="search" aria-label={t.search}/>
      </label>
      <ul className={css.list}>{visible.map(person=><li key={person.id}>
        <button type="button" className={css.person} aria-pressed={selected===person.id}
          onClick={()=>{setSelected(person.id);setEditing(false);setFeedback("");}}>
          <span className={css.avatar} aria-hidden="true">{initials(person.displayName)}</span>
          <span className={css.personInfo}>
            <bdi className={css.personName}>{person.displayName}</bdi>
            <span className={css.personMeta}>{person.workEmail??(person.accountId?"":t.notLinked)}</span>
          </span>
          <span className={css.role}>{person.role==="teacher"?t.teacher:t.admin}</span>
        </button>
      </li>)}</ul>
      {visible.length===0&&<p className={css.empty}>{t.noResults}</p>}
      {cursor&&<button type="button" className={css.secondary} onClick={()=>{
        void requestApi(`/school/staff?limit=100&cursor=${cursor}`,list).then(({data,meta})=>{
          setPeople(current=>[...current,...data]);setCursor(meta?.nextCursor);
        }).catch(e=>setProblem(err(locale,e)));
      }}>{t.more}</button>}
    </section>
    <aside className={css.card}>
      <div className={css.cardHeader}><h2 className={css.cardTitle}>{t.details}</h2></div>
      {chosen&&<div className={css.stack}>
        <div className={css.actions}><span className={css.avatar}>{initials(chosen.displayName)}</span>
          <div className={css.personInfo}><strong><bdi>{chosen.displayName}</bdi></strong>
            <span className={css.smallLabel}>{chosen.role==="teacher"?t.teacher:t.admin} · {chosen.disabled?t.inactive:t.active}</span>
          </div></div>
        {editing?<form className={css.stack} onSubmit={onSave}>
          <label className={css.field}>{t.name}<input name="name" className={css.input} defaultValue={chosen.displayName} required maxLength={200}/></label>
          <label className={css.field}>{t.email}<input name="email" className={css.input} type="email" defaultValue={chosen.workEmail??""}/></label>
          <label className={css.field}>{t.phone}<input name="phone" className={css.input} type="tel" defaultValue={chosen.workPhone??""}/></label>
          <div className={css.actions}>
            <button className={css.primary} disabled={busy}>{t.save}</button>
            <button type="button" className={css.secondary} onClick={()=>setEditing(false)}>{t.cancel}</button>
          </div>
        </form>:<>
          {chosen.workEmail&&<p className={css.muted}><bdi>{chosen.workEmail}</bdi></p>}
          {chosen.workPhone&&<p className={css.muted}><bdi>{chosen.workPhone}</bdi></p>}
          <p className={css.muted}>{t.activeFrom}: <bdi>{chosen.activeFrom}</bdi></p>
          {chosen.activeUntil&&<p className={css.muted}>{t.activeUntil}: <bdi>{chosen.activeUntil}</bdi></p>}
          {(chosen.role==="teacher"||canCreateAdmin)&&<button type="button" className={css.secondary} onClick={()=>setEditing(true)}>{t.edit}</button>}
          {chosen.role==="teacher"&&<Link className={css.smallButton} href={`/${locale}/school/more/classes`}>{t.classLink}</Link>}
        </>}
      </div>}
      {feedback&&<p className={css.success} role="status">{feedback}</p>}
      {problem&&<p className={css.error} role="alert">{problem}</p>}
    </aside>
  </div>
 </main>;
}
