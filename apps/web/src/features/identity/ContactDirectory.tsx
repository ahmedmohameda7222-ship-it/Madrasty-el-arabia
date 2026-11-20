"use client";

import { useEffect, useState } from "react";
import { directoryEntrySchema, directoryRoleSchema, type DirectoryEntry, type Locale } from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { dictionary, localizedError } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface, type AsyncState } from "@/ui/AsyncSurface";

const words = {
  ar: {
    title:"دليل التواصل", query:"الاسم أو الوظيفة", search:"بحث", reset:"مسح البحث", role:"الوظيفة", all:"الكل",
    teacher:"مدرس",principal:"مدير",deputy:"وكيل",office:"مكتب المدرسة",guardian:"ولي أمر", more:"عرض المزيد",
    empty:"ما فيش جهات اتصال مطابقة.", back:"رجوع للدليل", unavailable:"جهة الاتصال دي غير متاحة.",
    mail:"إرسال بريد لجهة العمل", call:"اتصال بهاتف العمل",
  },
  de: {
    title:"Kontaktverzeichnis", query:"Name oder Funktion", search:"Suchen", reset:"Suche zurücksetzen", role:"Funktion", all:"Alle",
    teacher:"Lehrkraft",principal:"Schulleitung",deputy:"Stellvertretung",office:"Schulbüro",guardian:"Sorgeberechtigte", more:"Weitere anzeigen",
    empty:"Keine passenden Kontakte.", back:"Zurück zum Verzeichnis", unavailable:"Dieser Kontakt ist nicht verfügbar.",
    mail:"Dienstliche E-Mail senden", call:"Diensttelefon anrufen",
  },
} as const;
const directoryList = directoryEntrySchema.array();
type Role = "" | DirectoryEntry["role"];
type Page = { data: DirectoryEntry[]; meta?: { nextCursor?: string } };
const label = (entry: DirectoryEntry, locale: Locale) => locale === "ar" ? entry.titleAr : entry.titleDe;

function message(locale: Locale, error: unknown) {
  return error instanceof ApiResponseError ? localizedError(locale,error.messageKey) : dictionary(locale)["error.unavailable"];
}

export function ContactDirectory({ locale, contact }: { locale: Locale; contact?: string }) {
  const text=words[locale], actor=useAccountScope();
  const [query, setQuery] = useState("");
  const [term,setTerm] = useState("");
  const [role,setRole] = useState<Role>("");
  const [selected,setSelected] = useState(contact);
  const [revision,setRevision] = useState(0);
  const [view,setView] = useState<AsyncState>({kind:"initialLoading"});
  const [entry,setEntry] = useState<DirectoryEntry>();
  const [rows,setRows] = useState<Page>();
  const [gettingMore, setGettingMore] = useState(false);
  const [moreError,setMoreError] = useState("");

  useEffect(()=>{
    const refresh=()=>{
      if (document.visibilityState === "visible") setRevision((count)=>count+1);
    };
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
    const options = { signal:abort.signal, headers:{"X-School-Persona":actor.persona} };
    const retry=()=>setRevision((count)=>count+1);
    const failed=(error:unknown)=>{
      if(abort.signal.aborted)return;
      if(error instanceof ApiResponseError && [401,403,404].includes(error.status)){
        setView({kind:"forbidden",action:<p>{text.unavailable}</p>});
      } else setView({kind:"error",message:message(locale,error),retry});
    };
    async function refresh() {
      setView({kind:"initialLoading"});
      setEntry(undefined);
      setRows(undefined);
      setMoreError("");
      try {
        if(selected) setEntry((await requestApi(`/directory/${selected}`,directoryEntrySchema,options)).data);
        else {
          const params=filter(term,role);
          setRows(await requestApi(`/directory?${params}`,directoryList,options));
        }
        if(!abort.signal.aborted)setView({kind:"ready",content:null});
      } catch(error) { failed(error); }
    }
    void refresh();
    return ()=>abort.abort();
  },[selected,revision,term,role,locale,actor.persona,text.unavailable]);

  function select(id?: string) {
    const url = new URL(window.location.href);
    if(id)url.searchParams.set("contact",id);
    else url.searchParams.delete("contact");
    window.history.replaceState(null,"",url);
    setView({kind:"initialLoading"});
    setSelected(id);
  }

  async function more() {
    const cursor=rows?.meta?.nextCursor;
    if(!cursor || gettingMore)return;
    const from=rows;
    setGettingMore(true);
    setMoreError("");
    try {
      const params=filter(term,role);
      params.set("cursor",cursor);
      const page=await requestApi(`/directory?${params}`,directoryList,{headers:{"X-School-Persona":actor.persona}});
      setRows((current)=>current===from?{data:[...current.data,...page.data],meta:page.meta}:current);
    } catch(error) { setMoreError(message(locale,error)); }
    finally {setGettingMore(false);}
  }

  const content=selected && entry ? <DirectoryCard entry={entry} locale={locale}/> : rows && <section className="auth-card">
    {rows.data.length===0 && <p>{text.empty}</p>}
    <ul className="group-list">{rows.data.map((row)=><li key={row.id}>
      <button type="button" className="group-row" onClick={()=>select(row.id)}>
        <bdi>{row.displayName ?? label(row,locale)}</bdi>
        {row.displayName && <small>{label(row,locale)}</small>}
      </button>
    </li>)}</ul>
    {rows.meta?.nextCursor && <button className="plain-button" onClick={()=>void more()} disabled={gettingMore}>{text.more}</button>}
    {moreError && <p role="alert">{moreError}</p>}
  </section>;

  return <>
    <h1>{text.title}</h1>
    {selected ? <button type="button" className="plain-button" onClick={()=>select()}>{text.back}</button> :
      <form className="auth-form auth-card" onSubmit={(event)=>{event.preventDefault();setTerm(query.trim());}}>
        <label>{text.query}<input type="search" maxLength={120} value={query} onChange={(event)=>setQuery(event.target.value)}/></label>
        <label>{text.role}<select value={role} onChange={(event)=>setRole(event.target.value as Role)}>
          <option value="">{text.all}</option>
          {directoryRoleSchema.options.map((key)=><option key={key} value={key}>{text[key]}</option>)}
        </select></label>
        <div className="header-actions">
          <button type="submit" className="primary-button">{text.search}</button>
          {(query || role) && <button type="button" className="plain-button" onClick={()=>{setQuery("");setTerm("");setRole("");}}>{text.reset}</button>}
        </div>
      </form>}
    <AsyncSurface locale={locale} state={view.kind==="ready" ? {...view,content} : view}/>
  </>;
}

function filter(term:string,role:Role) {
  const query=new URLSearchParams({limit:"30"});
  if(term)query.set("query",term);
  if(role)query.set("role",role);
  return query;
}

export function DirectoryCard({entry,locale}:{entry:DirectoryEntry;locale:Locale}) {
  const text=words[locale];
  const phone=entry.workPhone?.replace(/[^\d+]/g,"");
  return <section className="auth-card">
    <h2><bdi>{entry.displayName ?? label(entry,locale)}</bdi></h2>
    {entry.displayName && <p>{label(entry,locale)}</p>}
    {entry.contexts.length>0 && <ul className="group-list">{entry.contexts.map((item)=><li key={item.id}>
      <bdi>{locale==="ar" ? item.nameAr : item.nameDe}</bdi>
    </li>)}</ul>}
    <div className="header-actions">
      {entry.workEmail && <a className="plain-button" href={`mailto:${encodeURIComponent(entry.workEmail).replace("%40","@")}`}>{text.mail}</a>}
      {phone && /\d/.test(phone) && <a className="plain-button" href={`tel:${phone}`}>{text.call}</a>}
    </div>
  </section>;
}
