"use client";

import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {
  broadcastDraft,broadcastEntry,broadcastOptions,broadcastPreview,broadcastReceipt,broadcastSent,
  type BroadcastKind,type BroadcastDraft,type BroadcastPreview,type BroadcastReceipt,type Locale,
} from "@madrasty/contracts";
import {ApiResponseError} from "@/api/client";
import {useSchoolCommand} from "@/api/commands";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";

const copy={
  ar:{title:"إعلانات المدرسة",compose:"إعلان جديد",inbox:"الإعلانات الواردة",history:"الإعلانات المنشورة",
    audience:"الجمهور",all_guardians:"كل أولياء الأمور",class_guardians:"أولياء أمور الفصل",all_teachers:"كل المدرسين",class:"الفصل",
    ar:"العربية",de:"الألمانية",subject:"العنوان",body:"نص الإعلان",preview:"معاينة الإعلان",edit:"تعديل المسودة",
    confirm:"تأكيد النشر",preparing:"جارٍ تجهيز المعاينة",publishing:"جارٍ النشر",count:"عدد المستلمين",
    stale:"المعاينة انتهت أو الجمهور اتغيّر. جهّز معاينة جديدة قبل النشر.",until:"المعاينة صالحة لحد",
    noRecipients:"لا يوجد مستلمون مخوّلون لهذا الإعلان.",published:"اتنشر الإعلان",waiting:"بانتظار التجهيز",queued:"اتجهّز للتوصيل",
    skipped:"خارج نطاق التوصيل",open:"قراءة الإعلان",back:"رجوع للإعلانات",reload:"تحديث"},
  de:{title:"Schulmitteilungen",compose:"Neue Mitteilung",inbox:"Empfangene Mitteilungen",history:"Veröffentlichte Mitteilungen",
    audience:"Zielgruppe",all_guardians:"Alle Sorgeberechtigten",class_guardians:"Sorgeberechtigte der Klasse",all_teachers:"Alle Lehrkräfte",class:"Klasse",
    ar:"Arabisch",de:"Deutsch",subject:"Titel",body:"Text der Mitteilung",preview:"Vorschau erstellen",edit:"Entwurf bearbeiten",
    confirm:"Veröffentlichung bestätigen",preparing:"Vorschau wird erstellt",publishing:"Wird veröffentlicht",count:"Anzahl der Empfänger",
    stale:"Die Vorschau ist abgelaufen oder die Zielgruppe hat sich geändert. Erstelle eine neue Vorschau.",
    until:"Vorschau gültig bis",noRecipients:"Für diese Mitteilung gibt es keine berechtigten Empfänger.",published:"Mitteilung veröffentlicht",
    waiting:"Wartet auf Vorbereitung",queued:"Für die Zustellung vorbereitet",skipped:"Nicht mehr zustellberechtigt",
    open:"Mitteilung lesen",back:"Zurück zu den Mitteilungen",reload:"Aktualisieren"},
} as const;
const locales=["ar","de"] as const;
const emptyCopy=()=>({ar:{title:"",body:""},de:{title:"",body:""}});
const sentList=broadcastSent.array(),inboxList=broadcastEntry.array();

export function BroadcastHub({locale,selected}:{locale:Locale;selected?:string}){
  const labels=copy[locale],{persona}=useAccountScope();
  const [mode,setMode]=useState<"inbox"|"compose"|"history">(()=>persona==="admin"?"compose":"inbox");
  const [refresh,setRefresh]=useState(0);
  const options=useTimetableRead(persona==="guardian"?null:"/broadcasts/options",broadcastOptions,refresh);
  const detail=useTimetableRead(selected?`/broadcasts/inbox/${selected}?locale=${locale}`:null,broadcastEntry,refresh);
  const sent=useAcademicPage(!selected&&mode==="history"&&persona!=="guardian"?"/broadcasts?limit=25":null,sentList,refresh);
  const received=useAcademicPage(!selected&&(mode==="inbox"||persona==="guardian")?`/broadcasts/inbox?limit=25&locale=${locale}`:null,inboxList,refresh);
  const allowed=!!options.value?.data?.schoolWide||!!options.value?.data?.classes.length;
  const base=`/${locale}/school/more/broadcasts` as const;
  const date=(date:string)=>new Date(date).toLocaleString(locale==="ar"?"ar":"de-DE");
  const count=(n:number)=>new Intl.NumberFormat(locale).format(n);
  useEffect(()=>{
    const wake=()=>setRefresh((number)=>number+1);
    window.addEventListener("focus",wake);window.addEventListener("online",wake);
    return ()=>{window.removeEventListener("focus",wake);window.removeEventListener("online",wake);};
  },[]);
  return <section className="auth-card auth-form">
    <h1>{labels.title}</h1>
    {selected?<><Link className="plain-button" href={base}>{labels.back}</Link>
      <TimetableRead locale={locale} result={detail}>{(item)=><BroadcastText locale={locale} title={item.title} body={item.body}
        date={date(item.publishedAt)}/>}</TimetableRead>
    </>:<>
      <div className="header-actions">
        <button type="button" className="plain-button" aria-pressed={mode==="inbox"} onClick={()=>setMode("inbox")}>{labels.inbox}</button>
        {allowed&&<>
          <button type="button" className="plain-button" aria-pressed={mode==="compose"} onClick={()=>setMode("compose")}>{labels.compose}</button>
          <button type="button" className="plain-button" aria-pressed={mode==="history"} onClick={()=>{setMode("history");setRefresh((n)=>n+1);}}>{labels.history}</button>
        </>}
        <button type="button" className="plain-button" onClick={()=>setRefresh((n)=>n+1)}>{labels.reload}</button>
      </div>
      {mode==="inbox"&&<AcademicPageItems locale={locale} page={received}>{(entries)=><ul className="group-list">
        {entries.map((item)=><li className="timetable-day" key={item.id}>
          <Link className="group-row" href={`${base}?announcement=${item.id}`}><bdi>{item.title}</bdi><small>{date(item.publishedAt)}</small></Link>
        </li>)}
      </ul>}</AcademicPageItems>}
      {mode==="compose"&&persona!=="guardian"&&<TimetableRead locale={locale} result={options}>{(choice)=>
        choice.schoolWide||choice.classes.length?
          <BroadcastComposer locale={locale} options={choice} published={()=>setRefresh((n)=>n+1)}/>:
          <p>{labels.noRecipients}</p>
      }</TimetableRead>}
      {mode==="history"&&allowed&&<AcademicPageItems locale={locale} page={sent}>{(entries)=><ul className="group-list">
        {entries.map((item)=><li className="timetable-day" key={item.id}>
          <details><summary><bdi>{item.copy[locale].title}</bdi> · <bdi>{date(item.publishedAt)}</bdi></summary>
            <p>{labels[item.audience.kind]} {item.audience.kind==="class_guardians"&&<bdi>{locale==="ar"?item.classAr:item.classDe}</bdi>}</p>
            <p>{labels.count} · {count(item.recipientCount)}</p>
            <ul className="group-list">
              <li>{labels.waiting} · {count(item.dispatch.pending)}</li>
              <li>{labels.queued} · {count(item.dispatch.queued)}</li>
              <li>{labels.skipped} · {count(item.dispatch.suppressed)}</li>
            </ul>
            {locales.map((language)=><BroadcastText key={language} locale={language} {...item.copy[language]} heading={labels[language]}/>)}
          </details>
        </li>)}
      </ul>}</AcademicPageItems>}
    </>}
  </section>;
}

type Options=ReturnType<typeof broadcastOptions.parse>;
function BroadcastComposer({locale,options,published}:{locale:Locale;options:Options;published:()=>void}){
  const labels=copy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [kind,setKind]=useState<BroadcastKind>(),[classId,setClassId]=useState("");
  const [content,setContent]=useState(emptyCopy),[review,setReview]=useState<BroadcastPreview>(),[receipt,setReceipt]=useState<BroadcastReceipt>();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const available:BroadcastKind[]=[
    ...(options.schoolWide?["all_guardians","all_teachers"] as const:[]),
    ...(options.classes.length?["class_guardians"] as const:[]),
  ];
  const chosen=kind&&available.includes(kind)?kind:available[0];
  const classRef=options.classes.find((item)=>item.id===classId)?.id??options.classes[0]?.id;
  const draft=broadcastDraft.safeParse({
    audience:chosen==="class_guardians"?{kind:chosen,classId:classRef}:{kind:chosen},copy:content,
  });
  const formatter=new Intl.NumberFormat(locale);
  const total=review?review.counts.ar+review.counts.de:0;
  const reviewedClassId=review?.audience.kind==="class_guardians"?review.audience.classId:undefined;
  const reviewClass=options.classes.find((item)=>item.id===reviewedClassId);
  const change=(language:Locale,field:keyof BroadcastDraft["copy"]["ar"],value:string)=>
    setContent((old)=>({...old,[language]:{...old[language],[field]:value}}));
  async function preview(event:FormEvent){
    event.preventDefault();
    if(!draft.success||busy)return;
    setBusy(true);setError("");setReceipt(undefined);
    try{setReview(await command("/broadcasts/preview","POST",draft.data,broadcastPreview));}
    catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  async function confirm(){
    if(!review||busy||!total)return;
    // The server owns expiry and checks for a committed receipt before deciding to publish.
    setBusy(true);setError("");
    try{
      setReceipt(await command("/broadcasts","POST",{previewId:review.previewId},broadcastReceipt));
      setContent(emptyCopy());setReview(undefined);published();
    }catch(problem){
      if(problem instanceof ApiResponseError&&[404,409].includes(problem.status)){
        setReview(undefined);setError(labels.stale);
      }else setError(timetableError(locale,problem));
    }finally{setBusy(false);}
  }

  return <div className="auth-form">
    {error&&<p role="alert">{error}</p>}
    {receipt&&<p role="status">{labels.published} · {labels.count} {formatter.format(receipt.recipientCount)}</p>}
    {review?<section className="notice auth-form">
      <h2>{labels.preview}</h2>
      <p>{labels[review.audience.kind]} {reviewClass&&<bdi>{locale==="ar"?reviewClass.nameAr:reviewClass.nameDe}</bdi>}</p>
      <p>{labels.count} · {formatter.format(total)}</p>
      <p>{labels.until} · <bdi>{new Date(review.expiresAt).toLocaleTimeString(locale==="ar"?"ar":"de-DE",{hour:"2-digit",minute:"2-digit"})}</bdi></p>
      {!total&&<p role="status">{labels.noRecipients}</p>}
      {locales.map((language)=><BroadcastText key={language} locale={language} heading={`${labels[language]} · ${formatter.format(review.counts[language])}`}
        {...review.copy[language]}/>)}
      <div className="header-actions">
        <button type="button" className="primary-button" disabled={busy||!total} onClick={()=>void confirm()}>{busy?labels.publishing:labels.confirm}</button>
        <button type="button" className="plain-button" disabled={busy} onClick={()=>{setReview(undefined);setError("");}}>{labels.edit}</button>
      </div>
    </section>:<form className="auth-form" onSubmit={(event)=>void preview(event)}>
      <label>{labels.audience}<select value={chosen} disabled={busy} onChange={(event)=>setKind(event.target.value as BroadcastKind)}>
        {available.map((id)=><option key={id} value={id}>{labels[id]}</option>)}
      </select></label>
      {chosen==="class_guardians"&&<label>{labels.class}<select value={classRef} disabled={busy} onChange={(event)=>setClassId(event.target.value)}>
        {options.classes.map((item)=><option key={item.id} value={item.id}>{item.code} · {locale==="ar"?item.nameAr:item.nameDe}</option>)}
      </select></label>}
      {locales.map((language)=><fieldset className="auth-form" key={language} disabled={busy}>
        <legend>{labels[language]}</legend>
        <label>{labels.subject}<input dir={language==="ar"?"rtl":"ltr"} value={content[language].title} required maxLength={180}
          onChange={(event)=>change(language,"title",event.target.value)}/></label>
        <label>{labels.body}<textarea dir={language==="ar"?"rtl":"ltr"} value={content[language].body} required maxLength={4000} rows={4}
          onChange={(event)=>change(language,"body",event.target.value)}/></label>
      </fieldset>)}
      <button type="submit" className="primary-button" disabled={busy||!draft.success}>{busy?labels.preparing:labels.preview}</button>
    </form>}
  </div>;
}

function BroadcastText({locale,title,body,date,heading}:{locale:Locale;title:string;body:string;date?:string;heading?:string}){
  return <article className="timetable-day" lang={locale} dir={locale==="ar"?"rtl":"ltr"}>
    {heading&&<small>{heading}</small>}
    <h3 dir="auto">{title}</h3>
    {date&&<small><bdi>{date}</bdi></small>}
    <p dir="auto" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{body}</p>
  </article>;
}
