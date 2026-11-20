"use client";

import { useEffect,useState, type FormEvent } from "react";
import { z } from "zod";
import {
  childSummarySchema,curriculumLesson,curriculumOffering,curriculumSubject,curriculumSubjectChange,curriculumSubjectCreate,
  lessonChange,lessonCreate,lessonPublished,lessonReceipt,
  type CurriculumLesson,type CurriculumOffering,type CurriculumSubject,type Locale,
} from "@madrasty/contracts";
import { ApiResponseError,requestApi } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { TimetableRead,timetableError,useTimetableRead } from "@/features/school/timetable/shared";
import { dictionary } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";

const words={
  ar:{title:"المواد والدروس",child:"الطفل",subject:"المادة",newSubject:"إضافة مادة",editSubject:"تعديل المادة",archived:"مؤرشفة",
    archive:"أرشفة المادة",code:"رمز المادة",nameAr:"الاسم بالعربية",nameDe:"الاسم بالألمانية",descAr:"الوصف بالعربية",descDe:"الوصف بالألمانية",
    offering:"الفصل والسنة",lessons:"الدروس",newLesson:"خطة درس جديدة",editLesson:"تعديل المسودة",back:"رجوع للدروس",
    noSubject:"ما فيش مواد متاحة.",noLessons:"ما فيش دروس في الفصل ده.",noOfferings:"ما فيش فصول متاحة للمادة دي.",
    planDay:"تاريخ الدرس المخطّط",published:"تاريخ النشر",draft:"مسودة",draftChanges:"مسودة فيها تعديلات بانتظار النشر",
    delivered:"آخر شرح مسجّل",deliveryPending:"لم يُسجَّل شرح للدرس",source:"لغة النص الأصلي",arabic:"العربية",german:"الألمانية",
    titleAr:"عنوان الدرس بالعربية",bodyAr:"نص الدرس بالعربية",titleDe:"عنوان الدرس بالألمانية",bodyDe:"نص الدرس بالألمانية",
    save:"حفظ",cancel:"إلغاء",saved:"اتحفظت التغييرات.",unit:"وحدة الدرس",newUnit:"وحدة جديدة",order:"الترتيب داخل الخطة",
    preview:"معاينة النشر",confirm:"انشر الدرس",live:"اتنشر الدرس.",more:"عرض المزيد",refresh:"تحديث",
    originalAr:"النص الأصلي بالعربية",originalDe:"النص الأصلي بالألمانية"},
  de:{title:"Fächer und Unterricht",child:"Kind",subject:"Fach",newSubject:"Fach anlegen",editSubject:"Fach bearbeiten",archived:"Archiviert",
    archive:"Fach archivieren",code:"Fachkürzel",nameAr:"Name auf Arabisch",nameDe:"Name auf Deutsch",descAr:"Beschreibung auf Arabisch",descDe:"Beschreibung auf Deutsch",
    offering:"Klasse und Schuljahr",lessons:"Unterrichtsstunden",newLesson:"Unterricht planen",editLesson:"Entwurf bearbeiten",back:"Zurück zum Unterricht",
    noSubject:"Es sind keine Fächer verfügbar.",noLessons:"Für diese Klasse sind keine Stunden verfügbar.",noOfferings:"Für dieses Fach sind keine Klassen verfügbar.",
    planDay:"Geplanter Unterrichtstag",published:"Veröffentlicht am",draft:"Entwurf",draftChanges:"Entwurf mit unveröffentlichten Änderungen",
    delivered:"Zuletzt unterrichtet am",deliveryPending:"Unterrichtsdurchführung noch nicht erfasst",source:"Sprache des Originals",arabic:"Arabisch",german:"Deutsch",
    titleAr:"Titel auf Arabisch",bodyAr:"Unterrichtstext auf Arabisch",titleDe:"Titel auf Deutsch",bodyDe:"Unterrichtstext auf Deutsch",
    save:"Speichern",cancel:"Abbrechen",saved:"Änderungen gespeichert.",unit:"Unterrichtseinheit",newUnit:"Neue Einheit",order:"Reihenfolge im Plan",
    preview:"Veröffentlichung prüfen",confirm:"Unterricht veröffentlichen",live:"Unterricht veröffentlicht.",more:"Weitere anzeigen",refresh:"Aktualisieren",
    originalAr:"Original auf Arabisch",originalDe:"Original auf Deutsch"},
} as const;

const children=childSummarySchema.array(),offerings=curriculumOffering.array(),subjects=curriculumSubject.array(),lessons=curriculumLesson.array();
const denied=(error:unknown)=>error instanceof ApiResponseError&&[401,403,404].includes(error.status);
const subjectName=(subject:CurriculumSubject,locale:Locale)=>locale==="ar"?subject.nameAr:subject.nameDe;
type LessonText=Pick<CurriculumLesson,"sourceLanguage"|"titleAr"|"bodyAr"|"titleDe"|"bodyDe">;

function localLesson(value:LessonText,locale:Locale){
  const localized=locale==="ar"?value.titleAr:value.titleDe;
  const language=localized?locale:value.sourceLanguage;
  return {language,title:language==="ar"?value.titleAr:value.titleDe,body:language==="ar"?value.bodyAr:value.bodyDe};
}

function useCurriculumPage<T>(path:`/${string}`|null,schema:z.ZodType<T[]>,refresh:number){
  const {persona}=useAccountScope();
  const [read,setRead]=useState<{path:string;refresh:number;items?:T[];cursor?:string;error?:unknown}>();
  const [retry,setRetry]=useState(0);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState<unknown>();
  const visible=read?.path===path?read:undefined;
  useEffect(()=>{
    if(!path)return;
    const abort=new AbortController();
    requestApi(path,schema,{signal:abort.signal,headers:{"X-School-Persona":persona}}).then(
      ({data,meta})=>{if(!abort.signal.aborted)setRead({path,refresh,items:data,cursor:meta?.nextCursor});},
      (error)=>{if(!abort.signal.aborted)setRead({path,refresh,error});},
    );
    return ()=>abort.abort();
  },[path,persona,refresh,retry,schema]);
  async function more(){
    if(!path||!visible?.cursor||busy)return;
    setBusy(true);setNotice(undefined);
    try{
      const {data,meta}=await requestApi(`${path}&cursor=${encodeURIComponent(visible.cursor)}`,schema,{headers:{"X-School-Persona":persona}});
      setRead((old)=>old===visible?{path,refresh,items:[...(visible.items??[]),...data],cursor:meta?.nextCursor}:old);
    }catch(error){
      if(denied(error))setRead((old)=>old===visible?{path,refresh,error}:old);
      else setNotice(error);
    }finally{setBusy(false);}
  }
  return {visible,retry:()=>setRetry((count)=>count+1),more,busy,notice};
}

export function Curriculum({locale,initialChild,initialLesson}:{
  locale:Locale;initialChild?:string;initialLesson?:string;
}){
  const {persona}=useAccountScope(),text=words[locale],guardian=persona==="guardian";
  const [child,setChild]=useState(initialChild??"");
  const [revision,setRevision]=useState(0);
  const childOptions=useTimetableRead(guardian?"/me/children?limit=100":null,children,revision);
  useEffect(()=>{
    const refresh=()=>setRevision((n)=>n+1);
    window.addEventListener("focus",refresh);
    return ()=>window.removeEventListener("focus",refresh);
  },[]);
  const selected=guardian?childOptions.value?.data?.find((option)=>option.id===child)??(child?undefined:childOptions.value?.data?.[0]):undefined;
  return <>
    <h1>{text.title}</h1>
    {guardian&&<TimetableRead result={childOptions} locale={locale}>{(items)=>items.length?<label className="auth-card">{text.child}
      <select value={selected?.id??""} onChange={(event)=>setChild(event.target.value)}>
        {!selected&&<option value="">{dictionary(locale).choose}</option>}
        {items.map((item)=><option key={item.id} value={item.id}>{item.displayName}</option>)}
      </select>
    </label>:<AsyncSurface locale={locale} state={{kind:"empty"}}/>}</TimetableRead>}
    {guardian&&childOptions.value?.data&&child&&!selected&&<AsyncSurface locale={locale} state={{kind:"forbidden"}}/>}
    {(!guardian||selected)&&<CurriculumCatalog key={selected?.id??persona} locale={locale} revision={revision}
      child={selected?.id} initialLesson={!child||child===initialChild?initialLesson:undefined}/>}
  </>;
}

function CurriculumCatalog({locale,child,revision,initialLesson}:{locale:Locale;child?:string;revision:number;initialLesson?:string}){
  const text=words[locale],{persona}=useAccountScope();
  const childFilter=child?`&childId=${child}`:"",childQuery=child?`?childId=${child}`:"";
  const [changed,setChanged]=useState(0);
  const [subject,setSubject]=useState("");
  const [editSubject,setEditSubject]=useState<"new"|"current">();
  const [lesson,setLesson]=useState(initialLesson);
  const [createLesson,setCreateLesson]=useState(false);
  const [offering,setOffering]=useState("");
  const refresh=revision+changed;
  const catalog=useCurriculumPage(`/academics/subjects?limit=100${childFilter}`,subjects,refresh);
  const available=useTimetableRead(`/academics/offerings${childQuery}`,offerings,refresh);
  const options=catalog.visible?.items??[];
  const selected=subject?options.find((item)=>item.id===subject):options[0];
  const picked=selected?.id;
  const current=useTimetableRead(picked?`/academics/subjects/${picked}${childQuery}`:null,curriculumSubject,refresh);
  const validOfferings=available.value?.data?.filter((value)=>value.subjectId===picked)??[];
  const chosen=validOfferings.find((value)=>value.id===offering)??validOfferings[0];
  const program=useCurriculumPage(chosen?`/academics/lessons?limit=25&offeringId=${chosen.id}${childFilter}`:null,lessons,refresh);
  const detail=useTimetableRead(lesson?`/academics/lessons/${lesson}${childQuery}`:null,curriculumLesson,refresh);
  const inc=()=>setChanged((n)=>n+1);

  if(lesson)return <>
    <button type="button" className="plain-button" onClick={()=>setLesson(undefined)}>{text.back}</button>
    <TimetableRead locale={locale} result={detail}>{(value)=><LessonDetails locale={locale} key={value.id}
      context={available.value?.data?.find((item)=>item.id===value.offeringId)} value={value} changed={inc}/>}</TimetableRead>
  </>;

  return <>
    <section className="auth-card auth-form">
      <h2>{text.subject}</h2>
      {catalog.visible?.error?<ReadError locale={locale} error={catalog.visible.error} retry={catalog.retry}/>:
        !catalog.visible?.items?<AsyncSurface locale={locale} state={{kind:"initialLoading"}}/>:
        options.length?<label>{text.subject}<select value={picked??""} onChange={(event)=>{
          setSubject(event.target.value);setOffering("");setEditSubject(undefined);setCreateLesson(false);
        }}>
          {!picked&&<option value="">{dictionary(locale).choose}</option>}
          {options.map((value)=><option key={value.id} value={value.id}>{subjectName(value,locale)}</option>)}
        </select></label>:<p>{text.noSubject}</p>}
      {catalog.visible?.cursor&&<button className="plain-button" disabled={catalog.busy} onClick={()=>void catalog.more()}>{text.more}</button>}
      {catalog.notice!==undefined&&<p role="alert">{timetableError(locale,catalog.notice)}</p>}
      {picked&&<TimetableRead locale={locale} result={current}>{(value)=><>
        <h3><bdi>{subjectName(value,locale)}</bdi> {value.archived&&<small>{text.archived}</small>}</h3>
        <p>{locale==="ar"?value.descriptionAr:value.descriptionDe}</p>
        {persona==="admin"&&<button className="plain-button" onClick={()=>setEditSubject("current")}>{text.editSubject}</button>}
      </>}</TimetableRead>}
      {persona==="admin"&&<button className="plain-button" onClick={()=>setEditSubject("new")}>{text.newSubject}</button>}
      {editSubject&&(editSubject==="new"||current.value?.data)&&<SubjectEditor locale={locale} key={editSubject==="new"?"new":picked}
        item={editSubject==="current"?current.value?.data:undefined} cancel={()=>setEditSubject(undefined)}
        saved={(id)=>{setSubject(id);setEditSubject(undefined);inc();}}/>}
    </section>
    {picked&&<section className="auth-card auth-form">
      <h2>{text.lessons}</h2>
      <TimetableRead locale={locale} result={available}>{()=>validOfferings.length?<label>{text.offering}<select value={chosen?.id??""} onChange={(event)=>{
        setOffering(event.target.value);setCreateLesson(false);
      }}>
        {validOfferings.map((option)=><option value={option.id} key={option.id}>{offeringText(option,locale)}</option>)}
      </select></label>:<p>{text.noOfferings}</p>}</TimetableRead>
      {chosen&&(program.visible?.error?<ReadError locale={locale} error={program.visible.error} retry={program.retry}/>:
        !program.visible?.items?<AsyncSurface locale={locale} state={{kind:"initialLoading"}}/>:<>
          {program.visible.items.length?<ul className="group-list">{program.visible.items.map((value)=><li key={value.id}>
            <button className="group-row" onClick={()=>setLesson(value.id)}><bdi>{localLesson(value,locale).title}</bdi>
              {value.plannedDate&&<bdi dir="ltr">{value.plannedDate}</bdi>}
            </button>
          </li>)}</ul>:<p>{text.noLessons}</p>}
          {program.visible.cursor&&<button className="plain-button" disabled={program.busy} onClick={()=>void program.more()}>{text.more}</button>}
          {program.notice!==undefined&&<p role="alert">{timetableError(locale,program.notice)}</p>}
        </>)}
      {chosen?.canPlan&&<button className="plain-button" onClick={()=>setCreateLesson(true)}>{text.newLesson}</button>}
      {chosen?.canPlan&&createLesson&&<LessonEditor key={chosen.id} locale={locale} offering={chosen.id}
        units={program.visible?.items??[]} cancel={()=>setCreateLesson(false)} saved={(id)=>{setCreateLesson(false);setLesson(id);inc();}}/>}
    </section>}
  </>;
}

function offeringText(value:CurriculumOffering,locale:Locale){
  return `${value.classCode} · ${locale==="ar"?value.classNameAr:value.classNameDe} · ${value.yearStart} – ${value.yearEnd}`;
}

function ReadError({locale,error,retry}:{locale:Locale;error:unknown;retry:()=>void}){
  return <AsyncSurface locale={locale} state={denied(error)?{kind:"forbidden"}:{kind:"error",message:timetableError(locale,error),retry}}/>;
}

function SubjectEditor({locale,item,cancel,saved}:{locale:Locale;item?:CurriculumSubject;cancel:()=>void;saved:(id:string)=>void}){
  const text=words[locale],command=useSchoolCommand("admin");
  const [base]=useState(item?.revision);
  const [value,setValue]=useState(item??{code:"",nameAr:"",nameDe:"",descriptionAr:"",descriptionDe:"",archived:false});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function save(event:FormEvent){
    event.preventDefault();
    const input=item?curriculumSubjectChange.safeParse({...value,revision:base}):curriculumSubjectCreate.safeParse(value);
    if(!input.success){setMessage(dictionary(locale)["error.validation"]);return;}
    setBusy(true);setMessage("");
    try{
      const result=await command(item?`/academics/subjects/${item.id}`:"/academics/subjects",item?"PATCH":"POST",input.data,curriculumSubject);
      saved(result.id);
    }catch(error){setMessage(timetableError(locale,error));}
    finally{setBusy(false);}
  }
  return <form className="auth-form" onSubmit={save}>
    {!item&&<label>{text.code}<input value={value.code} required maxLength={24} dir="ltr" onChange={(event)=>setValue({...value,code:event.target.value.toUpperCase()})}/></label>}
    {(["nameAr","nameDe"] as const).map((key)=><label key={key}>{text[key]}<input value={value[key]} required maxLength={160} dir={key.endsWith("Ar")?"rtl":"ltr"}
      onChange={(event)=>setValue({...value,[key]:event.target.value})}/></label>)}
    {(["descriptionAr","descriptionDe"] as const).map((key)=><label key={key}>{key.endsWith("Ar")?text.descAr:text.descDe}
      <textarea value={value[key]} maxLength={3000} dir={key.endsWith("Ar")?"rtl":"ltr"} onChange={(event)=>setValue({...value,[key]:event.target.value})}/>
    </label>)}
    {item&&<label><input type="checkbox" checked={value.archived} onChange={(event)=>setValue({...value,archived:event.target.checked})}/>{text.archive}</label>}
    {message&&<p role="alert">{message}</p>}
    <div className="header-actions">
      <button type="submit" className="primary-button" disabled={busy}>{text.save}</button>
      <button type="button" className="plain-button" disabled={busy} onClick={cancel}>{text.cancel}</button>
    </div>
  </form>;
}

function LessonEditor({locale,offering,item,units,cancel,saved}:{
  locale:Locale;offering:string;item?:CurriculumLesson;units:CurriculumLesson[];cancel:()=>void;saved:(id:string)=>void;
}){
  const text=words[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [base]=useState(item?.revision);
  const [value,setValue]=useState({
    unitId:item?.unitId??"",sortOrder:String(item?.sortOrder??0),plannedDate:item?.plannedDate??"",
    sourceLanguage:item?.sourceLanguage??locale,titleAr:item?.titleAr??"",bodyAr:item?.bodyAr??"",titleDe:item?.titleDe??"",bodyDe:item?.bodyDe??"",
  });
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function save(event:FormEvent){
    event.preventDefault();
    const draft={...value,sortOrder:Number(value.sortOrder),unitId:value.unitId||null,plannedDate:value.plannedDate||null};
    const input=item?lessonChange.safeParse({...draft,revision:base}):lessonCreate.safeParse({...draft,offeringId:offering});
    if(!input.success){setMessage(dictionary(locale)["error.validation"]);return;}
    setBusy(true);setMessage("");
    try{
      const result=await command(item?`/academics/lessons/${item.id}`:"/academics/lessons",item?"PATCH":"POST",input.data,lessonReceipt);
      saved(result.id);
    }catch(error){setMessage(timetableError(locale,error));}
    finally{setBusy(false);}
  }
  const unitOptions=[...new Map(units.map((record)=>[record.unitId,record])).values()];
  return <form className="auth-form" onSubmit={save}>
    {!item&&<label>{text.unit}<select value={value.unitId} onChange={(event)=>setValue({...value,unitId:event.target.value})}>
      <option value="">{text.newUnit}</option>{unitOptions.map((record)=><option key={record.unitId} value={record.unitId}>{localLesson(record,locale).title}</option>)}
    </select></label>}
    <label>{text.order}<input type="number" required min={0} max={10000} step={1} value={value.sortOrder} onChange={(event)=>setValue({...value,sortOrder:event.target.value})}/></label>
    <label>{text.planDay}<input type="date" value={value.plannedDate} onChange={(event)=>setValue({...value,plannedDate:event.target.value})}/></label>
    <label>{text.source}<select value={value.sourceLanguage} onChange={(event)=>setValue({...value,sourceLanguage:event.target.value==="de"?"de":"ar"})}>
      <option value="ar">{text.arabic}</option><option value="de">{text.german}</option>
    </select></label>
    {(["Ar","De"] as const).map((language)=>{
      const title=`title${language}` as const,body=`body${language}` as const,languageCode=language==="Ar"?"ar":"de";
      const dir=languageCode==="ar"?"rtl":"ltr",required=languageCode===value.sourceLanguage;
      return <div key={language} className="auth-form">
        <label>{text[title]}<input lang={languageCode} dir={dir} required={required} maxLength={200} value={value[title]}
          onChange={(event)=>setValue({...value,[title]:event.target.value})}/></label>
        <label>{text[body]}<textarea lang={languageCode} dir={dir} required={required} maxLength={12000} rows={5} value={value[body]}
          onChange={(event)=>setValue({...value,[body]:event.target.value})}/></label>
      </div>;
    })}
    {message&&<p role="alert">{message}</p>}
    <div className="header-actions">
      <button type="submit" className="primary-button" disabled={busy}>{text.save}</button>
      <button type="button" className="plain-button" disabled={busy} onClick={cancel}>{text.cancel}</button>
    </div>
  </form>;
}

function LessonBody({value,locale}:{value:LessonText;locale:Locale}){
  const content=localLesson(value,locale),text=words[locale];
  return <>
    {content.language!==locale&&<p>{content.language==="ar"?text.originalAr:text.originalDe}</p>}
    <h2 lang={content.language} dir={content.language==="ar"?"rtl":"ltr"}>{content.title}</h2>
    <p lang={content.language} dir={content.language==="ar"?"rtl":"ltr"} style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{content.body}</p>
  </>;
}

function LessonDetails({locale,context,value,changed}:{locale:Locale;context?:CurriculumOffering;value:CurriculumLesson;changed:()=>void}){
  const text=words[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [editing,setEditing]=useState(false),[preview,setPreview]=useState<number>();
  const [language,setLanguage]=useState(locale),[busy,setBusy]=useState(false);
  const [notice,setNotice]=useState<{message:string;error:boolean}>();
  async function publish(){
    if(preview!==value.revision)return;
    setBusy(true);
    try{
      await command(`/academics/lessons/${value.id}/publish`,"POST",{revision:preview},lessonPublished);
      setPreview(undefined);setNotice({message:text.live,error:false});changed();
    }catch(error){
      setNotice({message:timetableError(locale,error),error:true});
      if(denied(error)||error instanceof ApiResponseError&&error.status===409){setPreview(undefined);changed();}
    }finally{setBusy(false);}
  }
  return <section className="auth-card auth-form">
    {context&&<p><bdi>{offeringText(context,locale)}</bdi></p>}
    <LessonBody value={value} locale={locale}/>
    {value.plannedDate&&<p>{text.planDay} · <bdi dir="ltr">{value.plannedDate}</bdi></p>}
    {value.publishedAt&&<p>{text.published} · <bdi>{new Date(value.publishedAt).toLocaleString(locale==="ar"?"ar":"de-DE")}</bdi></p>}
    {!value.publishedAt&&<p>{text.draft}</p>}
    {value.publishedRevision!==null&&value.publishedRevision!==value.revision&&<p>{text.draftChanges}</p>}
    <p>{value.latestDeliveryDate?<>{text.delivered} · <bdi dir="ltr">{value.latestDeliveryDate}</bdi></>:text.deliveryPending}</p>
    {value.canEdit&&!editing&&<button className="plain-button" onClick={()=>{setEditing(true);setPreview(undefined);}}>{text.editLesson}</button>}
    {value.canEdit&&editing&&<LessonEditor locale={locale} offering={value.offeringId} item={value} units={[]}
      cancel={()=>setEditing(false)} saved={()=>{setEditing(false);setPreview(undefined);setNotice({message:text.saved,error:false});changed();}}/>}
    {value.canPublish&&value.publishedRevision!==value.revision&&!editing&&
      <button className="plain-button" onClick={()=>setPreview(value.revision)}>{text.preview}</button>}
    {value.canPublish&&preview===value.revision&&<div className="notice auth-form">
      <label>{text.preview}<select value={language} onChange={(event)=>setLanguage(event.target.value==="ar"?"ar":"de")}>
        <option value="ar">{text.arabic}</option><option value="de">{text.german}</option>
      </select></label>
      <LessonBody value={value} locale={language}/>
      <div className="header-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={()=>void publish()}>{text.confirm}</button>
        <button type="button" className="plain-button" disabled={busy} onClick={()=>setPreview(undefined)}>{text.cancel}</button>
      </div>
    </div>}
    {notice&&<p role={notice.error?"alert":"status"}>{notice.message}</p>}
    <button className="plain-button" onClick={changed}>{text.refresh}</button>
  </section>;
}
