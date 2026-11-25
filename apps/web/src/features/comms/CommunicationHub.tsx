"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {Icon} from "@/ui/Icon";
import {communicationFeedEntry,publishingOptions,type Locale} from "@madrasty/contracts";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {ThreadInbox} from "./ThreadInbox";
import {SchoolPublishing} from "./SchoolPublishing";
const records=communicationFeedEntry.array();
export function CommunicationHub({locale,section,thread}:{locale:Locale;section?:string;thread?:string}){
  const ar=locale==="ar",root=`/${locale}/school/messages`;
  const active=thread?"chat":section==="feed"||section==="calendar"?section:"chat";
  const tabs=[["chat",ar?"المحادثات":"Chats"],["feed",ar?"المستجدات":"Aktuelles"],["calendar",ar?"التقويم":"Kalender"]];
  return <div className="comms-hub" data-chat-open={!!thread}>{!thread&&<h1>{ar?"التواصل":"Kontakt"}</h1>}
    {!thread&&<nav className="comms-segments comms-hub-tabs" aria-label={ar?"أقسام التواصل":"Kontaktbereiche"}>{tabs.map(([key,label])=><Link className="plain-button" key={key} aria-current={active===key?"page":undefined} href={`${root}?section=${key}`}>{label}</Link>)}</nav>}
    {active==="chat"?<ThreadInbox locale={locale} thread={thread}/>:active==="feed"?<CommunicationFeed locale={locale}/>:<SchoolPublishing locale={locale} kind="event" embedded/>}
  </div>;
}
function CommunicationFeed({locale}:{locale:Locale}){
  const ar=locale==="ar",actor=useAccountScope(),[filter,setFilter]=useState<"all"|"announcement"|"news">("all"),[refresh,setRefresh]=useState(0);
  const page=useAcademicPage(`/comms/feed?limit=25&locale=${locale}&filter=${filter}`,records,refresh);
  const options=useTimetableRead(actor.persona==="guardian"?null:"/school/publishing-options",publishingOptions);
  const write=options.value?.data?.schoolWide||options.value?.data?.classes.some(item=>item.canWrite);
  useEffect(()=>{const wake=()=>{if(!document.hidden&&navigator.onLine)setRefresh(n=>n+1);};window.addEventListener("online",wake);window.addEventListener("focus",wake);document.addEventListener("visibilitychange",wake);return()=>{window.removeEventListener("online",wake);window.removeEventListener("focus",wake);document.removeEventListener("visibilitychange",wake);};},[]);
  return <section className="auth-form">
    <div className="comms-segments comms-feed-filters" role="group" aria-label={ar?"تصفية المستجدات":"Aktuelles filtern"}>
      {(["all","announcement","news"] as const).map(key=><button className="plain-button" key={key} type="button" aria-pressed={filter===key} onClick={()=>setFilter(key)}>{key==="all"?(ar?"الكل":"Alle"):key==="news"?(ar?"الأخبار":"Neuigkeiten"):(ar?"الإعلانات":"Mitteilungen")}</button>)}
    </div>
    <div className="comms-feed-toolbar"><h2>{ar?"المستجدات":"Aktuelles"}</h2>
      {write&&<details className="comms-publish-menu"><summary className="comms-icon-button" aria-label={ar?"نشر وإدارة":"Veröffentlichen & verwalten"}><Icon name="plus"/></summary><div className="comms-publish-menu-items">
        <Link href={`/${locale}/school/more/news?create=1&from=hub`}>{ar?"خبر جديد":"Neue Neuigkeit"}</Link>
        <Link href={`/${locale}/school/more/broadcasts?from=hub`}>{ar?"الإعلانات":"Mitteilungen"}</Link>
        <Link href={`/${locale}/school/more/news?view=managed&from=hub`}>{ar?"إدارة الأخبار والمسودات":"Neuigkeiten und Entwürfe"}</Link>
        <Link href={`/${locale}/school/messages?section=calendar`}>{ar?"الأحداث والتقويم":"Veranstaltungen und Kalender"}</Link>
      </div></details>}
      <button type="button" className="comms-icon-button" aria-label={ar?"تحديث":"Aktualisieren"} onClick={()=>setRefresh(n=>n+1)}><Icon name="retry"/></button>
    </div>
    <AcademicPageItems locale={locale} page={page}>{items=><div className="auth-form">{items.map(item=><article key={item.kind+item.id} className="auth-card comms-feed-card">
      <small>{item.kind==="news"?(ar?"خبر":"Neuigkeit"):(ar?"إعلان":"Mitteilung")} · {new Date(item.publishedAt).toLocaleDateString(ar?"ar":"de-DE")}</small>
      <h3 dir="auto">{item.title}</h3><p dir="auto">{item.body}</p>
    </article>)}</div>}</AcademicPageItems>
  </section>;
}
