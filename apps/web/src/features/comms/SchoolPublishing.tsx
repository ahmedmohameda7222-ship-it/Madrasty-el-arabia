"use client";

import Link from "next/link";
import {useState,type FormEvent} from "react";
import {
  eventDraft,newsDraft,publishingOptions,schoolPublishingEntry,
  type Locale,type PublishingContent,type PublishingEntry,type PublishingOptions,
} from "@madrasty/contracts";
import {useSchoolCommand} from "@/api/commands";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {AsyncSurface} from "@/ui/AsyncSurface";

const words={
  ar:{news:"أخبار المدرسة",event:"تقويم الأحداث",write:"منشور جديد",writeEvent:"حدث جديد",managed:"إدارة المنشورات",
    feed:"المنشورات المنشورة",draft:"مسودة",published:"منشور",withdrawn:"مسحوب",school:"المدرسة كلها",class:"الفصل",
    allClasses:"كل الفصول",audience:"الجمهور",original:"لغة النص الأصلي",ar:"العربية",de:"الألمانية",title:"العنوان",body:"النص",
    start:"البداية",end:"النهاية",allDay:"طوال اليوم",endDate:"تاريخ النهاية (بداية اليوم المحدّد)",endOptional:"إضافة نهاية",
    preview:"معاينة",edit:"تعديل",save:"حفظ",publish:"نشر",withdraw:"سحب من العرض",back:"رجوع",open:"عرض التفاصيل",
    saved:"اتحفِظ التعديل.",publishedDone:"اتنشر.",withdrawnDone:"اتسحب من العرض.",busy:"جارٍ الحفظ",
    previous:"الشهر السابق",next:"الشهر التالي",month:"كل أحداث الشهر",today:"النهارده",emptyDay:"مفيش أحداث في اليوم ده.",
    withdrawQuestion:"تحب تسحب المنشور من العرض؟",noAudience:"لا توجد صلاحية نشر حالية.",allDayLabel:"طوال اليوم"},
  de:{news:"Schulnachrichten",event:"Veranstaltungskalender",write:"Neuer Beitrag",writeEvent:"Neue Veranstaltung",managed:"Beiträge verwalten",
    feed:"Veröffentlichte Beiträge",draft:"Entwurf",published:"Veröffentlicht",withdrawn:"Zurückgezogen",school:"Ganze Schule",class:"Klasse",
    allClasses:"Alle Klassen",audience:"Zielgruppe",original:"Originalsprache",ar:"Arabisch",de:"Deutsch",title:"Titel",body:"Text",
    start:"Beginn",end:"Ende",allDay:"Ganztägig",endDate:"Enddatum (ausschließlich)",endOptional:"Ende hinzufügen",
    preview:"Vorschau",edit:"Bearbeiten",save:"Speichern",publish:"Veröffentlichen",withdraw:"Zurückziehen",back:"Zurück",open:"Details öffnen",
    saved:"Änderung gespeichert.",publishedDone:"Veröffentlicht.",withdrawnDone:"Zurückgezogen.",busy:"Wird gespeichert",
    previous:"Vorheriger Monat",next:"Nächster Monat",month:"Alle Veranstaltungen des Monats",today:"Heute",emptyDay:"An diesem Tag gibt es keine Veranstaltungen.",
    withdrawQuestion:"Soll der Beitrag zurückgezogen werden?",noAudience:"Derzeit fehlt die Berechtigung zum Veröffentlichen.",allDayLabel:"Ganztägig"},
} as const;
type Kind="news"|"event";
const records=schoolPublishingEntry.array();
const originalLocales=["ar","de"] as const;
const endpoint=(kind:Kind)=>kind==="news"?"/news" as const:"/events" as const;
const href=(locale:Locale,kind:Kind)=>`/${locale}/school/more${endpoint(kind)}`;
const intl=(locale:Locale)=>locale==="de"?"de-DE":"ar";
const shortDate=(locale:Locale,day:string)=>new Intl.DateTimeFormat(intl(locale),{
  dateStyle:"medium",timeZone:"UTC",calendar:"gregory",
}).format(new Date(day+"T12:00:00Z"));
function monthStart(month:string){return new Date(month+"-01T12:00:00Z");}
function shiftMonth(month:string,value:number){
  const date=monthStart(month);
  date.setUTCMonth(date.getUTCMonth()+value);
  const text=date.toISOString().slice(0,7);
  return /^\d{4}-\d{2}$/.test(text)&&!text.startsWith("0000")?text:month;
}
function localized(entry:PublishingEntry,locale:Locale){return entry.copy[locale]??entry.copy[entry.sourceLocale]!;}
function activeOn(entry:PublishingEntry,day:string){
  if(entry.kind!=="event")return false;
  const {start,end,allDay}=entry.timing;
  if(start.date===day)return true;
  if(!end||day<start.date)return false;
  return day<end.date||day===end.date&&!allDay&&end.time!=="00:00";
}

export function SchoolPublishing({locale,kind,selected}:{locale:Locale;kind:Kind;selected?:string}){
  const options=useTimetableRead("/school/publishing-options",publishingOptions);
  return <TimetableRead locale={locale} result={options}>{(value)=><PublishingPanel key={kind+":"+selected}
    locale={locale} kind={kind} selected={selected} options={value}/>}</TimetableRead>;
}
function PublishingPanel({locale,kind,selected,options}:{locale:Locale;kind:Kind;selected?:string;options:PublishingOptions}){
  const text=words[locale],url=endpoint(kind);
  const canWrite=options.schoolWide||options.classes.some((item)=>item.canWrite);
  const [view,setView]=useState<"feed"|"managed">("feed"),[refresh,setRefresh]=useState(0);
  const [month,setMonth]=useState(options.schoolDate.slice(0,7)),[day,setDay]=useState<string>();
  const [classId,setClass]=useState(""),[editor,setEditor]=useState<"new"|"edit">();
  const query=`${url}?limit=60&view=${view}${classId?"&classId="+classId:""}${kind==="event"?"&month="+month:""}` as const;
  const page=useAcademicPage(!selected&&!editor?query:null,records,refresh);
  const detail=useTimetableRead(selected?`${url}/${selected}`:null,schoolPublishingEntry,refresh);
  function goMonth(next:string){setMonth(next);setDay(undefined);}
  const base=href(locale,kind);
  return <section className="auth-card auth-form">
    <h1>{text[kind]}</h1>
    {editor==="new"&&<PublishingEditor locale={locale} kind={kind} options={options}
      dismiss={()=>{setEditor(undefined);setView("managed");setRefresh((value)=>value+1);}}/>}
    {selected&&<><Link className="plain-button" href={base}>{text.back}</Link>
      <TimetableRead locale={locale} result={detail}>{(record)=>editor==="edit"?
        <PublishingEditor locale={locale} kind={kind} options={options} record={record} dismiss={()=>{setEditor(undefined);setRefresh((value)=>value+1);}}/>:
        <>
          <ContentCard locale={locale} record={record} detail/>
          {record.canEdit&&<button className="plain-button" type="button" onClick={()=>setEditor("edit")}>{text.edit}</button>}
        </>}
      </TimetableRead>
    </>}
    {!selected&&!editor&&<>
      {canWrite&&<div className="header-actions">
        <button className="plain-button" type="button" aria-pressed={view==="feed"} onClick={()=>setView("feed")}>{text.feed}</button>
        <button className="plain-button" type="button" aria-pressed={view==="managed"} onClick={()=>setView("managed")}>{text.managed}</button>
        <button className="primary-button" type="button" onClick={()=>setEditor("new")}>{kind==="event"?text.writeEvent:text.write}</button>
      </div>}
      {options.classes.length>0&&<label>{text.class}<select value={classId} onChange={(event)=>setClass(event.target.value)}>
        <option value="">{text.allClasses}</option>
        {options.classes.map((choice)=><option key={choice.id} value={choice.id}>{choice.code} · {locale==="ar"?choice.nameAr:choice.nameDe}</option>)}
      </select></label>}
      {kind==="event"&&<MonthPicker locale={locale} month={month} go={goMonth} day={day} choose={setDay}
        today={options.schoolDate} entries={page.visible?.items??[]}/>}
      <AcademicPageItems locale={locale} page={page}>{(entries)=>{
        const visible=kind==="event"&&day?entries.filter((entry)=>activeOn(entry,day)):entries;
        if(!visible.length)return <p>{text.emptyDay}</p>;
        return <ul className="group-list">
          {visible.map((record)=><li key={record.id}>
            <ContentCard locale={locale} record={record}/>
            <Link className="plain-button" href={`${base}?item=${record.id}`}>{text.open}</Link>
          </li>)}
        </ul>;
      }}</AcademicPageItems>
    </>}
  </section>;
}

function MonthPicker({locale,month,go,day,choose,today,entries}:{
  locale:Locale;month:string;go:(month:string)=>void;day?:string;choose:(day?:string)=>void;today:string;entries:PublishingEntry[];
}){
  const text=words[locale],first=monthStart(month),last=new Date(first);
  last.setUTCMonth(first.getUTCMonth()+1,0);
  const offset=(first.getUTCDay()+6)%7,days=last.getUTCDate();
  const weekday=new Intl.DateTimeFormat(intl(locale),{weekday:"short",timeZone:"UTC"});
  const number=new Intl.NumberFormat(locale);
  return <div className="auth-form">
    <div className="header-actions">
      <button className="plain-button" type="button" onClick={()=>go(shiftMonth(month,-1))}>{text.previous}</button>
      <h2>{new Intl.DateTimeFormat(intl(locale),{month:"long",year:"numeric",timeZone:"UTC",calendar:"gregory"}).format(first)}</h2>
      <button className="plain-button" type="button" onClick={()=>go(shiftMonth(month,1))}>{text.next}</button>
    </div>
    <div className="school-month-grid" role="group" aria-label={text.event}>
      {Array.from({length:7},(_,index)=><small key={index}>{weekday.format(new Date(Date.UTC(2024,0,index+1,12)))}</small>)}
      {Array.from({length:offset},(_,index)=><span key={`blank-${index}`}/>)}
      {Array.from({length:days},(_,index)=>{
        const dayId=`${month}-${String(index+1).padStart(2,"0")}`;
        const total=entries.filter((item)=>activeOn(item,dayId)).length;
        return <button type="button" key={dayId} className="plain-button" aria-pressed={day===dayId} aria-current={dayId===today?"date":undefined}
          aria-label={shortDate(locale,dayId)+(total?` · ${number.format(total)}`:"")} onClick={()=>choose(dayId)}>
          {number.format(index+1)}{total>0&&<span aria-hidden="true" className="school-month-dot">●</span>}
        </button>;
      })}
    </div>
    <div className="header-actions">
      {day&&<button type="button" className="plain-button" onClick={()=>choose()}>{text.month}</button>}
      <button type="button" className="plain-button" onClick={()=>{go(today.slice(0,7));choose(today);}}>{text.today}</button>
    </div>
  </div>;
}

function ContentCard({locale,record,detail=false}:{locale:Locale;record:PublishingEntry;detail?:boolean}){
  const text=words[locale],body=localized(record,locale);
  return <article className="timetable-day">
    <h2 dir="auto">{body.title}</h2>
    <p>{record.audience.kind==="school"?text.school:<bdi>{locale==="ar"?record.classAr:record.classDe}</bdi>}
      {record.state!=="published"&&<> · {text[record.state]}</>}</p>
    {record.kind==="event"&&<EventDate locale={locale} timing={record.timing} zone={record.timezone}/>}
    {record.kind==="news"&&record.publishedAt&&<small><bdi>{new Date(record.publishedAt).toLocaleDateString(intl(locale))}</bdi></small>}
    {detail&&<p dir="auto" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{body.body}</p>}
  </article>;
}
function EventDate({locale,timing,zone}:{locale:Locale;timing:Extract<PublishingContent,{timing:unknown}>["timing"];zone:string}){
  const moment=(value:typeof timing.start)=>shortDate(locale,value.date)+(value.time?" · "+value.time:"");
  return <p><bdi>{moment(timing.start)}</bdi>{timing.end&&<> – <bdi>{moment(timing.end)}</bdi></>}
    {" · "}{timing.allDay?words[locale].allDayLabel:<bdi>{zone}</bdi>}</p>;
}


function PublishingEditor({locale,kind,options,record,dismiss}:{
  locale:Locale;kind:Kind;options:PublishingOptions;record?:PublishingEntry;dismiss:()=>void;
}){
  const {persona}=useAccountScope(),command=useSchoolCommand(persona),text=words[locale],url=endpoint(kind);
  const [selected,setSelected]=useState<PublishingEntry|undefined>(record);
  const [language,setLanguage]=useState<Locale>(record?.sourceLocale??locale);
  const classes=options.classes.filter((choice)=>choice.canWrite);
  const existingClass=record?.audience.kind==="class"?record.audience.classId:undefined;
  const [classId,setClassId]=useState(existingClass??(options.schoolWide?"school":classes[0]?.id??""));
  const [copy,setCopy]=useState({ar:record?.copy.ar??{title:"",body:""},de:record?.copy.de??{title:"",body:""}});
  const originalTiming=record?.kind==="event"?record.timing:undefined;
  const [startDate,setStartDate]=useState(originalTiming?.start.date??options.schoolDate);
  const [startTime,setStartTime]=useState(originalTiming?.start.time??"09:00");
  const [endDate,setEndDate]=useState(originalTiming?.end?.date??"");
  const [endTime,setEndTime]=useState(originalTiming?.end?.time??"10:00");
  const [allDay,setAllDay]=useState(originalTiming?.allDay??true);
  const [hasEnd,setHasEnd]=useState(!!originalTiming?.end);
  const [review,setReview]=useState<PublishingContent>(),[signed,setSigned]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const candidate={
    audience:classId==="school"?{kind:"school"}:{kind:"class",classId},sourceLocale:language,
    copy:Object.fromEntries(originalLocales.filter((key)=>copy[key].title.trim()||copy[key].body.trim()).map((key)=>[key,copy[key]])),
  };
  const draft=kind==="news"?newsDraft.safeParse(candidate):eventDraft.safeParse({...candidate,
    timing:{start:{date:startDate,time:allDay?null:startTime},end:hasEnd?{date:endDate,time:allDay?null:endTime}:null,allDay},
  });
  function preview(event:FormEvent){
    event.preventDefault();
    if(!draft.success||busy)return;
    setReview(draft.data);setError("");setNotice("");setSigned(false);
  }
  async function save(){
    if(!review||busy)return;
    setBusy(true);setError("");
    try{
      const result=selected
        ?await command(`${url}/${selected.id}`,"PATCH",{...review,revision:selected.revision,action:"save"},schoolPublishingEntry)
        :await command(url,"POST",review,schoolPublishingEntry);
      setSelected(result);setSigned(true);setNotice(text.saved);
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  async function lifecycle(action:"publish"|"withdraw"){
    if(!selected||busy||action==="publish"&&!signed)return;
    if(action==="withdraw"&&!window.confirm(text.withdrawQuestion))return;
    setBusy(true);setError("");
    try{
      const record=await command(`${url}/${selected.id}`,"PATCH",{revision:selected.revision,action},schoolPublishingEntry);
      setSelected(record);setNotice(action==="publish"?text.publishedDone:text.withdrawnDone);
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  const choice=classes.find((item)=>item.id===classId);
  const reviewName=choice?(locale==="ar"?choice.nameAr:choice.nameDe):(locale==="ar"?record?.classAr:record?.classDe);
  return <div className="auth-form">
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {selected&&<p>{text[selected.state]}</p>}
    {review?<section className="notice auth-form">
      <h2>{text.preview}</h2>
      <p>{review.audience.kind==="school"?text.school:<bdi>{reviewName}</bdi>}</p>
      {"timing" in review&&<EventDate locale={locale} timing={review.timing} zone={options.timezone}/>}
      {originalLocales.map((key)=>{
        const value=review.copy[key];
        return value&&<article className="timetable-day" lang={key} dir={key==="ar"?"rtl":"ltr"} key={key}>
          <h3 dir="auto">{value.title}</h3>
          <p dir="auto" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{value.body}</p>
        </article>;
      })}
      <div className="header-actions">
        {!signed&&<button type="button" className="primary-button" disabled={busy} onClick={()=>void save()}>{busy?text.busy:text.save}</button>}
        {signed&&selected?.state!=="published"&&<button type="button" className="primary-button" disabled={busy} onClick={()=>void lifecycle("publish")}>{text.publish}</button>}
        <button type="button" className="plain-button" disabled={busy} onClick={()=>setReview(undefined)}>{text.edit}</button>
      </div>
    </section>:<form className="auth-form" onSubmit={preview}>
      <label>{text.audience}<select value={classId} onChange={(event)=>setClassId(event.target.value)} disabled={busy}>
        {options.schoolWide&&<option value="school">{text.school}</option>}
        {existingClass&&!classes.some((item)=>item.id===existingClass)&&<option value={existingClass}>{reviewName}</option>}
        {classes.map((item)=><option key={item.id} value={item.id}>{item.code} · {locale==="ar"?item.nameAr:item.nameDe}</option>)}
      </select></label>
      <label>{text.original}<select value={language} onChange={(event)=>setLanguage(event.target.value as Locale)} disabled={busy}>
        {originalLocales.map((key)=><option key={key} value={key}>{text[key]}</option>)}
      </select></label>
      {originalLocales.map((key)=><fieldset className="auth-form" key={key} disabled={busy}>
        <legend>{text[key]}</legend>
        <label>{text.title}<input dir={key==="ar"?"rtl":"ltr"} required={key===language} value={copy[key].title} maxLength={180}
          onChange={(event)=>setCopy({...copy,[key]:{...copy[key],title:event.target.value}})}/></label>
        <label>{text.body}<textarea dir={key==="ar"?"rtl":"ltr"} required={key===language} value={copy[key].body} maxLength={4000} rows={4}
          onChange={(event)=>setCopy({...copy,[key]:{...copy[key],body:event.target.value}})}/></label>
      </fieldset>)}
      {kind==="event"&&<fieldset className="auth-form" disabled={busy}>
        <legend>{options.timezone}</legend>
        <label><input type="checkbox" checked={allDay} onChange={(event)=>setAllDay(event.target.checked)}/>{text.allDay}</label>
        <label>{text.start}<input dir="ltr" type="date" required value={startDate} onChange={(event)=>setStartDate(event.target.value)}/></label>
        {!allDay&&<label>{text.start}<input dir="ltr" type="time" required value={startTime} onChange={(event)=>setStartTime(event.target.value)}/></label>}
        <label><input type="checkbox" checked={hasEnd} onChange={(event)=>{setHasEnd(event.target.checked);
          if(event.target.checked&&!endDate)setEndDate(startDate);}}/>{text.endOptional}</label>
        {hasEnd&&<label>{allDay?text.endDate:text.end}<input dir="ltr" type="date" required value={endDate}
          onChange={(event)=>setEndDate(event.target.value)}/></label>}
        {hasEnd&&!allDay&&<label>{text.end}<input dir="ltr" type="time" required value={endTime} onChange={(event)=>setEndTime(event.target.value)}/></label>}
      </fieldset>}
      <button type="submit" className="primary-button" disabled={!draft.success||busy}>{text.preview}</button>
    </form>}
    <div className="header-actions">
      {selected?.state==="published"&&<button type="button" className="plain-button" disabled={busy} onClick={()=>void lifecycle("withdraw")}>{text.withdraw}</button>}
      <button type="button" className="plain-button" disabled={busy} onClick={dismiss}>{text.back}</button>
    </div>
  </div>;
}
