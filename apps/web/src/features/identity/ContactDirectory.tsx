"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { directoryEntrySchema, threadReceipt, type DirectoryEntry, type Locale } from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { chatDrafts } from "@/features/comms/chat-drafts";
import { useTimetableRead } from "@/features/school/timetable/shared";
import { StartConversation } from "@/features/comms/StartConversation";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface, type AsyncState } from "@/ui/AsyncSurface";
import { Icon } from "@/ui/Icon";

const words = {
  ar: { title:"رسالة جديدة", query:"ابحث عن شخص", mine:"جهات اتصالي", all:"كل الأشخاص", teacher:"المدرسون",
    ownTeachers:"مدرسو أبنائي", admin:"إدارة المدرسة", guardian:"أولياء الأمور", more:"عرض المزيد",
    empty:"لا توجد جهات اتصال مطابقة.", back:"رجوع للأشخاص", unavailable:"جهة الاتصال غير متاحة.",
    mail:"بريد العمل", call:"هاتف العمل", start:"اكتب رسالة", send:"إرسال", media:"إضافة مرفق" },
  de: { title:"Neue Nachricht", query:"Person suchen", mine:"Meine Kontakte", all:"Alle Personen", teacher:"Lehrkräfte",
    ownTeachers:"Lehrkräfte meiner Kinder", admin:"Schulverwaltung", guardian:"Eltern", more:"Weitere anzeigen",
    empty:"Keine passenden Kontakte.", back:"Zurück zu Personen", unavailable:"Dieser Kontakt ist nicht verfügbar.",
    mail:"Dienstliche E-Mail", call:"Diensttelefon", start:"Nachricht schreiben", send:"Senden", media:"Anhang hinzufügen" },
} as const;
type Mode = "mine" | "all";
type Page = { data: DirectoryEntry[]; meta?: { nextCursor?: string } };
const directoryList = directoryEntrySchema.array();
const label = (entry: DirectoryEntry, locale: Locale) => locale === "ar" ? entry.titleAr : entry.titleDe;
const group = (entry: DirectoryEntry) => entry.role === "teacher" ? "teacher" : entry.role === "guardian" ? "guardian" : "admin";
const groups = ["teacher","admin","guardian"] as const;

function message(locale: Locale, error: unknown) {
  return error instanceof ApiResponseError ? localizedError(locale,error.messageKey) : dictionary(locale)["error.unavailable"];
}
function filter(term:string,mode:Mode) {
  const query=new URLSearchParams({limit:"30",view:mode});
  if(term)query.set("query",term);
  return query;
}
function initials(entry:DirectoryEntry,locale:Locale) {
  return (entry.displayName??label(entry,locale)).trim().split(/\s+/u).slice(0,2).map(part=>Array.from(part)[0]??"").join("");
}

export function ContactDirectory({ locale, contact }: { locale: Locale; contact?: string }) {
  const text=words[locale], actor=useAccountScope(), router=useRouter(), command=useSchoolCommand(actor.persona);
  const [query,setQuery]=useState(""), [term,setTerm]=useState("");
  const [interactive,setInteractive]=useState(false);
  useEffect(()=>setInteractive(true),[]);
  const [mode,setMode]=useState<Mode>("mine"),[selected,setSelected]=useState(contact);
  const [revision,setRevision]=useState(0),[view,setView]=useState<AsyncState>({kind:"initialLoading"});
  const [entry,setEntry]=useState<DirectoryEntry>(),[rows,setRows]=useState<Page>();
  const confirmed=useRef<string|undefined>(undefined);
  const offices=useTimetableRead(`/directory?role=office&limit=10${term?`&query=${encodeURIComponent(term)}`:""}`,directoryList,revision);
  const [gettingMore,setGettingMore]=useState(false),[moreError,setMoreError]=useState("");
  const [opening,setOpening]=useState<string>(),[openError,setOpenError]=useState("");
  const openingRef=useRef(false);
  const [draft,setDraft]=useState<DirectoryEntry>(),[body,setBody]=useState(""),[firstId,setFirstId]=useState("");
  const draftInput=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{const field=draftInput.current;if(!field)return;field.style.height="auto";field.style.height=`${Math.min(140,Math.max(44,field.scrollHeight))}px`;},[draft,body]);
  useEffect(()=>{
    const timer=window.setTimeout(()=>setTerm(query.trim()),250);
    return ()=>window.clearTimeout(timer);
  },[query]);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==="visible")setRevision(count=>count+1);};
    window.addEventListener("focus",refresh);
    window.addEventListener("pageshow",refresh);
    document.addEventListener("visibilitychange",refresh);
    return ()=>{
      window.removeEventListener("focus",refresh);
      window.removeEventListener("pageshow",refresh);
      document.removeEventListener("visibilitychange",refresh);
    };
  },[]);
  useEffect(()=>{
    const abort=new AbortController();
    const options={signal:abort.signal,headers:{"X-School-Persona":actor.persona}};
    const retry=()=>setRevision(count=>count+1);
    const key=JSON.stringify([actor.accountId,actor.sessionId,actor.persona,selected??null,term,mode]);
    // Keep confirmed results visible only while refreshing the identical scope and query.
    if(confirmed.current===key)setView({kind:"refreshing",content:null});
    else{confirmed.current=undefined;setView({kind:"initialLoading"});setEntry(undefined);setRows(undefined);}
    setMoreError("");
    async function refresh(){
      try{
        if(selected){
          const result=await requestApi(`/directory/${selected}`,directoryEntrySchema,options);
          if(!abort.signal.aborted)setEntry(result.data);
        }else{
          const result=await requestApi(`/directory?${filter(term,mode)}`,directoryList,options);
          if(!abort.signal.aborted)setRows(result);
        }
        if(!abort.signal.aborted){confirmed.current=key;setView({kind:"ready",content:null});}
      }catch(error){
        if(abort.signal.aborted)return;
        confirmed.current=undefined;setEntry(undefined);setRows(undefined);
        if(error instanceof ApiResponseError&&[401,403,404].includes(error.status))setView({kind:"forbidden",action:<p>{text.unavailable}</p>});
        else setView({kind:"error",message:message(locale,error),retry});
      }
    }
    void refresh();
    return ()=>abort.abort();
  },[selected,revision,term,mode,actor.accountId,actor.sessionId,actor.persona]);

  function back(){
    const url=new URL(window.location.href);url.searchParams.delete("contact");
    window.history.replaceState(null,"",url);setSelected(undefined);
  }
  async function openPerson(row:DirectoryEntry){
    if(openingRef.current)return;
    openingRef.current=true;setOpening(row.id);setOpenError("");
    try{
      if(row.target.kind==="office"){
        const value=await command("/threads","POST",{target:row.target},threadReceipt);
        router.push(`/${locale}/school/messages?thread=${value.threadId}`);return;
      }
      const detail=(await requestApi(`/directory/${row.id}`,directoryEntrySchema,{headers:{"X-School-Persona":actor.persona}})).data;
      if(detail.directThreadId)router.push(`/${locale}/school/messages?thread=${detail.directThreadId}`);
      else {setDraft(detail);setBody("");setFirstId(crypto.randomUUID());}
    }catch(error){setOpenError(message(locale,error));}
    finally{openingRef.current=false;setOpening(undefined);}
  }
  async function sendFirst(media=false){
    if(!draft||openingRef.current||(!media&&!body.trim()))return;
    openingRef.current=true;setOpening(draft.id);setOpenError("");
    try{
      const value=await command("/threads","POST",{target:draft.target,
        ...(media?{}:{firstMessage:{clientMessageId:firstId,body:body.trim()}})},threadReceipt);
      if(media)chatDrafts.write(actor,value.threadId,{body,openMedia:true});
      router.push(`/${locale}/school/messages?thread=${value.threadId}`);
    }catch(error){setOpenError(message(locale,error));}
    finally{openingRef.current=false;setOpening(undefined);}
  }
  async function more(){
    const cursor=rows?.meta?.nextCursor;
    if(!cursor||gettingMore)return;
    const from=rows;setGettingMore(true);setMoreError("");
    try{
      const params=filter(term,mode);params.set("cursor",cursor);
      const page=await requestApi(`/directory?${params}`,directoryList,{headers:{"X-School-Persona":actor.persona}});
      setRows(current=>current===from?{data:[...current.data,...page.data.filter(item=>!current.data.some(old=>old.id===item.id))],meta:page.meta}:current);
    }catch(error){setMoreError(message(locale,error));}
    finally{setGettingMore(false);}
  }
  const content=selected&&entry?<DirectoryCard entry={entry} locale={locale}/>:rows&&<section className="comms-people">
    {rows.data.length===0&&!offices.value?.data?.length&&<p>{text.empty}</p>}
    {groups.map(key=>{
      const people=rows.data.filter(row=>group(row)===key&&row.target.kind==="person");
      if(!people.length)return null;
      return <div key={key} className="comms-people-group">
        <h2>{key==="teacher"&&mode==="mine"&&actor.persona==="guardian"?text.ownTeachers:text[key]}</h2>
        <ul className="group-list">{people.map(row=><li key={row.id}>
          <button className="comms-person-row" type="button" disabled={!!opening} onClick={()=>void openPerson(row)}>
            <span className="comms-avatar" aria-hidden="true">{initials(row,locale)}</span>
            <span className="comms-person-label"><span className="comms-person-name"><bdi>{row.displayName??label(row,locale)}</bdi></span><small>{label(row,locale)}</small>
              {row.contexts.length>0&&<small>{row.contexts.map(c=>locale==="ar"?c.nameAr:c.nameDe).join(" · ")}</small>}
            </span>
            <Icon name="messages"/>
          </button>
        </li>)}</ul>
      </div>;
    })}
    {offices.value?.data&&offices.value.data.length>0&&<div className="comms-people-group comms-office-group">
      <h2>{locale==="ar"?"مكاتب المدرسة":"Schulbüros"}</h2>
      <ul className="group-list">{offices.value.data.filter(row=>row.target.kind==="office").map(row=><li key={row.id}>
        <button className="comms-person-row" type="button" disabled={!!opening} onClick={()=>void openPerson(row)}>
          <span className="comms-avatar" aria-hidden="true"><Icon name={row.target.id==="accounts"?"receipt":"school"}/></span>
          <span className="comms-person-label"><span className="comms-person-name">{label(row,locale)}</span></span><Icon name="chevron"/>
        </button>
      </li>)}</ul>
    </div>}
    {rows.meta?.nextCursor&&<button className="plain-button" type="button" onClick={()=>void more()} disabled={gettingMore}>{text.more}</button>}
    {moreError&&<p role="alert">{moreError}</p>}
    {openError&&<p role="alert">{openError}</p>}
  </section>;
  if(draft)return <section className="comms-directory" data-compose="true">
    <button className="plain-button" type="button" disabled={!!opening} onClick={()=>{setDraft(undefined);setOpenError("");}}>{text.back}</button>
    <div className="comms-first-contact"><span className="comms-avatar" aria-hidden="true">{initials(draft,locale)}</span><div><h1><bdi>{draft.displayName??label(draft,locale)}</bdi></h1><p>{label(draft,locale)}</p></div></div>
    <form className="comms-composer auth-form" onSubmit={event=>{event.preventDefault();void sendFirst();}}>
      <div className="comms-input-bar">
        <button className="comms-icon-button comms-attach-button" type="button" aria-label={text.media} disabled={!!opening} onClick={()=>void sendFirst(true)}><Icon name="plus"/></button>
        <label className="comms-input-field"><textarea ref={draftInput} aria-label={text.start} placeholder={text.start} dir="auto" rows={2} value={body} maxLength={4000} disabled={!!opening} onChange={event=>{setBody(event.target.value);setFirstId(crypto.randomUUID());setOpenError("");}}/></label>
        <button className="comms-icon-button comms-send-button" type="submit" aria-label={text.send} disabled={!!opening||!body.trim()}><Icon name={openError?"retry":"sendUp"}/></button>
      </div>
    </form>{openError&&<p role="alert">{openError}</p>}
  </section>;
  return <section className="comms-directory">
    <h1>{text.title}</h1>
    {selected?<button type="button" className="plain-button" onClick={back}>{text.back}</button>:<>
      <input className="comms-search" type="search" aria-label={text.query} placeholder={text.query} maxLength={120} disabled={!interactive} value={query} onChange={event=>setQuery(event.target.value)}/>
      <div className="comms-segments" role="group" aria-label={text.title}>
        {(["mine","all"] as const).map(key=><button key={key} type="button" disabled={!interactive} aria-pressed={mode===key} onClick={()=>setMode(key)}>{text[key]}</button>)}
      </div>
    </>}
    <AsyncSurface locale={locale} state={view.kind==="ready"||view.kind==="refreshing"?{...view,content}:view}/>
  </section>;
}
export function DirectoryCard({entry,locale}:{entry:DirectoryEntry;locale:Locale}) {
  const text=words[locale],phone=entry.workPhone?.replace(/[^\d+]/g,"");
  return <section className="auth-card">
    <h2><bdi>{entry.displayName??label(entry,locale)}</bdi></h2>
    {entry.displayName&&<p>{label(entry,locale)}</p>}
    {entry.contexts.length>0&&<ul className="group-list">{entry.contexts.map(item=><li key={item.id}><bdi>{locale==="ar"?item.nameAr:item.nameDe}</bdi></li>)}</ul>}
    <div className="header-actions">
      <StartConversation locale={locale} target={entry.target} label={text.start}/>
      {entry.workEmail&&<a className="plain-button" href={`mailto:${encodeURIComponent(entry.workEmail).replace("%40","@")}`}>{text.mail}</a>}
      {phone&&/\d/.test(phone)&&<a className="plain-button" href={`tel:${phone}`}>{text.call}</a>}
    </div>
  </section>;
}
