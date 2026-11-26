"use client";
import Link from "next/link";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useSearchParams} from "next/navigation";
import {z} from "zod";
import {familyGroupSummary,familyGroupDetail,familyGroupEdit,familyGroupAttach,familyGroupChildInput,familyGroupGuardianInput,familySituation,familyRelationship,guardianSchema,studentSchema,type Locale,type Guardian,type Student} from "@madrasty/contracts";
import {requestApi,ApiResponseError} from "@/api/client";
import {useAdminCommand} from "@/api/commands";
import {dictionary,localizedError} from "@/i18n";
import {AsyncSurface} from "@/ui/AsyncSurface";
import {Icon} from "@/ui/Icon";
import {ExistingPersonPicker} from "./FamilyPeople";
import {useClasses,YearPicker,ClassPicker,situationNames,relationNames} from "./NewFamily";

type Group=z.infer<typeof familyGroupDetail>;
type Summary=z.infer<typeof familyGroupSummary>;
type Relation=z.infer<typeof familyRelationship>;
const summaries=familyGroupSummary.array();
const copy={
 de:{search:"Familie, Kind oder Name suchen",children:"Kinder",adults:"Sorgeberechtigte",more:"Weitere Ergebnisse",empty:"Noch keine Familien angelegt.",name:"Familienname",situation:"Familiensituation (optional)",edit:"Familie bearbeiten",addChild:"Kind zur Familie hinzufügen",addAdult:"Person zur Familie hinzufügen",existing:"Vorhandenen Datensatz zuordnen",create:"Neuen Datensatz anlegen",choose:"Person auswählen",attach:"Zuordnung speichern",memberHint:"Die Familienzuordnung allein gewährt keinen Zugriff auf Kinderdaten.",newAdultHint:"Die neue Person erhält noch keinen Zugriff. Legen Sie die Verknüpfungen anschließend im Profil fest.",access:"Zugriffsrechte",none:"Kein Zugang",pending:"Zur Prüfung",approved:"Bestätigt",revoked:"Widerrufen",relationship:"Beziehung zum Kind",namePerson:"Name",birth:"Geburtsdatum (optional)",email:"E-Mail-Adresse (optional)",phone:"Telefonnummer",address:"Notfalladresse",language:"Sprache für Mitteilungen",invalid:"Bitte prüfen Sie die Angaben und bestätigen Sie mindestens einen Zugang.",active:"Konto aktiviert",inactive:"Kein aktives Konto",payer:"Zahlungsverantwortung",save:"Speichern",cancel:"Abbrechen",noLinks:"Keine bestätigten Verknüpfungen",notAssigned:"Noch keine Klasse"},
 ar:{search:"بحث باسم الأسرة أو الطفل أو ولي الأمر",children:"الأطفال",adults:"أولياء الأمور",more:"نتائج إضافية",empty:"لم تُسجّل أسر بعد.",name:"اسم الأسرة",situation:"الوضع الأسري (اختياري)",edit:"تعديل الأسرة",addChild:"إضافة طفل للأسرة",addAdult:"إضافة ولي أمر للأسرة",existing:"ربط سجل موجود",create:"إنشاء سجل جديد",choose:"اختر الشخص",attach:"حفظ العضوية",memberHint:"العضوية في الأسرة وحدها لا تمنح الوصول إلى بيانات الأطفال.",newAdultHint:"الشخص الجديد ليس له صلاحية وصول بعد. حدد الروابط من ملفه بعد الحفظ.",access:"صلاحيات الوصول",none:"بدون وصول",pending:"بانتظار المراجعة",approved:"معتمد",revoked:"ملغى",relationship:"العلاقة بالطفل",namePerson:"الاسم",birth:"تاريخ الميلاد (اختياري)",email:"البريد الإلكتروني (اختياري)",phone:"رقم الهاتف",address:"عنوان الطوارئ",language:"لغة التواصل",invalid:"راجع البيانات واعتمد صلاحية واحدة على الأقل.",active:"حساب مفعّل",inactive:"لا يوجد حساب مفعّل",payer:"مسؤول السداد",save:"حفظ",cancel:"إلغاء",noLinks:"لا توجد روابط معتمدة",notAssigned:"بدون فصل"},
} as const;
const err=(locale:Locale,e:unknown)=>e instanceof ApiResponseError?localizedError(locale,e.messageKey):dictionary(locale)["error.unavailable"];
export function FamilyGroupList({locale,select}:{locale:Locale;select:(id:string)=>void}){
 const t=copy[locale],params=useSearchParams(),saved=params.get("familyQuery")??"";
 const [query,setQuery]=useState(saved),[filter,setFilter]=useState(saved),[rows,setRows]=useState<Summary[]>(),[cursor,setCursor]=useState<string>(),[error,setError]=useState(""),[busy,setBusy]=useState(false),[generation,refresh]=useState(0);
 const pending=useRef<AbortController|null>(null);
 useEffect(()=>{const timer=setTimeout(()=>{const q=query.trim();setFilter(q);const url=new URL(location.href);if(q)url.searchParams.set("familyQuery",q);else url.searchParams.delete("familyQuery");history.replaceState(null,"",url);},250);return()=>clearTimeout(timer);},[query]);
 useEffect(()=>{pending.current?.abort();const ctrl=new AbortController();pending.current=ctrl;setRows(undefined);setCursor(undefined);setError("");setBusy(false);
 requestApi(`/school/families?query=${encodeURIComponent(filter)}`,summaries,{signal:ctrl.signal}).then(result=>{if(!ctrl.signal.aborted){setRows(result.data);setCursor(result.meta?.nextCursor);}}).catch(e=>{if(!ctrl.signal.aborted)setError(err(locale,e));});return()=>ctrl.abort();},[filter,generation,locale]);
 useEffect(()=>()=>pending.current?.abort(),[]);
 async function more(){if(!cursor||busy)return;pending.current?.abort();const ctrl=new AbortController();pending.current=ctrl;setBusy(true);setError("");try{const result=await requestApi(`/school/families?query=${encodeURIComponent(filter)}&cursor=${encodeURIComponent(cursor)}`,summaries,{signal:ctrl.signal});if(!ctrl.signal.aborted){setRows(old=>[...(old??[]),...result.data]);setCursor(result.meta?.nextCursor);}}catch(e){if(!ctrl.signal.aborted)setError(err(locale,e));}finally{if(!ctrl.signal.aborted)setBusy(false);}}
 return <div className="family-directory-list">
  <div className="family-search"><input type="search" aria-label={t.search} placeholder={t.search} value={query} onChange={e=>setQuery(e.target.value)} maxLength={120}/></div>
  <AsyncSurface locale={locale} state={error&&!rows?{kind:"error",message:error,retry:()=>refresh(v=>v+1)}:!rows?{kind:"initialLoading"}:!rows.length?{kind:"empty",filtered:Boolean(filter),message:filter?undefined:t.empty}:{kind:"ready",content:<ul className="group-list family-list">{rows.map(r=><li key={r.id}><button className="family-list-row" type="button" onClick={()=>select(r.id)}><span className="family-avatar"><Icon name="students"/></span><span className="family-row-label"><strong><bdi>{r.displayName}</bdi></strong><small>{r.childCount} {t.children} · {r.guardianCount} {t.adults}</small></span><Icon name="chevron"/></button></li>)}</ul>}}/>
  {error&&rows&&<p role="alert">{error}</p>}{cursor&&<button type="button" className="plain-button" disabled={busy} onClick={()=>void more()}>{t.more}</button>}
 </div>;
}
export function FamilyGroupProfile({locale,id,financeIssue=false,initialAction,openPerson}:{locale:Locale;id:string;financeIssue?:boolean;initialAction?:"student"|"guardian";openPerson:(kind:"students"|"guardians",id:string)=>void}){
 const t=copy[locale],command=useAdminCommand();
 const [group,setGroup]=useState<Group>(),[generation,refresh]=useState(0),[error,setError]=useState(""),[busy,setBusy]=useState(false),[view,setView]=useState<"edit"|"student"|"guardian"|undefined>(initialAction),[mode,setMode]=useState<"existing"|"new">("existing"),[selected,setSelected]=useState<Student|Guardian>();
 useEffect(()=>{const ctrl=new AbortController();setGroup(undefined);setError("");requestApi(`/school/families/${id}`,familyGroupDetail,{signal:ctrl.signal}).then(({data})=>{if(!ctrl.signal.aborted)setGroup(data);}).catch(e=>{if(!ctrl.signal.aborted)setError(err(locale,e));});return()=>ctrl.abort();},[id,generation,locale]);
 const done=()=>{setView(undefined);setSelected(undefined);refresh(v=>v+1);};
 const run=async(work:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError("");try{await work();done();}catch(e){setError(err(locale,e));}finally{setBusy(false);}};
 const start=(v:"edit"|"student"|"guardian")=>{setView(v);setMode("existing");setSelected(undefined);setError("");};
 if(!group)return <AsyncSurface locale={locale} state={error?{kind:"error",message:error,retry:()=>refresh(v=>v+1)}:{kind:"initialLoading"}}/>;
 return <div className="family-profile">
  <header className="family-profile-header"><span className="family-avatar"><Icon name="students"/></span><div><h1><bdi>{group.displayName}</bdi></h1><p>{group.childCount} {t.children} · {group.guardianCount} {t.adults}</p></div><button type="button" className="plain-button" onClick={()=>start("edit")}>{t.edit}</button></header>
  {view==="edit"&&<form className="auth-card auth-form family-detail-card" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const parsed=familyGroupEdit.safeParse({displayName:f.get("name"),situation:f.get("situation"),revision:group.revision});if(!parsed.success){setError(t.invalid);return;}void run(()=>command(`/school/families/${id}`,"PATCH",parsed.data,familyGroupDetail));}}>
   <label>{t.name}<input name="name" required maxLength={200} defaultValue={group.displayName}/></label>
   <label>{t.situation}<select name="situation" defaultValue={group.situation}>{familySituation.options.map(v=><option key={v} value={v}>{situationNames[locale][v]}</option>)}</select></label>
   <button className="primary-button" disabled={busy}>{t.save}</button><button type="button" className="plain-button" disabled={busy} onClick={()=>setView(undefined)}>{t.cancel}</button>
  </form>}
  <section className="auth-card family-detail-card"><h2>{t.children}</h2><ul className="group-list family-list">{group.children.map(child=><li key={child.id}><button type="button" className="family-list-row" onClick={()=>openPerson("students",child.id)}><span className="family-avatar"><Icon name="students"/></span><span className="family-row-label"><strong><bdi>{child.displayName}</bdi></strong><small><bdi>{child.studentNumber}</bdi></small></span><Icon name="chevron"/></button>
   {financeIssue&&<Link className="family-sub-action" href={`/${locale}/school/more/fee-settings?student=${child.id}`}>{t.payer}</Link>}</li>)}</ul>
   <button type="button" className="plain-button family-add-action" onClick={()=>start("student")}><Icon name="plus"/>{t.addChild}</button></section>
  <section className="auth-card family-detail-card"><h2>{t.adults}</h2><ul className="group-list family-list">{group.guardians.map(adult=><li key={adult.id}><button type="button" className="family-list-row" onClick={()=>openPerson("guardians",adult.id)}><span className="family-avatar"><Icon name="students"/></span><span className="family-row-label"><strong><bdi>{adult.displayName}</bdi></strong><small>{adult.linkedAccount?t.active:t.inactive}</small></span><Icon name="chevron"/></button></li>)}</ul><button type="button" className="plain-button family-add-action" onClick={()=>start("guardian")}><Icon name="plus"/>{t.addAdult}</button></section>
  {view&&view!=="edit"&&<section className="auth-card family-detail-card auth-form"><h2>{view==="student"?t.addChild:t.addAdult}</h2>
   <div className="family-segments" role="group" aria-label={view==="student"?t.addChild:t.addAdult}><button type="button" aria-pressed={mode==="existing"} onClick={()=>{setMode("existing");setSelected(undefined);}}>{t.existing}</button><button type="button" aria-pressed={mode==="new"} onClick={()=>setMode("new")}>{t.create}</button></div>
   {mode==="existing"?<><p className="family-hint">{t.memberHint}</p><ExistingPersonPicker locale={locale} kind={view} exclude={(view==="guardian"?group.guardians:group.children).map(p=>p.id)} select={setSelected}/>{selected&&<><strong><bdi>{selected.displayName}</bdi></strong><button type="button" className="primary-button" disabled={busy} onClick={()=>{const parsed=familyGroupAttach.parse({kind:view,personId:selected.id,revision:group.revision});void run(()=>command(`/school/families/${id}/members`,"POST",parsed,familyGroupDetail));}}>{t.attach}</button></>}</>:view==="student"?<GroupChild locale={locale} group={group} busy={busy} submit={input=>void run(()=>command(`/school/families/${id}/new-child`,"POST",input,studentSchema))}/>:<GroupGuardian locale={locale} group={group} busy={busy} submit={input=>void run(()=>command(`/school/families/${id}/new-guardian`,"POST",input,guardianSchema))}/>}
   <button type="button" className="plain-button" disabled={busy} onClick={()=>setView(undefined)}>{t.cancel}</button>
  </section>}
  <section className="auth-card family-detail-card"><h2>{t.access}</h2><p className="family-hint">{t.memberHint}</p>
    {group.links.length===0?<p>{t.noLinks}</p>:<ul className="group-list">{group.links.map(l=><li key={l.id}><button type="button" className="family-list-row" onClick={()=>openPerson("guardians",l.guardianId)}><span className="family-row-label"><strong><bdi>{l.studentName}</bdi></strong><small><bdi>{group.guardians.find(g=>g.id===l.guardianId)?.displayName}</bdi> · {relationNames[locale][l.relationship??"unspecified"]}</small><small>{t[l.state]}</small></span><Icon name="chevron"/></button></li>)}</ul>}
  </section>
  {error&&<p role="alert">{error}</p>}
 </div>;
}
function GroupChild({locale,group,busy,submit}:{locale:Locale;group:Group;busy:boolean;submit:(input:z.infer<typeof familyGroupChildInput>)=>void}){
 const t=copy[locale],school=useClasses(locale),[classId,setClass]=useState(""),[links,setLinks]=useState<Record<string,{state:"none"|"pending"|"approved";relationship:Relation}>>({}),[error,setError]=useState("");
 const value=(id:string)=>links[id]??{state:"none" as const,relationship:"unspecified" as const};
 return <form className="auth-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const guardianLinks=group.guardians.flatMap(g=>{const l=value(g.id);return l.state==="none"?[]:[{guardianId:g.id,relationship:l.relationship,approved:l.state==="approved"}];});const parsed=familyGroupChildInput.safeParse({displayName:f.get("name"),birthDate:f.get("birth")||null,classId:classId||null,guardianLinks,revision:group.revision});if(!parsed.success||guardianLinks.some(l=>l.relationship==="unspecified")){setError(t.invalid);return;}setError("");submit(parsed.data);}}>
  <label>{t.namePerson}<input name="name" required maxLength={200}/></label><label>{t.birth}<input name="birth" type="date" min="1900-01-01" max={new Date().toISOString().slice(0,10)}/></label>
  <YearPicker locale={locale} value={school.yearId} options={school.years} onChange={v=>{school.chooseYear(v);setClass("");}}/><ClassPicker locale={locale} classes={school.classes} disabled={!school.yearId} value={classId} onChange={setClass}/>
  {group.guardians.map(g=><div className="family-link-options" key={g.id}><strong><bdi>{g.displayName}</bdi></strong><label>{t.access}<select value={value(g.id).state} onChange={e=>setLinks(old=>({...old,[g.id]:{...value(g.id),state:e.target.value as "none"|"pending"|"approved"}}))}><option value="none">{t.none}</option><option value="pending">{t.pending}</option><option value="approved">{t.approved}</option></select></label>
   {value(g.id).state!=="none"&&<label>{t.relationship}<select value={value(g.id).relationship} onChange={e=>setLinks(old=>({...old,[g.id]:{...value(g.id),relationship:familyRelationship.parse(e.target.value)}}))}>{familyRelationship.options.map(r=><option value={r} key={r}>{relationNames[locale][r]}</option>)}</select></label>}</div>)}
  {school.problem&&<p role="alert">{school.problem}</p>}{error&&<p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{t.save}</button>
 </form>;
}
function GroupGuardian({locale,group,busy,submit}:{locale:Locale;group:Group;busy:boolean;submit:(input:z.infer<typeof familyGroupGuardianInput>)=>void}){
 const t=copy[locale],[error,setError]=useState("");
 return <form className="auth-form" onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const parsed=familyGroupGuardianInput.safeParse({displayName:f.get("name"),contactEmail:f.get("email")||null,contactPhone:f.get("phone")||null,birthDate:f.get("birth")||null,emergencyAddress:f.get("address")||null,correspondenceLocale:f.get("language"),revision:group.revision});if(!parsed.success){setError(t.invalid);return;}setError("");submit(parsed.data);}}>
  <p className="family-hint">{t.newAdultHint}</p><label>{t.namePerson}<input name="name" required maxLength={200}/></label><label>{t.email}<input name="email" type="email" dir="ltr"/></label><label>{t.phone}<input name="phone" type="tel" dir="ltr" maxLength={48}/></label><label>{t.birth}<input name="birth" type="date" min="1900-01-01" max={new Date().toISOString().slice(0,10)}/></label><label>{t.address}<textarea name="address" maxLength={500}/></label><label>{t.language}<select name="language" defaultValue={locale}><option value="ar">العربية</option><option value="de">Deutsch</option></select></label>{error&&<p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{t.save}</button>
 </form>;
}
