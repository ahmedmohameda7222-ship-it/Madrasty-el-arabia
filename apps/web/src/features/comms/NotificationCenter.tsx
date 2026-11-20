"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {
  noticeCount,noticeDestination,noticeReadReceipt,noticeRecord,preferencesSchema,type Locale,type NoticeTarget,
} from "@madrasty/contracts";
import {ApiResponseError,requestApi} from "@/api/client";
import {webHeaders} from "@/api/client-headers";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {timetableError} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {AsyncSurface} from "@/ui/AsyncSurface";
import {Icon} from "@/ui/Icon";
import {
  activateBrowserPush,browserPushSupported,detachBrowserPush,disableBrowserPush,prepareBrowserPush,reconcileBrowserPush,standaloneOnIPhone,
} from "./push-device";

const copy={
  ar:{title:"الإشعارات",unread:"غير المقروءة",all:"كل الإشعارات",mark:"تحديد كمقروء",open:"افتح الإشعار",updated:"اتحدّث",back:"رجوع للإشعارات",
    refresh:"تحديث",unavailable:"التفاصيل مش متاحة لحسابك حاليًا.",preferences:"تفضيلات الحساب",correspondence:"لغة المراسلات",
    ar:"العربية",de:"الألمانية",device:"إشعارات الجهاز",enable:"تفعيل على الجهاز ده",disable:"إيقاف على الجهاز ده",enabled:"إشعارات الجهاز مفعّلة.",
    denied:"السماح بإشعارات الجهاز موقوف في إعداداته.",pushUnavailable:"إشعارات الجهاز غير متاحة. الإشعارات داخل التطبيق والبريد شغّالين حسب إعداداتك.",
    install:"على iPhone افتح التطبيق من أيقونته على الشاشة الرئيسية عشان تفعّل إشعارات الجهاز.",
    thread:"المحادثة",broadcast:"الإعلان",child:"ملف الطالب",attendance:"سجل الحضور",exam:"الامتحان",evaluation:"التقييم",
    homework:"الواجب",activity:"النشاط",application:"طلب التدريس",invoice:"الفاتورة",receipt:"الإيصال",fee_stop:"طلب عدم الاستمرار"},
  de:{title:"Benachrichtigungen",unread:"Ungelesen",all:"Alle Benachrichtigungen",mark:"Als gelesen markieren",open:"Benachrichtigung öffnen",
    updated:"Aktualisiert",back:"Zurück zu den Benachrichtigungen",refresh:"Aktualisieren",unavailable:"Die Details sind für dein Konto derzeit nicht verfügbar.",
    preferences:"Kontoeinstellungen",correspondence:"Sprache für Mitteilungen",ar:"Arabisch",de:"Deutsch",device:"Gerätebenachrichtigungen",
    enable:"Auf diesem Gerät aktivieren",disable:"Auf diesem Gerät deaktivieren",enabled:"Gerätebenachrichtigungen sind aktiviert.",
    denied:"Gerätebenachrichtigungen sind in den Einstellungen blockiert.",
    pushUnavailable:"Gerätebenachrichtigungen sind nicht verfügbar. Mitteilungen in der App und per E-Mail bleiben verfügbar.",
    install:"Öffne die Web-App auf dem iPhone über den Home-Bildschirm, um Gerätebenachrichtigungen zu aktivieren.",
    thread:"Unterhaltung",broadcast:"Mitteilung",child:"Schülerprofil",attendance:"Anwesenheit",exam:"Prüfung",evaluation:"Beurteilung",
    homework:"Hausaufgabe",activity:"Aktivität",application:"Bewerbung als Lehrkraft",invoice:"Rechnung",receipt:"Beleg",fee_stop:"Abmeldeantrag"},
} as const;

const listSchema=noticeRecord.array();
const changed="madrasty-notices-changed";
const noticeURL=(locale:Locale)=>`/${locale}/school/more/notifications`;
function targetLink(locale:Locale,target:NoticeTarget){
  const root=`/${locale}/school`,id=target.id;
  switch(target.kind){
    case "thread":return `${root}/messages?thread=${id}`;
    case "broadcast":return `${root}/more/broadcasts?announcement=${id}`;
    case "child":return `${root}/children?child=${id}`;
    case "attendance":return `${root}/children/${target.childId}/attendance`;
    case "exam":return `${root}/more/exams?child=${target.childId}&exam=${id}`;
    case "evaluation":return `${root}/more/evaluations?child=${target.childId}&evaluation=${id}`;
    case "activity":return `${root}/more/academics?child=${target.childId}&activity=${id}`;
    case "homework":return `${root}/more/homework?child=${target.childId}&work=${id}`;
    case "application":return `/${locale}/apply`;
    case "invoice":return `${root}/more/invoices?invoice=${id}`;
    case "receipt":return `${root}/more/receipts?receipt=${id}`;
    case "fee_stop":return `${root}/more/enrollment-stops?request=${id}`;
    default:return null;
  }
}

export function NotificationLink({locale}:{locale:Locale}){
  const actor=useAccountScope(),labels=copy[locale];
  const [count,setCount]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();
    let pending=false;
    const sync=async()=>{
      if(pending||document.hidden)return;
      pending=true;
      try{
        const {data}=await requestApi("/notifications/count",noticeCount,{headers:{"X-School-Persona":actor.persona},signal:abort.signal});
        if(abort.signal.aborted)return;
        setCount(data.unread);
        const badge=navigator as Navigator&{setAppBadge?:(amount?:number)=>Promise<void>;clearAppBadge?:()=>Promise<void>};
        if(data.unread)void badge.setAppBadge?.(data.unread).catch(()=>undefined);
        else void badge.clearAppBadge?.().catch(()=>undefined);
      }catch(error){
        if(!abort.signal.aborted&&error instanceof ApiResponseError&&[401,403].includes(error.status)){
          setCount(0);void detachBrowserPush(false);
        }
      }finally{pending=false;}
    };
    const reconcile=()=>{void reconcileBrowserPush(actor,abort.signal).catch(()=>undefined);};
    function wake(){void sync();reconcile();}
    function rotate(message:MessageEvent){
      if(message.data?.type==="madrasty-push-refresh")void reconcileBrowserPush(actor,abort.signal,true).catch(()=>undefined);
    }
    navigator.serviceWorker?.addEventListener("message",rotate);
    const timer=window.setInterval(()=>void sync(),25000);
    window.addEventListener(changed,sync);window.addEventListener("focus",wake);window.addEventListener("online",wake);
    document.addEventListener("visibilitychange",sync);
    wake();
    return ()=>{
      abort.abort();window.clearInterval(timer);
      window.removeEventListener(changed,sync);window.removeEventListener("focus",wake);window.removeEventListener("online",wake);
      document.removeEventListener("visibilitychange",sync);
      navigator.serviceWorker?.removeEventListener("message",rotate);
    };
  },[actor.accountId,actor.sessionId,actor.persona]);
  const amount=new Intl.NumberFormat(locale).format(count);
  return <Link className="plain-button notice-link" href={noticeURL(locale)}
    aria-label={count?`${labels.title} · ${labels.unread} ${amount}`:labels.title}>
    <Icon name="bell"/>{count>0&&<span className="notice-count" aria-hidden="true">{count>99?"99+":amount}</span>}
  </Link>;
}

export function NotificationCenter({locale,selected}:{locale:Locale;selected?:string}){
  const labels=copy[locale],{persona}=useAccountScope();
  const [onlyUnread,setOnlyUnread]=useState(false),[refresh,setRefresh]=useState(0);
  const [busy,setBusy]=useState<string>(),[error,setError]=useState("");
  const rows=useAcademicPage(selected?null:`/notifications?limit=25&unread=${onlyUnread}&locale=${locale}`,listSchema,refresh);
  const [read,setRead]=useState<Record<string,string>>({});
  function wake(){setRefresh((old)=>old+1);}
  useEffect(()=>{
    window.addEventListener("focus",wake);window.addEventListener("online",wake);
    return ()=>{window.removeEventListener("focus",wake);window.removeEventListener("online",wake);};
  },[]);
  async function mark(id:string){
    if(busy)return;
    setBusy(id);setError("");
    try{
      const result=await requestApi(`/notifications/${id}`,noticeReadReceipt,{
        method:"PATCH",headers:webHeaders(persona),body:JSON.stringify({read:true}),
      });
      setRead((previous)=>({...previous,[id]:result.data.readAt}));
      window.dispatchEvent(new Event(changed));
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(undefined);}
  }
  return <section className="auth-card auth-form">
    <h1>{labels.title}</h1>
    {selected?<NoticeDetail key={selected} locale={locale} selected={selected}/>:
      <>
        <div className="header-actions">
          <button type="button" className="plain-button" aria-pressed={!onlyUnread} onClick={()=>setOnlyUnread(false)}>{labels.all}</button>
          <button type="button" className="plain-button" aria-pressed={onlyUnread} onClick={()=>setOnlyUnread(true)}>{labels.unread}</button>
          <button type="button" className="plain-button" onClick={wake}>{labels.refresh}</button>
        </div>
        {error&&<p role="alert">{error}</p>}
        <AcademicPageItems locale={locale} page={rows}>{(entries)=>{
          const visible=entries.filter((item)=>!onlyUnread||!read[item.id]);
          if(!visible.length)return <AsyncSurface locale={locale} state={{kind:"empty"}}/>;
          return <ul className="group-list">{visible.map((entry)=>{
            const unread=!entry.readAt&&!read[entry.id]&&!entry.superseded;
            return <li key={entry.id} className="timetable-day">
              <Link className="group-row" href={`${noticeURL(locale)}?notice=${entry.id}`}>
                {unread?<strong>{entry.title}</strong>:<span>{entry.title}</span>}
                <small><bdi>{new Date(entry.createdAt).toLocaleString(locale==="ar"?"ar":"de-DE")}</bdi></small>
              </Link>
              {entry.superseded&&<small>{labels.updated}</small>}
              {unread&&<button className="plain-button" type="button" disabled={!!busy} onClick={()=>void mark(entry.id)}>{labels.mark}</button>}
            </li>;
          })}</ul>;
        }}</AcademicPageItems>
        <PushPreferences locale={locale}/>
      </>}
  </section>;
}

function NoticeDetail({locale,selected}:{locale:Locale;selected:string}){
  const {persona}=useAccountScope(),labels=copy[locale];
  const [value,setValue]=useState<ReturnType<typeof noticeDestination.parse>>(),[error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();
    const route=`/notifications/${selected}` as const;
    void requestApi(route,noticeDestination,{headers:{"X-School-Persona":persona},signal:abort.signal})
      .then(async({data})=>{
        if(abort.signal.aborted)return;
        setValue(data);
        await requestApi(route,noticeReadReceipt,{
          method:"PATCH",headers:webHeaders(persona),signal:abort.signal,body:JSON.stringify({read:true}),
        });
        window.dispatchEvent(new Event(changed));
      }).catch((problem)=>{
        if(!abort.signal.aborted){
          if(problem instanceof ApiResponseError&&[401,403,404].includes(problem.status)){setValue({state:"unavailable"});return;}
          setError(timetableError(locale,problem));
        }
      });
    return ()=>abort.abort();
  },[selected,persona,retry,locale]);
  const links=value?.state==="open"?value.targets.map((item)=>({item,href:targetLink(locale,item)})).filter((entry)=>entry.href!==null):[];
  return <div className="auth-form">
    <Link className="plain-button" href={noticeURL(locale)}>{labels.back}</Link>
    {error&&<AsyncSurface locale={locale} state={{kind:"error",message:error,retry:()=>{setError("");setRetry((n)=>n+1);}}}/>}
    {!value&&!error&&<AsyncSurface locale={locale} state={{kind:"initialLoading"}}/>}
    {value&&!links.length&&<p>{labels.unavailable}</p>}
    {links.length>0&&<ul className="group-list">{links.map(({item,href},index)=><li key={`${item.kind}/${item.id}/${index}`}>
      <Link className="plain-button" href={href!}>{labels[item.kind]} {links.length>1&&new Intl.NumberFormat(locale).format(index+1)}</Link>
    </li>)}</ul>}
  </div>;
}

function PushPreferences({locale}:{locale:Locale}){
  const actor=useAccountScope(),labels=copy[locale];
  const [option,setOption]=useState<Awaited<ReturnType<typeof prepareBrowserPush>>>();
  const [state,setState]=useState<"loading"|"enabled"|"denied"|"disabled"|"unavailable"|"install">("loading");
  const [preference,setPreference]=useState<Locale>();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    const abort=new AbortController();
    const options={signal:abort.signal,headers:{"X-School-Persona":actor.persona}};
    void requestApi(`/account/preferences?locale=${locale}`,preferencesSchema,options)
      .then(({data})=>{if(!abort.signal.aborted)setPreference(data.correspondenceLocale);}).catch(()=>undefined);
    if(!standaloneOnIPhone())setState("install");
    else if(!browserPushSupported())setState("unavailable");
    else {
      const finish=setTimeout(()=>{if(!abort.signal.aborted)setState((old)=>old==="loading"?"unavailable":old);},5000);
      void prepareBrowserPush(actor,abort.signal).then(async(output)=>{
        if(abort.signal.aborted)return;
        if(!output){setState("unavailable");return;}
        setOption(output);
        const active=await reconcileBrowserPush(actor,abort.signal).catch(()=>false);
        if(!abort.signal.aborted)setState(active?"enabled":Notification.permission==="denied"?"denied":"disabled");
      }).catch(()=>{if(!abort.signal.aborted)setState("unavailable");}).finally(()=>clearTimeout(finish));
    }
    return ()=>abort.abort();
  },[actor.accountId,actor.sessionId,actor.persona,locale]);
  async function toggle(){
    if(busy)return;
    setBusy(true);setError("");
    try{
      if(state==="enabled"){await disableBrowserPush(actor);setState("disabled");}
      else if(option)setState(await activateBrowserPush(actor,option));
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  return <section className="timetable-day auth-form">
    <h2>{labels.device}</h2>
    {preference&&<p>{labels.correspondence} · {labels[preference]}</p>}
    <Link className="plain-button" href={`/${locale}/account/preferences`}>{labels.preferences}</Link>
    {state==="install"&&<p>{labels.install}</p>}
    {state==="unavailable"&&<p>{labels.pushUnavailable}</p>}
    {state==="denied"&&<p>{labels.denied}</p>}
    {state==="enabled"&&<p role="status">{labels.enabled}</p>}
    {(state==="enabled"||state==="disabled")&&<button className="plain-button" type="button" disabled={busy}
      onClick={()=>void toggle()}>{state==="enabled"?labels.disable:labels.enable}</button>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
