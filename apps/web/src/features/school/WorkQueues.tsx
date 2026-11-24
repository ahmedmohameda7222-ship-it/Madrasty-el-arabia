"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { queuePageSchema, schoolPublishingEntry, workQueuesSchema, type Locale, type QueueItem, type WorkQueueKey } from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { dictionary } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { RoleHero } from "@/ui/RoleHero";
import { Icon } from "@/ui/Icon";
import { TimetableRead, timetableError, useTimetableRead } from "./timetable/shared";

const queueLabels: Record<Locale,Record<WorkQueueKey,string>> = {
  ar:{guardian_links:"روابط الأسر للمراجعة",family_imports:"دفعات استيراد مفتوحة",class_assignments:"فصول ينقصها تكليف",
    bounced_invites:"دعوات تعذّر تسليمها",unapproved_attendance:"حضور بانتظار الاعتماد",noncontinuation_requests:"طلبات وقف القيد",
    settlement_review:"مدفوعات للمراجعة"},
  de:{guardian_links:"Familienverknüpfungen zur Prüfung",family_imports:"Offene Familienimporte",class_assignments:"Klassen mit fehlendem Einsatz",
    bounced_invites:"Nicht zugestellte Einladungen",unapproved_attendance:"Offene Anwesenheitsfreigaben",noncontinuation_requests:"Anträge zur Abmeldung",
    settlement_review:"Zahlungen zur Prüfung"},
};
const copy={
  ar:{work:"مهام المدرسة",date:"المهام حتى تاريخ",apply:"عرض المهام",open:"فتح المهام",unavailable:"تعذّر تحميل العدد",
    empty:"ما فيش مهام مفتوحة في التاريخ ده.",back:"الصفحة الرئيسية",more:"عرض المزيد",directory:"دليل التواصل"},
  de:{work:"Aufgaben der Schule",date:"Aufgaben bis zum Datum",apply:"Aufgaben anzeigen",open:"Aufgaben öffnen",unavailable:"Anzahl nicht verfügbar",
    empty:"Für dieses Datum liegen keine offenen Aufgaben vor.",back:"Startseite",more:"Weitere anzeigen",directory:"Kontaktverzeichnis"},
} as const;
const query=(asOf?:string)=>asOf?`?asOf=${asOf}`:"";
const queueRoute=(locale:Locale,route:string,asOf:string)=>`/${locale}${route}${query(asOf)}`;
const publications = schoolPublishingEntry.array();
const overviewCopy = {
  ar: {title:"المدرسة في أرقام", quick:"إجراءات سريعة", students:"الطلبة", classes:"الفصول", teachers:"المدرسون",
    guardian:"إضافة أسرة", event:"إضافة حدث", invoice:"إصدار فاتورة", announcement:"إرسال إعلان",
    news:"آخر أخبار المدرسة", events:"الأحداث", allNews:"أخبار المدرسة", addStudent:"إضافة أسرة", school:"أقسام المدرسة"},
  de: {title:"Die Schule auf einen Blick", quick:"Schnellzugriff", students:"Schüler", classes:"Klassen", teachers:"Lehrkräfte",
    guardian:"Neue Familie hinzufügen", event:"Neue Veranstaltung", invoice:"Rechnungen ausstellen", announcement:"Mitteilung senden",
    news:"Aktuelles aus der Schule", events:"Veranstaltungen", allNews:"Schulnachrichten", addStudent:"Neue Familie hinzufügen", school:"Schulbereiche"},
} as const;

const dashboardCopy={
  de:{done:"Alles erledigt",tasks:"offene Aufgaben",partial:"Einige Aufgaben konnten nicht geladen werden.",all:"Alle Aufgaben",overview:"Schulübersicht",last:"Letzter Schultag",today:"Heutiger Schultag",next:"Nächster Schultag",present:"Anwesend",late:"Verspätet",absent:"Abwesend",approved:"Bestätigte Klassen",noAttendance:"Noch keine bestätigte Anwesenheit.",finance:"Finanzen",income:"Einnahmen nach Erstattungen",cash:"Barzahlung",bank:"Überweisung",openFinance:"Finanzen öffnen",openAttendance:"Anwesenheit ansehen",classMonitor:"Klassen im Blick",schedule:"Stundenplan",noNext:"Kein weiterer Schultag geplant.",unknown:"Nicht verfügbar",family:"Familie",event:"Termin",announce:"Mitteilung",invoice:"Rechnung",news:"Aktuelles",newsType:"Schulnachricht",eventType:"Veranstaltung",noNews:"Keine aktuellen Einträge.",profile:"Profil",allNews:"Alle Nachrichten",allEvents:"Alle Termine"},
  ar:{done:"كل المهام خلصت",tasks:"مهام مفتوحة",partial:"تعذّر تحميل بعض المهام.",all:"كل المهام",overview:"نظرة على المدرسة",last:"آخر يوم دراسي",today:"اليوم الدراسي",next:"اليوم الدراسي القادم",present:"حاضر",late:"متأخر",absent:"غائب",approved:"فصول تم اعتمادها",noAttendance:"لا يوجد حضور معتمد حتى الآن.",finance:"الحسابات",income:"المتحصلات بعد الاسترداد",cash:"نقدي",bank:"تحويل بنكي",openFinance:"فتح الحسابات",openAttendance:"عرض الحضور",classMonitor:"متابعة الفصول",schedule:"الجدول الدراسي",noNext:"لا يوجد يوم دراسي قادم محدد.",unknown:"غير متاح",family:"أسرة",event:"حدث",announce:"إعلان",invoice:"فاتورة",news:"أخبار المدرسة",newsType:"خبر",eventType:"حدث",noNews:"لا توجد أخبار أو أحداث حاليًا.",profile:"الملف الشخصي",allNews:"كل الأخبار",allEvents:"كل الأحداث"},
} as const;
const dateLabel=(day:string,locale:Locale)=>new Intl.DateTimeFormat(locale,{dateStyle:"long",timeZone:"UTC"}).format(new Date(day+"T12:00:00Z"));
function SchoolUpdates({locale,today,version}:{locale:Locale;today:string;version:number}) {
  const t=dashboardCopy[locale],base=`/${locale}/school/more`;
  const news=useTimetableRead("/news?limit=3",publications,version);
  const events=useTimetableRead(`/events?month=${today.slice(0,7)}&limit=60`,publications,version);
  const recent=news.value?.data??[];
  const upcoming=events.value?.data?.filter(item=>item.kind==="event"&&(item.timing.end?.date??item.timing.start.date)>=today)
    .sort((a,b)=>(a.kind==="event"?a.timing.start.date:"").localeCompare(b.kind==="event"?b.timing.start.date:"")).slice(0,2)??[];
  const loading=!news.value||!events.value;
  return <section className="admin-start-section">
    <h2>{t.news}</h2>
    <div className="admin-start-panel admin-start-list">
      {loading?<p className="admin-start-muted">{dictionary(locale).pending}</p>:null}
      {news.value?.error||events.value?.error?<p className="admin-start-muted">{t.unknown}</p>:null}
      {!loading&&!news.value?.error&&!events.value?.error&&!recent.length&&!upcoming.length?<p className="admin-start-muted">{t.noNews}</p>:null}
      {[...recent,...upcoming].map(item=><Link key={item.id} className="admin-start-row" href={`${base}/${item.kind==="news"?"news":"events"}?item=${item.id}`}>
        <span className="admin-start-icon"><Icon name={item.kind==="news"?"messages":"attendance"}/></span>
        <span><strong>{(item.copy[locale]??item.copy[item.sourceLocale])?.title}</strong><small>{item.kind==="event"?dateLabel(item.timing.start.date,locale):t.newsType}</small></span>
        <Icon name="chevron"/>
      </Link>)}
      <div className="admin-start-links"><Link href={`${base}/news`}>{t.allNews}</Link><Link href={`${base}/events`}>{t.allEvents}</Link></div>
    </div>
  </section>;
}

export function AdminWork({locale,initialDay,tasksOnly=false}:{locale:Locale;initialDay?:string;tasksOnly?:boolean}){
  const text=copy[locale],t=dashboardCopy[locale],labels=overviewCopy[locale],base=`/${locale}/school`;
  const [dateText,setDate]=useState(initialDay??"");
  const [asOf,setAsOf]=useState(initialDay);
  const [version,setVersion]=useState(0);
  const result=useTimetableRead(`/school/work-queues${query(asOf)}`,workQueuesSchema,version);
  useEffect(()=>{
    const refresh=()=>setVersion(count=>count+1);
    window.addEventListener("focus",refresh);
    return ()=>window.removeEventListener("focus",refresh);
  },[]);
  function update(){
    const url=new URL(window.location.href);
    if(dateText)url.searchParams.set("asOf",dateText);
    else url.searchParams.delete("asOf");
    window.history.replaceState(null,"",url);
    setAsOf(dateText||undefined);
  }
  if(!result.value?.data){
    return <>{!tasksOnly&&<RoleHero persona="admin" title={text.work} detail={locale==="ar"?"متابعة أعمال المدرسة":"Schulaufgaben im Überblick"} action={{href:`${base}/more`,label:labels.school}}/>}<TimetableRead locale={locale} result={result}>{()=>null}</TimetableRead></>;
  }
  return <TimetableRead locale={locale} result={result}>{summary=>{
    if(summary.setupRequired===true)return <RoleHero persona="admin" title={text.work}
      detail={locale==="ar"?"إعدادات المدرسة مطلوبة قبل عرض المهام.":"Die Schule muss eingerichtet werden."}
      action={summary.mayConfigure?{href:`${base}/more/calendar`,label:locale==="ar"?"إعداد المدرسة":"Schule einrichten"}:{href:`/${locale}/directory`,label:text.directory}}/>;
    const overview=summary.overview;
    const queues=summary.queues.filter(row=>row.key!=="noncontinuation_requests");
    const active=queues.filter(row=>row.state==="ready"&&row.count>0);
    const unavailable=queues.some(row=>row.state==="unavailable");
    const total=active.reduce((sum,row)=>sum+(row.state==="ready"?row.count:0),0);
    const number=(value:number)=>new Intl.NumberFormat(locale).format(value);
    const tasksHref=`${base}/home/tasks${query(summary.asOf)}`;
    if(tasksOnly)return <div className="admin-start">
      <Link className="plain-button" href={`${base}/home`}>{text.back}</Link>
      <section className="admin-start-panel">
        <form className="admin-start-filter" onSubmit={event=>{event.preventDefault();update();}}>
          <label>{text.date}<input type="date" value={dateText||summary.asOf} onChange={event=>setDate(event.target.value)}/></label>
          <button className="plain-button" type="submit">{text.apply}</button>
        </form>
      </section>
      <section className="admin-start-panel admin-start-list">
        {!active.length&&!unavailable&&<p>{t.done}</p>}
        {queues.filter(row=>row.state==="unavailable"||row.count>0).map(row=>row.state==="ready"?
          <Link key={row.key} className="admin-start-row group-row" href={queueRoute(locale,row.route,row.filters.asOf)}><span>{queueLabels[locale][row.key]}</span><output>{number(row.count)}</output><Icon name="chevron"/></Link>:
          <div key={row.key} className="admin-start-row"><span>{queueLabels[locale][row.key]}</span><small>{t.unknown}</small></div>)}
        {queues.some(row=>row.state==="ready"&&row.count===0)&&<details className="admin-start-zero"><summary>{t.all}</summary>
          {queues.filter(row=>row.state==="ready"&&row.count===0).map(row=><Link key={row.key} className="admin-start-row group-row" href={queueRoute(locale,row.route,row.filters.asOf)}><span>{queueLabels[locale][row.key]}</span><output>{number(0)}</output><Icon name="chevron"/></Link>)}
        </details>}
      </section>
    </div>;
    const metrics=(["students","classes","teachers"] as const).filter(key=>overview?.[key]!=null);
    const attendance=overview?.attendance;
    const marked=attendance?attendance.present+attendance.late+attendance.absent:0;
    const percent=marked?Math.round(100*(attendance!.present+attendance!.late)/marked):0;
    const finance=overview?.finance;
    const currency=(minor:number)=>new Intl.NumberFormat(locale,{style:"currency",currency:finance!.currency}).format(minor/100);
    const detail=total>0?`${number(total)} ${t.tasks}`:unavailable?t.partial:t.done;
    return <div className="admin-start">
      <div className="admin-start-date">{dateLabel(summary.today,locale)} <Link href={`/${locale}/account/profile`}>{t.profile}</Link></div>
      <div className="admin-start-hero">
        <RoleHero persona="admin" title={text.work} detail={detail+(active.length?" · "+active.slice(0,2).map(row=>`${number(row.state==="ready"?row.count:0)} ${queueLabels[locale][row.key]}`).join(" · "):"")} action={{href:tasksHref,label:text.open}}/>
        {unavailable&&total>0&&<p className="admin-start-muted">{t.partial}</p>}
      </div>
      {metrics.length>0&&<section className="admin-start-section"><h2>{t.overview}</h2>
        <dl className="admin-start-metrics">{metrics.map(key=><div key={key} className="admin-start-panel">
          <Icon name={key==="students"?"students":key==="classes"?"school":"teacher"}/>
          <dd>{number(overview![key]!)}</dd><dt>{labels[key]}</dt>
        </div>)}</dl>
        {overview?.mayMonitor&&<Link className="admin-start-inline" href={`${base}/more/oversight`}>{t.classMonitor}<Icon name="chevron"/></Link>}
      </section>}
      {attendance&&<section className="admin-start-section"><h2>{attendance.date===summary.today?t.today:t.last}</h2>
        <div className="admin-start-panel">
          <p className="admin-start-muted">{dateLabel(attendance.date,locale)}</p>
          {marked>0?<div className="admin-start-attendance">
            <div className="admin-start-ring" style={{background:`conic-gradient(var(--primary) ${percent}%, var(--inset) 0)`}}><span>{number(percent)}%</span></div>
            <dl><div><dt>{t.present}</dt><dd>{number(attendance.present)}</dd></div><div><dt>{t.late}</dt><dd>{number(attendance.late)}</dd></div><div><dt>{t.absent}</dt><dd>{number(attendance.absent)}</dd></div></dl>
          </div>:<p>{t.noAttendance}</p>}
          <p className="admin-start-muted">{t.approved}: {number(attendance.approvedClasses)} / {number(attendance.expectedClasses)}</p>
          {overview?.mayMonitor&&<Link className="admin-start-inline" href={`${base}/more/attendance?date=${attendance.date}`}>{t.openAttendance}<Icon name="chevron"/></Link>}
        </div>
      </section>}
      {finance&&<section className="admin-start-section"><h2>{t.finance}</h2><div className="admin-start-panel">
        <p className="admin-start-muted">{new Intl.DateTimeFormat(locale,{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(finance.month+"-01T12:00:00Z"))} · {t.income}</p>
        <p className="admin-start-value"><bdi>{currency(finance.cash+finance.bank)}</bdi></p>
        <dl className="admin-start-split"><div><dt>{t.cash}</dt><dd><bdi>{currency(finance.cash)}</bdi></dd></div><div><dt>{t.bank}</dt><dd><bdi>{currency(finance.bank)}</bdi></dd></div></dl>
        <Link className="admin-start-inline" href={`${base}/more/finance-reports?period=${finance.month}`}>{t.openFinance}<Icon name="chevron"/></Link>
      </div></section>}
      {overview&&(overview.students!=null||overview.mayIssue||overview.mayPublish)&&<section className="admin-start-section"><h2>{labels.quick}</h2>
        <div className="admin-start-actions">
          {overview.students!=null&&<Link href={`${base}/students?add=family`}><span><Icon name="students"/></span>{t.family}</Link>}
          {overview.mayPublish&&<><Link href={`${base}/more/events?add=1`}><span><Icon name="attendance"/></span>{t.event}</Link><Link href={`${base}/more/broadcasts`}><span><Icon name="messages"/></span>{t.announce}</Link></>}
          {overview.mayIssue&&<Link href={`${base}/more/issue-invoices`}><span><Icon name="receipt"/></span>{t.invoice}</Link>}
        </div>
      </section>}
      {overview?.schoolDays&&<section className="admin-start-section"><h2>{t.next}</h2><div className="admin-start-panel">
        <p className="admin-start-value">{overview.schoolDays.next?dateLabel(overview.schoolDays.next,locale):t.noNext}</p>
        {overview.maySchedule&&<Link className="admin-start-inline" href={`${base}/more/timetable`}>{t.schedule}<Icon name="chevron"/></Link>}
      </div></section>}
      <SchoolUpdates locale={locale} today={summary.today} version={version}/>
    </div>;
  }}</TimetableRead>;
}

function action(locale:Locale,entry:QueueItem) {
  const base=`/${locale}/school`;
  const target=entry.target;
  if(target.kind==="guardian_link")return `${base}/students?guardian=${target.guardianId}&link=${target.linkId}`;
  if(target.kind==="family_import")return `${base}/students/import?job=${target.jobId}`;
  if(target.kind==="enrollment_stop")return `${base}/more/enrollment-stops?request=${target.requestId}`;
  if(target.kind==="attendance_sheet")return `${base}/more/attendance?class=${target.classId}&date=${target.date}`;
  if(target.kind==="receipt_match")return `${base}/more/receipts?receipt=${target.receiptId}`;
  if(target.kind==="bounced_invite")return `/${locale}/school/students?invite=${target.invitationId}`;
  return `${base}/more/assignments?year=${target.yearId}&class=${target.classId}`;
}

export function WorkQueue({locale,queue,asOf}:{locale:Locale;queue:WorkQueueKey;asOf?:string}){
  const text=copy[locale], actor=useAccountScope();
  const [generation,setGeneration]=useState(0);
  const [busy,setBusy]=useState(false);
  const [failure,setFailure]=useState<string>();
  const [state,setState]=useState<{
    key:string;payload?:{items:QueueItem[];asOf:string;next?:string};error?:unknown;
  }>();
  const path=`/school/work-queues/${queue}${query(asOf)}` as const;

  useEffect(()=>{
    const abort=new AbortController();
    const reload=()=>setGeneration((count)=>count+1);
    requestApi(path,queuePageSchema,{signal:abort.signal,headers:{"X-School-Persona":actor.persona}})
      .then(({data,meta})=>{if(!abort.signal.aborted)setState({key:path,payload:{...data,next:meta?.nextCursor}});})
      .catch((error)=>{if(!abort.signal.aborted)setState({key:path,error});});
    window.addEventListener("focus",reload);
    return ()=>{abort.abort();window.removeEventListener("focus",reload);};
  },[actor.persona,generation,path]);

  const current=state?.key===path?state:undefined;
  const payload=current?.payload;

  async function more(){
    if(!payload?.next||busy)return;
    setBusy(true);
    setFailure(undefined);
    try{
      const {data,meta}=await requestApi(`/school/work-queues/${queue}?asOf=${payload.asOf}&cursor=${payload.next}`,queuePageSchema,{
        headers:{"X-School-Persona":actor.persona},
      });
      setState((old)=>old?.payload===payload?{key:path,payload:{asOf:data.asOf,items:[...payload.items,...data.items],next:meta?.nextCursor}}:old);
    }catch(error){
      if(error instanceof ApiResponseError && [401,403,404].includes(error.status))setState({key:path,error});
      else setFailure(timetableError(locale,error));
    }finally{setBusy(false);}
  }

  return <>
    <h1>{queueLabels[locale][queue]}</h1>
    <Link className="plain-button" href={`/${locale}/school/home/tasks${query(payload?.asOf??asOf)}`}>{text.back}</Link>
    <AsyncSurface locale={locale} state={current?.error?current.error instanceof ApiResponseError&&[401,403,404].includes(current.error.status)
      ?{kind:"forbidden"}:{kind:"error",retry:()=>setGeneration((count)=>count+1),message:timetableError(locale,current.error)}
      :payload?{kind:"ready",content:<section className="auth-card">
        <p><bdi dir="ltr">{payload.asOf}</bdi></p>
        {payload.items.length===0&&<p>{text.empty}</p>}
        <ul className="group-list">{payload.items.map((entry)=><li key={entry.id}>
          <Link className="group-row" href={action(locale,entry)}>
            <bdi>{locale==="ar"?entry.titleAr:entry.titleDe}</bdi>
            <small><bdi>{locale==="ar"?entry.detailAr:entry.detailDe}</bdi></small>
          </Link>
        </li>)}</ul>
        {payload.next&&<button className="plain-button" onClick={()=>void more()} disabled={busy}>{text.more}</button>}
        {failure&&<p role="alert">{failure}</p>}
      </section>}:{kind:"initialLoading"}}/>
  </>;
}
