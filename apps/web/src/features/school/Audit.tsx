"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  auditEntrySchema, auditFiltersSchema, auditResourceKind, auditQuery,
  type AuditEntry, type AuditResourceLink, type Locale,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { dictionary } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { CopyValue } from "@/ui/RecordValues";
import { TimetableRead, timetableError, useTimetableRead } from "./timetable/shared";

const entries=auditEntrySchema.array();
const words={
  ar:{title:"سجل التدقيق",from:"من تاريخ",to:"إلى تاريخ",action:"العملية",actor:"من نفّذ العملية",find:"بحث بالاسم",
    search:"بحث",area:"القسم",all:"الكل",apply:"تطبيق الفلاتر",reset:"مسح الفلاتر",more:"عرض المزيد",back:"رجوع للسجل",
    timestamp:"وقت العملية",change:"نوع التغيير",request:"معرّف الطلب",open:"افتح السجل المرتبط",none:"لا توجد عمليات مطابقة."},
  de:{title:"Änderungsprotokoll",from:"Ab Datum",to:"Bis Datum",action:"Aktion",actor:"Ausgeführt von",find:"Nach Namen suchen",
    search:"Suchen",area:"Bereich",all:"Alle",apply:"Filter anwenden",reset:"Filter zurücksetzen",more:"Weitere anzeigen",back:"Zurück zum Protokoll",
    timestamp:"Zeitpunkt",change:"Änderungsart",request:"Anfrage-ID",open:"Verknüpften Eintrag öffnen",none:"Keine passenden Aktionen."},
} as const;
const resources:Record<Locale,Record<AuditEntry["resourceKind"],string>>={
  ar:{access:"الصلاحيات",calendar:"تقويم المدرسة",assignments:"التكليفات",family:"الأسر والقيد",imports:"استيراد الأسر",invitation:"الدعوات",
    timetable:"الجدول الدراسي",attendance:"الحضور",academics:"التعلّم والدرجات",bank:"إعدادات البنك",finance:"الحسابات",communications:"إعلانات المدرسة"},
  de:{access:"Berechtigungen",calendar:"Schulkalender",assignments:"Einsätze",family:"Familien und Einschreibung",imports:"Familienimporte",invitation:"Einladungen",
    timetable:"Stundenplan",attendance:"Anwesenheit",academics:"Unterricht und Noten",bank:"Bankeinstellungen",finance:"Buchhaltung",communications:"Schulmitteilungen"},
};
const categories:Record<Locale,Record<AuditEntry["changeCategory"],string>>={
  ar:{permissions:"تغيير صلاحية",revocation:"إلغاء",settings:"تحديث إعدادات",creation:"إضافة",update:"تعديل",approval:"اعتماد",transfer:"نقل طالب",
    withdrawal:"إنهاء قيد",correction:"تصحيح",reversal:"عكس قيد مالي",publication:"نشر"},
  de:{permissions:"Berechtigung geändert",revocation:"Widerruf",settings:"Einstellungen aktualisiert",creation:"Anlage",update:"Änderung",approval:"Bestätigung",transfer:"Klassenwechsel",
    withdrawal:"Abmeldung",correction:"Korrektur",reversal:"Buchung storniert",publication:"Veröffentlichung"},
};
const specific:Record<string,[string,string]>={
  "school.student_created":["إضافة طالب","Schüler angelegt"],"school.student_updated":["تعديل طالب","Schüler bearbeitet"],
  "school.guardian_created":["إضافة ولي أمر","Sorgeberechtigte angelegt"],"school.guardian_updated":["تعديل ولي أمر","Sorgeberechtigte bearbeitet"],
  "family.link_pending":["طلب ربط أسرة","Familienverknüpfung beantragt"],"family.link_approved":["اعتماد رابط أسرة","Familienverknüpfung bestätigt"],
  "family.link_revoked":["إلغاء رابط أسرة","Familienverknüpfung widerrufen"],"school.enrollment_placed":["قيد طالب","Schüler eingeschrieben"],
  "school.staff_created":["إضافة موظف","Mitarbeitende angelegt"],"school.staff_updated":["تعديل موظف","Mitarbeitende bearbeitet"],
  "school.year_created":["إضافة سنة دراسية","Schuljahr angelegt"],"school.year_changed":["تعديل سنة دراسية","Schuljahr bearbeitet"],
  "school.day_changed":["تعديل يوم دراسي","Schultag bearbeitet"],"school.class_created":["إضافة فصل","Klasse angelegt"],
  "school.class_changed":["تعديل فصل","Klasse bearbeitet"],"school.year_rolled_over":["ترحيل القيد للسنة الجديدة","Einschreibung ins Folgejahr übernommen"],
  "school.import_uploaded":["رفع دفعة استيراد","Import hochgeladen"],"school.import_committed":["اعتماد دفعة استيراد","Import übernommen"],
  "invitation.issued":["إصدار دعوة","Einladung erstellt"],"invitation.batch_requested":["طلب دفعة دعوات","Einladungsserie erstellt"],
  "school.assignment_created":["إضافة تكليف","Einsatz angelegt"],"school.assignment_changed":["تعديل تكليف","Einsatz bearbeitet"],
  "school.substitute_assigned":["تكليف بديل","Vertretung beauftragt"],"school.room_created":["إضافة قاعة","Raum angelegt"],
  "school.room_changed":["تعديل قاعة","Raum bearbeitet"],"school.timetable_added":["إضافة حصة للجدول","Stundenplantermin angelegt"],
  "school.timetable_changed":["تعديل حصة في الجدول","Stundenplantermin bearbeitet"],
  "attendance.sheet_opened":["فتح كشف حضور","Anwesenheitsliste geöffnet"],"attendance.sheet_approved":["اعتماد كشف حضور","Anwesenheitsliste bestätigt"],
  "attendance.arrival_confirmed":["تأكيد حضور فعلي","Ankunft bestätigt"],"attendance.corrected":["تصحيح حضور معتمد","Anwesenheit korrigiert"],
  "invoice.issued":["إصدار فاتورة","Rechnung ausgestellt"],"payment.recorded":["تسجيل سداد","Zahlung erfasst"],"payment.reversed":["عكس سداد","Zahlung storniert"],
};
type Search={from:string;to:string;actorId:string;action:string;resourceKind:string};
const empty={from:"",to:"",actorId:"",action:"",resourceKind:""};

function label(row:Pick<AuditEntry,"action"|"resourceKind"|"changeCategory">,locale:Locale){
  return specific[row.action]?.[locale==="ar"?0:1] || `${resources[locale][row.resourceKind]} · ${categories[locale][row.changeCategory]}`;
}
function auditUrl(locale:Locale,link:AuditResourceLink) {
  const root=`/${locale}/school`;
  switch(link.kind){
    case "access":return `/${locale}/staff/access`;
    case "invitations":return `${root}/students`;
    case "calendar":return `${root}/more/calendar`;
    case "assignments":return `${root}/more/assignments`;
    case "timetable":return `${root}/more/timetable`;
    case "student":return `${root}/students?student=${link.id}`;
    case "guardian":return `${root}/students?guardian=${link.id}${link.linkId?`&link=${link.linkId}`:""}`;
    case "import":return `${root}/students/import?job=${link.id}`;
    case "class":return `${root}/more/assignments?class=${link.id}&year=${link.yearId}`;
    default:return root+"/more/audit";
  }
}
function timestamp(row:AuditEntry,locale:Locale,timezone:string){
  return new Intl.DateTimeFormat(locale==="ar"?"ar":"de-DE",{
    timeZone:timezone,year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",timeZoneName:"short",
  }).format(new Date(row.occurredAt));
}
function filterParams(locale:Locale,filters:Partial<Search>){
  const params=new URLSearchParams({locale});
  for(const [key,value] of Object.entries(filters))if(value)params.set(key,value);
  return params;
}

export function Audit({locale,initial,entry}:{locale:Locale;initial?:Partial<Search>;entry?:string}){
  const text=words[locale], actor=useAccountScope();
  const [draft,setDraft]=useState({...empty,...initial});
  const [filters,setFilters]=useState({...empty,...initial});
  const [input,setInput]=useState("");
  const [actorQuery,setActorQuery]=useState("");
  const [selected,setSelected]=useState(entry);
  const [reload,setReload]=useState(0);
  const [busy,setBusy]=useState(false);
  const [validation,setValidation]=useState("");
  const [extraError,setExtraError]=useState("");
  const [table,setTable]=useState<{path:string;items?:AuditEntry[];cursor?:string;error?:unknown}>();

  const filterPath=filterParams(locale,{from:filters.from,to:filters.to});
  if(actorQuery)filterPath.set("actorQuery",actorQuery);
  const choices=useTimetableRead(`/school/audit/filters?${filterPath}`,auditFiltersSchema,reload);
  const details=useTimetableRead(selected?`/school/audit/${selected}?locale=${locale}`:null,auditEntrySchema,reload);
  const params=filterParams(locale,filters);
  params.set("limit","30");
  const path=`/school/audit?${params}` as const;
  const displayed=table?.path===path?table:undefined;
  const timezone=choices.value?.data?.timezone??"UTC";

  useEffect(()=>{
    const focus=()=>setReload((count)=>count+1);
    window.addEventListener("focus",focus);
    return ()=>window.removeEventListener("focus",focus);
  },[]);
  useEffect(()=>{
    if(selected)return;
    const abort=new AbortController();
    requestApi(path,entries,{signal:abort.signal,headers:{"X-School-Persona":actor.persona}})
      .then(({data,meta})=>{if(!abort.signal.aborted)setTable({path,items:data,cursor:meta?.nextCursor});})
      .catch((error)=>{if(!abort.signal.aborted)setTable({path,error});});
    return ()=>abort.abort();
  },[path,actor.persona,reload,selected]);

  function show(id?:string){
    const url=new URL(window.location.href);
    if(id)url.searchParams.set("entry",id);
    else url.searchParams.delete("entry");
    window.history.replaceState(null,"",url);
    setSelected(id);
  }

  function apply(values:Search){
    const validated=auditQuery.safeParse(Object.fromEntries(filterParams(locale,values)));
    if(!validated.success){setValidation(dictionary(locale)["error.validation"]);return;}
    setValidation("");
    setExtraError("");
    const url=new URL(window.location.href);
    for(const [key,value] of Object.entries(values)){
      if(value)url.searchParams.set(key,value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(null,"",url);
    setFilters(values);
  }

  async function more(){
    if(!displayed?.cursor||busy)return;
    setBusy(true);
    setExtraError("");
    try{
      const page=await requestApi(`${path}&cursor=${displayed.cursor}`,entries,{headers:{"X-School-Persona":actor.persona}});
      setTable((old)=>old===displayed?{path,items:[...(old.items??[]),...page.data],cursor:page.meta?.nextCursor}:old);
    }catch(error){
      if(error instanceof ApiResponseError&&[401,403,404].includes(error.status))setTable({path,error});
      else setExtraError(timetableError(locale,error));
    }finally{setBusy(false);}
  }

  const failure=displayed?.error;
  return <>
    <h1>{text.title}</h1>
    {selected?<>
      <button type="button" className="plain-button" onClick={()=>show()}>{text.back}</button>
      <TimetableRead locale={locale} result={details}>{(row)=><section className="auth-card">
        <h2>{label(row,locale)}</h2>
        <dl>
          <dt>{text.actor}</dt><dd><bdi>{row.actorDisplay}</bdi></dd>
          <dt>{text.timestamp}</dt><dd><bdi>{timestamp(row,locale,timezone)}</bdi></dd>
          <dt>{text.change}</dt><dd>{categories[locale][row.changeCategory]}</dd>
        </dl>
        <CopyValue locale={locale} label={text.request} value={row.requestId}/>
        {row.permittedResourceLink&&<Link className="plain-button" href={auditUrl(locale,row.permittedResourceLink)}>{text.open}</Link>}
      </section>}</TimetableRead>
    </>:<>
      <section className="auth-card">
        <form className="auth-form" onSubmit={(event)=>{event.preventDefault();apply(draft);}}>
          <label>{text.from}<input type="date" value={draft.from} onChange={(event)=>setDraft({...draft,from:event.target.value})}/></label>
          <label>{text.to}<input type="date" value={draft.to} onChange={(event)=>setDraft({...draft,to:event.target.value})}/></label>
          <TimetableRead locale={locale} result={choices}>{(options)=><>
            <label>{text.area}<select value={draft.resourceKind} onChange={(event)=>setDraft({...draft,resourceKind:event.target.value,action:""})}>
              <option value="">{text.all}</option>
              {auditResourceKind.options.filter((kind)=>options.actions.some((row)=>row.resourceKind===kind)).map((kind)=>
                <option value={kind} key={kind}>{resources[locale][kind]}</option>)}
            </select></label>
            <label>{text.action}<select value={draft.action} onChange={(event)=>setDraft({...draft,action:event.target.value})}>
              <option value="">{text.all}</option>
              {options.actions.filter((row)=>!draft.resourceKind||row.resourceKind===draft.resourceKind).map((row)=>
                <option value={row.action} key={row.action}>{label(row,locale)}</option>)}
            </select></label>
            <label>{text.find}<input type="search" maxLength={100} value={input} onChange={(event)=>setInput(event.target.value)}/></label>
            <button type="button" className="plain-button" onClick={()=>setActorQuery(input.trim())}>{text.search}</button>
            <label>{text.actor}<select value={draft.actorId} onChange={(event)=>setDraft({...draft,actorId:event.target.value})}>
              <option value="">{text.all}</option>
              {draft.actorId&&!options.actors.some((row)=>row.id===draft.actorId)&&<option value={draft.actorId}>{draft.actorId}</option>}
              {options.actors.map((row)=><option value={row.id} key={row.id}>{row.displayName}</option>)}
            </select></label>
          </>}</TimetableRead>
          <div className="header-actions">
            <button type="submit" className="primary-button">{text.apply}</button>
            <button type="button" className="plain-button" onClick={()=>{setDraft(empty);setInput("");setActorQuery("");apply(empty);}}>{text.reset}</button>
          </div>
          {validation&&<p role="alert">{validation}</p>}
        </form>
      </section>
      <AsyncSurface locale={locale} state={failure
        ? failure instanceof ApiResponseError&&[401,403,404].includes(failure.status)?{kind:"forbidden"}
          :{kind:"error",message:timetableError(locale,failure),retry:()=>setReload((count)=>count+1)}
        : displayed?.items?{kind:"ready",content:<section className="auth-card">
          {!displayed.items.length&&<p>{text.none}</p>}
          <ul className="group-list">{displayed.items.map((row)=><li key={row.id}>
            <button type="button" className="group-row" onClick={()=>show(row.id)}>
              <span>{label(row,locale)}</span><bdi>{row.actorDisplay}</bdi><bdi>{timestamp(row,locale,timezone)}</bdi>
            </button>
          </li>)}</ul>
          {displayed.cursor&&<button type="button" className="plain-button" disabled={busy} onClick={()=>void more()}>{text.more}</button>}
          {extraError&&<p role="alert">{extraError}</p>}
        </section>}:{kind:"initialLoading"}}/>
    </>}
  </>;
}
