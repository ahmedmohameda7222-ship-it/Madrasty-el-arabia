"use client";
import Link from "next/link";
import {useState} from "react";
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
  return <div className="comms-hub"><h1>{ar?"التواصل":"Kontakt"}</h1>
    {!thread&&<nav className="comms-segments comms-hub-tabs" aria-label={ar?"أقسام التواصل":"Kontaktbereiche"}>{tabs.map(([key,label])=><Link className="plain-button" key={key} aria-current={active===key?"page":undefined} href={`${root}?section=${key}`}>{label}</Link>)}</nav>}
    {active==="chat"?<ThreadInbox locale={locale} thread={thread}/>:active==="feed"?<CommunicationFeed locale={locale}/>:<SchoolPublishing locale={locale} kind="event" embedded/>}
  </div>;
}
function CommunicationFeed({locale}:{locale:Locale}){
  const ar=locale==="ar",actor=useAccountScope(),[filter,setFilter]=useState<"all"|"announcement"|"news">("all"),[refresh,setRefresh]=useState(0);
  const page=useAcademicPage(`/comms/feed?limit=25&locale=${locale}&filter=${filter}`,records,refresh);
  const options=useTimetableRead(actor.persona==="guardian"?null:"/school/publishing-options",publishingOptions);
  const write=options.value?.data?.schoolWide||options.value?.data?.classes.some(item=>item.canWrite);
  return <section className="auth-form">
    <div className="comms-segments" role="group" aria-label={ar?"تصفية المستجدات":"Aktuelles filtern"}>
      {(["all","announcement","news"] as const).map(key=><button className="plain-button" key={key} type="button" aria-pressed={filter===key} onClick={()=>setFilter(key)}>{key==="all"?(ar?"الكل":"Alle"):key==="news"?(ar?"الأخبار":"Neuigkeiten"):(ar?"الإعلانات":"Mitteilungen")}</button>)}
    </div>
    {write&&<details className="comms-legacy-details"><summary>{ar?"نشر وإدارة":"Veröffentlichen & verwalten"}</summary><div className="header-actions"><Link className="plain-button" href={`/${locale}/school/more/news`}>{ar?"الأخبار":"Neuigkeiten"}</Link><Link className="plain-button" href={`/${locale}/school/more/broadcasts`}>{ar?"الإعلانات":"Mitteilungen"}</Link></div></details>}
    <button type="button" className="plain-button" onClick={()=>setRefresh(n=>n+1)}>{ar?"تحديث":"Aktualisieren"}</button>
    <AcademicPageItems locale={locale} page={page}>{items=><div className="auth-form">{items.map(item=><article key={item.kind+item.id} className="auth-card comms-feed-card">
      <small>{item.kind==="news"?(ar?"خبر":"Neuigkeit"):(ar?"إعلان":"Mitteilung")} · {new Date(item.publishedAt).toLocaleDateString(ar?"ar":"de-DE")}</small>
      <h3 dir="auto">{item.title}</h3><p dir="auto">{item.body}</p>
    </article>)}</div>}</AcademicPageItems>
  </section>;
}
