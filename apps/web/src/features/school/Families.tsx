"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  childLinkSchema, childSummarySchema, createGuardianInput, createStudentInput, guardianDetailSchema,
  guardianSchema, studentSchema, studentDetailSchema, familyOverviewSchema, schoolClassSchema, updateGuardianInput, updateStudentInput,
  type ChildLink, type Guardian, type Locale, type Student,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { GuardianInviteManager } from "@/features/identity/GuardianInviteManager";
import { ScopeSheet } from "@/ui/Shell";
import { NewFamilyForm, AddFamilyChildForm, relationNames } from "./NewFamily";
import { FamilyGroupList, FamilyGroupProfile } from "./FamilyGroups";
import { Icon } from "@/ui/Icon";
import { readDirectorySearch, writeDirectorySearch } from "./directory-filter-state";

const copy = {
  ar: {
    family: "الأسر", pupil: "طالب", adult: "ولي أمر", createPupil: "إضافة طالب", createAdult: "إضافة ولي أمر",
    name: "الاسم", number: "رقم الطالب", email: "البريد الإلكتروني", phone: "رقم الهاتف", language: "لغة المراسلات",
    query: "بحث بالاسم أو رقم الطالب", guardianQuery: "بحث باسم ولي الأمر", search: "بحث", state: "الحالة", active: "نشط",
    inactive: "غير نشط", save: "حفظ", moreRows: "نتائج إضافية", attached: "حساب مفعّل",
    emailHelp: "تغيير بريد الحساب المفعّل من إعدادات أمان الحساب.", links: "روابط الأبناء",
    pending: "بانتظار المراجعة", approved: "معتمد", revoked: "ملغى", reason: "السبب",
    approve: "اعتماد الرابط", revoke: "إلغاء الرابط", newLink: "ربط طالب", submitLink: "إرسال الرابط للمراجعة",
    immediate: "اعتماد الرابط الآن", chosenChild: "الطفل المختار",
  },
  de: {
    family: "Familien", pupil: "Schüler", adult: "Sorgeberechtigte", createPupil: "Schüler hinzufügen", createAdult: "Sorgeberechtigte hinzufügen",
    name: "Name", number: "Schülernummer", email: "E-Mail-Adresse", phone: "Telefonnummer", language: "Sprache für Mitteilungen",
    query: "Nach Name oder Schülernummer suchen", guardianQuery: "Nach Name suchen", search: "Suchen", state: "Status", active: "Aktiv",
    inactive: "Inaktiv", save: "Speichern", moreRows: "Weitere Ergebnisse", attached: "Konto aktiviert",
    emailHelp: "Die E-Mail-Adresse eines aktiven Kontos wird in den Sicherheitseinstellungen geändert.", links: "Verknüpfte Kinder",
    pending: "Zur Prüfung", approved: "Bestätigt", revoked: "Widerrufen", reason: "Grund",
    approve: "Verknüpfung bestätigen", revoke: "Verknüpfung widerrufen", newLink: "Kind zuordnen",
    submitLink: "Zur Prüfung einreichen", immediate: "Verknüpfung sofort bestätigen", chosenChild: "Ausgewähltes Kind",
  },
} as const;

type Mode = "students" | "guardians";
type Resource<T> = { data?: T; error?: unknown };
function useRead<T>(path: `/${string}` | null, schema: z.ZodType<T>) {
  const [result, setResult] = useState<Resource<T>>({});
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    setResult({});
    if (!path) return;
    const controller = new AbortController();
    requestApi(path, schema, { signal: controller.signal }).then(({ data }) => {if(!controller.signal.aborted)setResult({data});})
      .catch((error) => { if (!controller.signal.aborted) setResult({ error }); });
    return () => controller.abort();
  }, [path, schema, generation]);
  return { ...result, retry: () => { setResult({}); setGeneration(generation + 1); } };
}
function errorText(locale: Locale, error: unknown) {
  return error instanceof ApiResponseError ? localizedError(locale, error.messageKey) : dictionary(locale)["error.unavailable"];
}
function validation() { return new ApiResponseError(422, "validation", "error.validation"); }

const studentList = studentSchema.array();
const guardianList = guardianSchema.array();
const childrenSchema = childSummarySchema.array();
const studentReader = z.union([studentList, guardianList]);

const recordId = z.uuid();

type FamilyAccess={financeIssue:boolean;financeRead:boolean;oversight:boolean;stops:boolean};
const classList=schoolClassSchema.array();
export function Families({locale,access}:{locale:Locale;access:FamilyAccess}){
 const ar=locale==="ar",text=copy[locale],search=useSearchParams();
 const guardian=recordId.safeParse(search.get("guardian")).data,student=recordId.safeParse(search.get("student")).data;
 const group=recordId.safeParse(search.get("family")).data,fromFamily=recordId.safeParse(search.get("fromFamily")).data;
 const initialLink=recordId.safeParse(search.get("link")).data,forStudent=recordId.safeParse(search.get("forStudent")).data;
 const creating=["family","guardian","student"].includes(search.get("add")??"");
 const mode:Mode=guardian||group||forStudent||["guardians","legacy"].includes(search.get("view")??"")?"guardians":"students";
 const target=creating?undefined:mode==="students"?student:guardian;
 const legacy=search.get("view")==="legacy"||Boolean(forStudent);
 const action=search.get("familyAction")==="child"?"student":search.get("familyAction")==="guardian"?"guardian":undefined;
 const overview=useRead("/school/families/summary",familyOverviewSchema);
 const [menu,setMenu]=useState(false);
 function go(patch:Record<string,string|undefined>,replace=false){
   const url=new URL(window.location.href);
   for(const key of ["guardian","student","family","link","add","view","forStudent","fromFamily","familyAction"])url.searchParams.delete(key);
   for(const [key,value] of Object.entries(patch))if(value)url.searchParams.set(key,value);
   (replace?window.history.replaceState:window.history.pushState).call(window.history,null,"",url);
   setMenu(false);
   document.querySelector(".school-content")?.scrollTo(0,0);
 }
 const list=(next:Mode,legacyView=false)=>go({view:next==="students"?"students":legacyView?"legacy":"guardians"});
 const openGroup=(id:string)=>go({view:"guardians",family:id,familyAction:action==="student"?"child":action});
 const openPerson=(kind:Mode,id:string,replace=false)=>go({view:kind,guardian:kind==="guardians"?id:undefined,student:kind==="students"?id:undefined,forStudent:kind==="guardians"?forStudent:undefined,fromFamily:group??fromFamily},replace);
 const back=()=>fromFamily?openGroup(fromFamily):list(mode,legacy||Boolean(guardian&&!group));
 const backButton=<button type="button" className="family-back plain-button" onClick={back}><Icon name="back"/>{ar?"رجوع":"Zurück"}</button>;
 if(creating)return <div className="family-workspace">{backButton}<NewFamilyForm locale={locale} financeIssue={access.financeIssue} cancel={()=>list("guardians")} saved={(id,familyId)=>{overview.retry();if(familyId)go({view:"guardians",family:familyId},true);else openPerson("guardians",id,true);}}/></div>;
 if(group&&!target)return <div className="family-workspace">{backButton}<FamilyGroupProfile key={group} locale={locale} id={group} financeIssue={access.financeIssue} initialAction={action} openPerson={(kind,id)=>openPerson(kind,id)}/></div>;
 if(target)return <div className="family-workspace">{backButton}<RecordEditor locale={locale} mode={mode} target={target} key={mode+":"+target+":"+(forStudent??"")} initialLink={initialLink} forStudent={forStudent} access={access} saved={id=>{openPerson(mode,id,true);overview.retry();}}/></div>;
 return <div className="family-workspace">
   <header className="family-workspace-heading"><h1>{ar?"الطلاب والأسر":"Schüler und Familien"}</h1>
     <button className="family-primary-icon" type="button" aria-label={ar?"إضافة":"Hinzufügen"} aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><Icon name={menu?"close":"plus"}/></button>
   </header>
   {menu&&<div className="family-action-menu" role="group" aria-label={ar?"إضافة":"Hinzufügen"}>
     <button type="button" className="family-list-row" onClick={()=>go({view:"guardians",add:"family"})}><span>{ar?"إضافة أسرة جديدة":"Neue Familie hinzufügen"}</span><Icon name="chevron"/></button>
     <button type="button" className="family-list-row" onClick={()=>go({view:"guardians",familyAction:"child"})}><span>{ar?"إضافة طفل لأسرة":"Kind zur Familie hinzufügen"}</span><Icon name="chevron"/></button>
     <button type="button" className="family-list-row" onClick={()=>go({view:"guardians",familyAction:"guardian"})}><span>{ar?"إضافة ولي أمر لأسرة":"Person zur Familie hinzufügen"}</span><Icon name="chevron"/></button>
     <Link className="family-list-row" href={`/${locale}/school/students/import`}><span>{ar?"استيراد الأسر":"Familien importieren"}</span><Icon name="chevron"/></Link>
   </div>}
   {overview.data&&<div className="family-metrics"><button type="button" onClick={()=>list("students")}><small>{ar?"الطلاب النشطون":"Aktive Schüler"}</small><strong>{overview.data.activeStudents}</strong></button><button type="button" onClick={()=>list("guardians")}><small>{text.family}</small><strong>{overview.data.families}</strong></button></div>}
   <div className="family-segments" role="group" aria-label={ar?"نوع السجل":"Verzeichnis"}><button type="button" aria-pressed={mode==="students"} onClick={()=>list("students")}>{dictionary(locale).students}</button><button type="button" aria-pressed={mode==="guardians"} onClick={()=>list("guardians")}>{text.family}</button></div>
   {action&&<p className="family-hint">{ar?"اختر الأسرة أولًا.":"Wählen Sie zuerst die Familie aus."}</p>}
   {mode==="students"?<RecordPicker locale={locale} mode="students" select={id=>openPerson("students",id)} persistSearch/>:legacy?<><button type="button" className="family-back plain-button" onClick={()=>list("guardians")}><Icon name="back"/>{text.family}</button><h2>{forStudent?text.adult:ar?"أولياء أمور بدون أسرة مسجلة":"Nicht zugeordnete Sorgeberechtigte"}</h2><RecordPicker locale={locale} mode="guardians" select={id=>openPerson("guardians",id)} persistSearch ungrouped={!forStudent}/></>:<>
      <FamilyGroupList locale={locale} select={openGroup}/>
      <button className="plain-button family-legacy-link" type="button" onClick={()=>list("guardians",true)}>{ar?"أولياء أمور بدون أسرة مسجلة":"Nicht zugeordnete Sorgeberechtigte"} {overview.data&&<small>({overview.data.ungroupedGuardians})</small>}<Icon name="chevron"/></button>
    </>}
    <Link className="family-import-link plain-button" href={`/${locale}/school/students/import`}>{ar?"استيراد الأسر":"Familien importieren"}</Link>
 </div>;
}
function RecordPicker({locale,mode,select,persistSearch=false,ungrouped=false}:{locale:Locale;mode:Mode;select:(id:string)=>void;persistSearch?:boolean;ungrouped?:boolean}){
 const params=useSearchParams(),stored=persistSearch?readDirectorySearch(params,mode):"",ar=locale==="ar",text=copy[locale];
 const [query,setQuery]=useState(stored),[filter,setFilter]=useState(stored),[stateFilter,setStateFilter]=useState(persistSearch?params.get("studentState")??"":""),[classFilter,setClassFilter]=useState(persistSearch?params.get("studentClass")??"":"");
 const [showFilters,setShowFilters]=useState(Boolean(stateFilter||classFilter)),[state,setState]=useState<{rows?:(Student|Guardian)[];next?:string;error?:unknown}>({}),[generation,setGeneration]=useState(0),[busy,setBusy]=useState(false),[moreError,setMoreError]=useState("");
 const pending=useRef<AbortController|null>(null),classes=useRead(mode==="students"&&showFilters?"/school/classes?limit=100":null,classList);
 const path=`/school/${mode}?sort=name&query=${encodeURIComponent(filter)}${mode==="students"&&stateFilter?"&state="+encodeURIComponent(stateFilter):""}${mode==="students"&&classFilter?"&classId="+encodeURIComponent(classFilter):""}${ungrouped?"&ungrouped=true":""}` as const;
 useEffect(()=>{const timeout=setTimeout(()=>{setFilter(query.trim());if(persistSearch){const url=new URL(window.location.href);url.search=writeDirectorySearch(url.searchParams,mode,query).toString();window.history.replaceState(null,"",url);}},250);return()=>clearTimeout(timeout);},[query,mode,persistSearch]);
 function setFilterValue(key:"studentState"|"studentClass",value:string){(key==="studentState"?setStateFilter:setClassFilter)(value);if(persistSearch){const url=new URL(window.location.href);if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);history.replaceState(null,"",url);}}
 useEffect(()=>{pending.current?.abort();const ctrl=new AbortController();pending.current=ctrl;setState({});setBusy(false);setMoreError("");
 requestApi(path,studentReader,{signal:ctrl.signal}).then(({data,meta})=>{if(!ctrl.signal.aborted)setState({rows:data,next:meta?.nextCursor});}).catch(error=>{if(!ctrl.signal.aborted)setState({error});});return()=>ctrl.abort();},[path,generation]);
 useEffect(()=>()=>pending.current?.abort(),[]);
 const retry=()=>setGeneration(v=>v+1);
 async function more(){if(!state.next||busy)return;pending.current?.abort();const ctrl=new AbortController();pending.current=ctrl;setBusy(true);setMoreError("");try{const result=await requestApi(`${path}&cursor=${encodeURIComponent(state.next)}`,studentReader,{signal:ctrl.signal});if(!ctrl.signal.aborted)setState(old=>({rows:[...(old.rows??[]),...result.data],next:result.meta?.nextCursor}));}catch(error){if(!ctrl.signal.aborted)setMoreError(errorText(locale,error));}finally{if(!ctrl.signal.aborted)setBusy(false);}}
 const hint=mode==="students"?text.query:text.guardianQuery;
 return <div className="family-directory-list">
   <div className="family-search"><input type="search" value={query} aria-label={hint} placeholder={hint} maxLength={120} onChange={e=>setQuery(e.target.value)}/>
   {mode==="students"&&<button type="button" className="plain-button" aria-expanded={showFilters} onClick={()=>setShowFilters(v=>!v)}>{ar?"تصفية":"Filter"}</button>}</div>
   {mode==="students"&&showFilters&&<div className="family-filter-panel auth-form"><label>{text.state}<select value={stateFilter} onChange={e=>setFilterValue("studentState",e.target.value)}><option value="">{ar?"الكل":"Alle"}</option><option value="active">{text.active}</option><option value="inactive">{text.inactive}</option></select></label>
     <label>{ar?"الفصل":"Klasse"}<select value={classFilter} onChange={e=>setFilterValue("studentClass",e.target.value)}><option value="">{ar?"الكل":"Alle"}</option><option value="none">{ar?"بدون فصل":"Ohne Klasse"}</option>{classes.data?.map(c=><option key={c.id} value={c.id}>{c.code} · {ar?c.nameAr:c.nameDe}</option>)}</select></label>{classes.error!=null&&<button className="plain-button" type="button" onClick={classes.retry}>{ar?"إعادة تحميل الفصول":"Klassen neu laden"}</button>}</div>}
   <AsyncSurface locale={locale} state={state.error?{kind:"error",retry,message:errorText(locale,state.error)}:state.rows?state.rows.length?{kind:"ready",content:<ul className="group-list family-list">{state.rows.map(row=><li key={row.id}><button type="button" className="family-list-row" onClick={()=>select(row.id)}><span className="family-avatar"><bdi>{row.displayName.slice(0,1)}</bdi></span><span className="family-row-label"><strong><bdi>{row.displayName}</bdi></strong>{"studentNumber" in row?<><small><bdi>{row.studentNumber}</bdi> · {row.currentClass?(ar?row.currentClass.nameAr:row.currentClass.nameDe):(ar?"بدون فصل":"Ohne Klasse")}</small><small>{text[row.state]}</small></>:<small>{row.linkedAccount?text.attached:(ar?"لا يوجد حساب مفعّل":"Kein aktives Konto")}</small>}</span><Icon name="chevron"/></button></li>)}</ul>}:{kind:"empty",filtered:Boolean(filter||stateFilter||classFilter),message:filter||stateFilter||classFilter?undefined:ar?"لا توجد سجلات.":"Keine Einträge vorhanden."}:{kind:"initialLoading"}}/>
   {moreError&&<p role="alert">{moreError}</p>}{state.next&&<button className="plain-button" type="button" disabled={busy} onClick={()=>void more()}>{text.moreRows}</button>}
 </div>;
}

const recordSchema = z.union([studentDetailSchema, guardianDetailSchema]);
function RecordEditor({ locale, mode, target, initialLink, forStudent, saved,access }: {
  locale: Locale; mode: Mode; target: string; initialLink?:string; forStudent?:string; saved: (id: string) => void; access:FamilyAccess;
}) {
  const reload = useRead(target === "new" ? null : `/school/${mode}/${target}`, recordSchema);
  const text = copy[locale];
  return (
    <section className="auth-card family-detail-card family-person-profile">
      <header className="family-profile-header"><span className="family-avatar"><Icon name="students"/></span><div><h1><bdi>{reload.data?.displayName??(mode==="students"?text.pupil:text.adult)}</bdi></h1><p>{mode==="students"?text.pupil:text.adult}</p></div></header>
      {target === "new" || reload.data ? (
        <ProfileForm key={reload.data?.revision ?? 0} locale={locale} mode={mode} record={reload.data}
          saved={(id) => { saved(id); if (id === target) reload.retry(); }} />
      ) : <AsyncSurface locale={locale} state={reload.error
        ? { kind: "error", retry: reload.retry, message: errorText(locale, reload.error) } : { kind: "initialLoading" }} />}
      {reload.data?.familyGroups?.length?<section className="auth-form"><h2>{text.family}</h2><ul className="group-list family-list">{reload.data.familyGroups.map(f=><li key={f.id}><Link className="family-list-row" href={`/${locale}/school/students?view=guardians&family=${f.id}`}><span><bdi>{f.displayName}</bdi></span><Icon name="chevron"/></Link></li>)}</ul></section>:null}
      {reload.data && "studentNumber" in reload.data && <section className="auth-form">
        <h2>{text.adult}</h2>
        <ul className="group-list family-list">{reload.data.guardianRelationships?.map(l=><li key={l.id}><Link className="family-list-row" href={`/${locale}/school/students?view=guardians&guardian=${l.guardianId}&link=${l.id}`}><span className="family-row-label"><strong><bdi>{l.guardianName}</bdi></strong><small>{relationNames[locale][l.relationship??"unspecified"]} · {text[l.state]}</small></span><Icon name="chevron"/></Link></li>)}</ul>
        <div className="family-profile-actions">
        <Link className="plain-button" href={`/${locale}/school/students?view=guardians&forStudent=${target}`}>
          {locale === "ar" ? "اربط بولي أمر" : "Sorgeberechtigte zuordnen"}
        </Link>
        <Link className="plain-button" href={`/${locale}/school/more/classes?student=${target}`}>
          {locale === "ar" ? "سكّن في فصل" : "In eine Klasse einschreiben"}
        </Link>
        {access.financeIssue&&<Link className="plain-button" href={`/${locale}/school/more/fee-settings?student=${target}`}>{locale==="ar"?"مسؤول السداد":"Zahlungsverantwortung"}</Link>}
        {access.financeRead&&<Link className="plain-button" href={`/${locale}/school/more/invoices?student=${target}`}>{locale==="ar"?"الفواتير والمدفوعات":"Rechnungen"}</Link>}
        {access.oversight&&reload.data.currentClass&&<Link className="plain-button" href={`/${locale}/school/more/oversight?class=${reload.data.currentClass.id}&student=${target}`}>{locale==="ar"?"ملف المتابعة":"Schülerakte"}</Link>}
        {access.stops&&<Link className="plain-button" href={`/${locale}/school/more/enrollment-stops?student=${target}`}>{locale==="ar"?"فترات التوقف":"Teilnahmepausen"}</Link>}
        </div>
      </section>}
      {reload.data && "links" in reload.data && <Relationships locale={locale} record={reload.data} initialLink={initialLink}
        forStudent={forStudent} changed={reload.retry} />}
      {reload.data && "links" in reload.data && !reload.data.familyGroups?.length && <AddFamilyChildForm locale={locale} guardianId={reload.data.id} saved={reload.retry} />}
    </section>
  );
}

function ProfileForm({ locale, mode, record, saved }: {
  locale: Locale; mode: Mode; record?: z.infer<typeof recordSchema>; saved: (id: string) => void;
}) {
  const text = copy[locale];
  const command = useAdminCommand();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const isStudent = mode === "students";
  const child = record && "studentNumber" in record ? record : null;
  const adult = record && "contactEmail" in record ? record : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFailure("");
    const form = new FormData(event.currentTarget);
    const fields = { displayName: form.get("name"), revision: record?.revision,birthDate:form.get("birthDate")||null };
    try {
      if (isStudent) {
        const validated = (record ? updateStudentInput : createStudentInput).safeParse({ ...fields, state: form.get("state") });
        if (!validated.success) throw validation();
        const row = await command(record ? `/school/students/${record.id}` : "/school/students",
          record ? "PATCH" : "POST", validated.data, studentSchema);
        saved(row.id);
      } else {
        const validated = (record ? updateGuardianInput : createGuardianInput).safeParse({
          ...fields, contactEmail: form.get("email") || null, contactPhone: form.get("phone") || null,
          correspondenceLocale: form.get("language"),emergencyAddress:form.get("emergencyAddress")||null,
        });
        if (!validated.success) throw validation();
        const row = await command(record ? `/school/guardians/${record.id}` : "/school/guardians",
          record ? "PATCH" : "POST", validated.data, guardianSchema);
        saved(row.id);
      }
    } catch (error) { setFailure(errorText(locale, error)); }
    finally { setPending(false); }
  }
  return (
    <form className="auth-form" onSubmit={submit} aria-busy={pending}>
      {child && <p>{text.number} <bdi dir="ltr">{child.studentNumber}</bdi></p>}
      {adult?.linkedAccount && <p>{text.attached}. {text.emailHelp}</p>}
      <label>{text.name}<input name="name" defaultValue={record?.displayName} required maxLength={200} /></label>
      {child && <label>{text.state}<select name="state" defaultValue={child.state}>
        <option value="active">{text.active}</option><option value="inactive">{text.inactive}</option>
      </select></label>}
      {child&&<p>{locale==="ar"?"الفصل":"Klasse"} · {child.currentClass?(locale==="ar"?child.currentClass.nameAr:child.currentClass.nameDe):(locale==="ar"?"بدون فصل":"Ohne Klasse")}</p>}
      <label>{locale==="ar"?"تاريخ الميلاد":"Geburtsdatum"}<input name="birthDate" type="date" min="1900-01-01" max={new Date().toISOString().slice(0,10)} defaultValue={record?.birthDate??""}/></label>
      {adult&&<label>{locale==="ar"?"عنوان الطوارئ":"Notfalladresse"}<textarea name="emergencyAddress" maxLength={500} defaultValue={adult.emergencyAddress??""}/></label>}
      {!isStudent && <>
        <label>{text.email}<input name="email" type="email" dir="ltr" defaultValue={adult?.contactEmail ?? ""} readOnly={adult?.linkedAccount} /></label>
        <label>{text.phone}<input name="phone" type="tel" dir="ltr" defaultValue={adult?.contactPhone ?? ""} maxLength={48} /></label>
        <label>{text.language}<select name="language" defaultValue={adult?.correspondenceLocale ?? locale}>
          <option value="ar">العربية</option><option value="de">Deutsch</option>
        </select></label>
      </>}
      {failure && <p role="alert">{failure}</p>}
      <button className="primary-button" disabled={pending}>{pending ? dictionary(locale).pending : text.save}</button>
    </form>
  );
}

function Relationships({ locale, record, initialLink, forStudent, changed }: { locale: Locale; record: z.infer<typeof guardianDetailSchema>; initialLink?:string; forStudent?:string; changed: () => void }) {
  const text = copy[locale];
  const [pupil, setPupil] = useState(forStudent ?? "");
  const [picker, setPicker] = useState(Boolean(forStudent));
  const [immediate, setImmediate] = useState(false);
  const [action, setAction] = useState<{ link: ChildLink; type: "approve" | "revoke" }>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const command = useAdminCommand();
  const chosen = useRead(pupil && picker && !action ? `/school/students/${pupil}` : null, studentSchema);
  const selected = chosen.data?.id === pupil ? chosen.data : undefined;
  useEffect(()=>{
    if(initialLink) document.getElementById(`guardian-link-${initialLink}`)?.focus();
  },[initialLink]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get("reason");
    setError("");
    setPending(true);
    try {
      if (action) await command(`/school/guardian-links/${action.link.id}/${action.type}`, "POST", {
        revision: action.link.revision, reason,
      }, childLinkSchema);
      else await command("/school/guardian-links", "POST", {
        guardianId: record.id, studentId: pupil, ...(immediate && { approvalReason: reason }),
      }, childLinkSchema);
      setAction(undefined);
      setPupil("");
      setPicker(false);
      setImmediate(false);
      changed();
    } catch (cause) { setError(errorText(locale, cause)); }
    finally { setPending(false); }
  }
  return <section className="auth-form">
    <h3>{text.links}</h3>
    {record.links.some((link) => link.state === "approved") &&
      <GuardianInviteManager locale={locale} id={record.id} correspondenceLocale={record.correspondenceLocale} linkedAccount={record.linkedAccount} />}
    {record.links.length === 0 && <p>{dictionary(locale).empty}</p>}
    <ul className="group-list">
      {record.links.map((link) => <li key={link.id} className="group-row" id={`guardian-link-${link.id}`} tabIndex={link.id===initialLink?-1:undefined}>
        <bdi>{link.studentName}</bdi><bdi dir="ltr">{link.studentNumber}</bdi><span>{relationNames[locale][link.relationship??"unspecified"]} · {text[link.state]}</span>
        {link.state === "pending" && <button className="plain-button" disabled={pending}
          onClick={() => setAction({ link, type: "approve" })}>{text.approve}</button>}
        {link.state !== "revoked" && <button className="plain-button" disabled={pending}
          onClick={() => setAction({ link, type: "revoke" })}>{text.revoke}</button>}
      </li>)}
    </ul>
    <button type="button" className="plain-button" onClick={() => { setPicker(!picker); setAction(undefined); setPupil(""); setImmediate(false); }}>
      {picker ? dictionary(locale).close : text.newLink}
    </button>
    {picker && !action && <RecordPicker locale={locale} mode="students" select={id => { setPupil(id); setImmediate(false); }} />}
    {(action || picker && pupil) && <form key={action?.link.id ?? pupil} className="auth-form" onSubmit={submit} aria-busy={pending}>
      {action && <p><bdi>{action.link.studentName}</bdi> · {text[action.type]}</p>}
      {!action && selected && <p>{text.chosenChild}: <bdi>{selected.displayName}</bdi> · <bdi dir="ltr">{selected.studentNumber}</bdi></p>}
      {!action && chosen.error != null && <p role="alert">{errorText(locale, chosen.error)}</p>}
      {!action && <label className="access-check"><input type="checkbox" checked={immediate} onChange={(event) => setImmediate(event.target.checked)} />{text.immediate}</label>}
      {(action || immediate) && <label>{text.reason}<input name="reason" required maxLength={400} /></label>}
      {error && <p role="alert">{error}</p>}
      <button className="primary-button" disabled={pending || (!action && !selected)}>{action ? text[action.type] : immediate ? text.approve : text.submitLink}</button>
      {action && <button type="button" className="plain-button" onClick={() => setAction(undefined)}>{dictionary(locale).close}</button>}
    </form>}
  </section>;
}

export function Children({ locale, initialChild }: { locale: Locale; initialChild?:string }) {
  const search = useSearchParams();
  const chosen = recordId.safeParse(search.get("child")).data ?? initialChild;
  function setChosen(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("child",id);
    window.history.replaceState(null,"",url);
  }
  const available = useRead("/me/children?limit=100", childrenSchema);
  useEffect(() => {
    const onFocus = () => available.retry();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [available]);
  const selected = available.data?.find(({ id }) => id === chosen) ?? (!chosen ? available.data?.[0] : undefined);
  return <AsyncSurface locale={locale} state={available.error
    ? { kind: "error", retry: available.retry, message: errorText(locale, available.error) }
    : !available.data ? { kind: "initialLoading" } : !available.data.length ? { kind: "empty", message: locale==="ar"?"لا يوجد أبناء مرتبطون بحسابك حاليًا. تواصل مع إدارة المدرسة لربط بياناتهم.":"Mit Ihrem Konto sind derzeit keine Kinder verknüpft. Wenden Sie sich für die Zuordnung an die Schule." }
    : { kind: "ready", content: (
      <section className="auth-card guardian-child-panel">
        <ScopeSheet locale={locale} selectedId={selected?.id} choices={available.data.map((item) =>
          ({ id: item.id, label: item.displayName, detail: item.currentClass?.code ?? item.studentNumber }))} select={setChosen} />
        {selected ? <ChildDetail key={selected.id} locale={locale} id={selected.id} />
          : chosen && <AsyncSurface locale={locale} state={{kind:"forbidden"}}/>}
      </section>
    ) }} />;
}

function ChildDetail({ locale, id }: { locale: Locale; id: string }) {
  const record = useRead(`/me/children/${id}`, childSummarySchema);
  const school = `/${locale}/school`;
  function childLink(path: string, scope?: "child" | "student") {
    const search = new URLSearchParams({returnChild:id});
    if (scope) search.set(scope,id);
    return `${school}/${path}?${search}`;
  }
  return <AsyncSurface locale={locale} state={record.error
    ? (record.error instanceof ApiResponseError && [401,403,404].includes(record.error.status)
      ? { kind: "forbidden" } : { kind: "error", retry: record.retry, message: errorText(locale, record.error) })
    : record.data ? { kind: "ready", content: <>
      <h2><bdi>{record.data.displayName}</bdi></h2>
      <p>{copy[locale].number} <bdi dir="ltr">{record.data.studentNumber}</bdi></p>
      <div className="guardian-child-actions">
      <Link className="plain-button" href={childLink("more/timetable","child")}>
        {locale === "ar" ? "الجدول الأسبوعي" : "Wochenplan"}
      </Link>
      <Link className="plain-button" href={childLink("more/reports","child")}>{locale==="ar"?"التقرير الأكاديمي":"Lernbericht"}</Link>
      <Link className="plain-button" href={childLink("more/exams","child")}>{locale==="ar"?"الامتحانات":"Prüfungen"}</Link>
      <Link className="plain-button" href={childLink("more/evaluations","child")}>{locale==="ar"?"التقييمات الدورية":"Regelmäßige Beurteilungen"}</Link>
      <Link className="plain-button" href={childLink("more/homework","child")}>{locale==="ar"?"الواجبات":"Hausaufgaben"}</Link>
      <Link className="plain-button" href={childLink("more/academics","child")}>{locale==="ar"?"الأنشطة والتقييم":"Bewertete Aktivitäten"}</Link>
      <Link className="plain-button" href={childLink("more/curriculum","child")}>{locale==="ar"?"المواد والدروس":"Fächer und Unterricht"}</Link>
      <Link className="plain-button" href={childLink(`children/${id}/attendance`)}>{locale==="ar"?"تاريخ الحضور":"Anwesenheitsverlauf"}</Link>
      <Link className="plain-button" href={childLink(`children/${id}/excuse`)}>{locale==="ar"?"عذر الغياب":"Abwesenheit entschuldigen"}</Link>
      <Link className="plain-button" href={childLink("more/invoices","student")}>{locale==="ar"?"الفواتير":"Rechnungen"}</Link>
      <Link className="plain-button" href={childLink("more/finance-reports","student")}>{locale==="ar"?"كشف الحساب":"Gebührenübersicht"}</Link>
      <Link className="plain-button" href={childLink("more/enrollment-stops","student")}>{locale==="ar"?"وقف القيد":"Teilnahmepause"}</Link>
      <Link className="plain-button" href={childLink("more/news")}>{locale==="ar"?"أخبار المدرسة":"Schulnachrichten"}</Link>
      <Link className="plain-button" href={`${school}/calendar`}>{locale==="ar"?"تقويم الأحداث":"Veranstaltungskalender"}</Link>
      </div>
      {record.data.currentClass && <p><bdi dir="ltr">{record.data.currentClass.code}</bdi> · <bdi>{locale === "ar" ? record.data.currentClass.nameAr : record.data.currentClass.nameDe}</bdi></p>}
    </> } : { kind: "initialLoading" }} />;
}
