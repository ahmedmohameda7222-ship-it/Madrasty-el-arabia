"use client";

import {useEffect,useRef,useState,type FormEvent} from "react";
import {messageReportEntry,messageReportReceipt,type Locale,type MessageReport} from "@madrasty/contracts";
import {ApiResponseError,requestApi} from "@/api/client";
import {webHeaders} from "@/features/identity/SessionControls";
import {timetableError} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {AsyncSurface} from "@/ui/AsyncSurface";

export const reportCopy={
  ar:{title:"بلاغات الرسائل",report:"الإبلاغ عن الرسالة",reason:"سبب البلاغ",submit:"إرسال البلاغ",cancel:"إلغاء",sent:"اتسجّل البلاغ للمراجعة.",
    pending:"بانتظار المراجعة",in_review:"قيد المراجعة",resolved:"تمت المراجعة",dismissed:"تم رفض البلاغ",mark:"بدء المراجعة",
    close:"إغلاق البلاغ",dismiss:"رفض البلاغ",redact:"إخفاء الرسالة وإغلاق البلاغ",confirm:"إخفاء الرسالة من المحادثة؟",
    back:"رجوع للبلاغات",more:"بلاغات أقدم",open:"مراجعة البلاغ",school:"المدرسة",photo:"مرفق صورة",voice:"رسالة صوتية",
    mediaError:"تعذّر فتح المرفق.",removed:"الرسالة اتشالت من العرض.",none:"مفيش بلاغات مخصصة لك حاليًا."},
  de:{title:"Gemeldete Nachrichten",report:"Nachricht melden",reason:"Grund der Meldung",submit:"Meldung senden",cancel:"Abbrechen",
    sent:"Die Meldung wurde zur Prüfung eingereicht.",pending:"Wartet auf Prüfung",in_review:"In Prüfung",resolved:"Geprüft",dismissed:"Abgewiesen",
    mark:"Prüfung beginnen",close:"Meldung abschließen",dismiss:"Meldung abweisen",redact:"Nachricht ausblenden und Meldung abschließen",
    confirm:"Nachricht in der Unterhaltung ausblenden?",back:"Zurück zu den Meldungen",more:"Ältere Meldungen",open:"Meldung prüfen",
    school:"Schule",photo:"Fotoanhang",voice:"Sprachnachricht",mediaError:"Der Anhang konnte nicht geöffnet werden.",
    removed:"Die Nachricht wurde ausgeblendet.",none:"Dir sind derzeit keine Meldungen zugewiesen."},
} as const;

export function PrivateChatMedia({locale,path,kind}:{locale:Locale;path:string;kind:"photo"|"voice"}){
  const text=reportCopy[locale];
  const [failed,setFailed]=useState(false);
  return <div>
    {failed?<p role="status">{text.mediaError}</p>:kind==="photo"?
      <img src={path} alt={text.photo} width={280} loading="lazy" style={{maxWidth:"100%",height:"auto",objectFit:"contain"}} onError={()=>setFailed(true)}/>:
      <audio aria-label={text.voice} src={path} controls preload="none" style={{maxWidth:"100%"}} onError={()=>setFailed(true)}/>}
  </div>;
}

export function ReportMessage({locale,thread,message}:{locale:Locale;thread:string;message:string}){
  const text=reportCopy[locale],{persona}=useAccountScope();
  const [open,setOpen]=useState(false),[reason,setReason]=useState(""),[error,setError]=useState("");
  const [key,setKey]=useState<string>(),[sent,setSent]=useState(false),[busy,setBusy]=useState(false);
  const reportForm=useRef<HTMLFormElement>(null);
  useEffect(()=>{if(open)reportForm.current?.scrollIntoView({block:"nearest",inline:"nearest"});},[open]);
  async function submit(event:FormEvent){
    event.preventDefault();
    if(busy||!reason.trim())return;
    const command=key??crypto.randomUUID();
    setKey(command);setBusy(true);setError("");
    try{
      await requestApi("/message-reports",messageReportReceipt,{
        method:"POST",headers:{...webHeaders(persona),"Idempotency-Key":command},body:JSON.stringify({threadId:thread,messageId:message,reason}),
      });
      setSent(true);setOpen(false);setReason("");
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  if(sent)return <small role="status">{text.sent}</small>;
  if(!open)return <button type="button" className="plain-button" onClick={()=>setOpen(true)}>{text.report}</button>;
  return <form ref={reportForm} className="auth-form comms-report-form" onSubmit={(event)=>void submit(event)}>
    <label>{text.reason}<textarea value={reason} rows={2} maxLength={500} disabled={busy}
      onChange={(event)=>{setReason(event.target.value);setKey(undefined);}}/></label>
    <div className="header-actions">
      <button type="submit" className="primary-button" disabled={busy||!reason.trim()}>{text.submit}</button>
      <button type="button" className="plain-button" disabled={busy} onClick={()=>{setOpen(false);setError("");}}>{text.cancel}</button>
    </div>
    {error&&<p role="alert">{error}</p>}
  </form>;
}

export function ReportQueue({locale}:{locale:Locale}){
  const text=reportCopy[locale],{persona}=useAccountScope();
  const [rows,setRows]=useState<MessageReport[]>(),[selected,setSelected]=useState<string>();
  const [report,setReport]=useState<MessageReport>(),[cursor,setCursor]=useState<string>(),[reload,setReload]=useState(0);
  const [error,setError]=useState(""),[forbidden,setForbidden]=useState(false),[busy,setBusy]=useState(false);
  const [command,setCommand]=useState<{intent:string;key:string}>();
  useEffect(()=>{
    const abort=new AbortController();
    if(selected){
      void requestApi(`/message-reports/${selected}`,messageReportEntry,{signal:abort.signal,headers:{"X-School-Persona":persona}})
        .then(({data})=>setReport(data))
        .catch((problem)=>{if(!abort.signal.aborted){setReport(undefined);setError(timetableError(locale,problem));}});
    }else{
      void requestApi("/message-reports?limit=24",messageReportEntry.array(),{signal:abort.signal,headers:{"X-School-Persona":persona}})
        .then(({data,meta})=>{setRows(data);setCursor(meta?.nextCursor);})
        .catch((problem)=>{
          if(abort.signal.aborted)return;
          if(problem instanceof ApiResponseError&&[401,403].includes(problem.status)){setRows(undefined);setForbidden(true);}
          else setError(timetableError(locale,problem));
        });
    }
    return ()=>abort.abort();
  },[selected,reload,locale,persona]);

  async function page(){
    if(!cursor||busy)return;
    setBusy(true);setError("");
    try{
      const {data,meta}=await requestApi(`/message-reports?limit=24&cursor=${encodeURIComponent(cursor)}`,messageReportEntry.array(),
        {headers:{"X-School-Persona":persona}});
      setRows((current)=>[...(current??[]),...data]);setCursor(meta?.nextCursor);
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  async function review(state:"in_review"|"resolved"|"dismissed",redact=false){
    if(!report||busy||redact&&!window.confirm(text.confirm))return;
    const intent=`${report.id}/${report.revision}/${state}/${redact}`;
    const key=command?.intent===intent?command.key:crypto.randomUUID();
    setCommand({intent,key});setBusy(true);setError("");
    try{
      const result=await requestApi(`/message-reports/${report.id}`,messageReportEntry,{
        method:"PATCH",headers:{...webHeaders(persona),"Idempotency-Key":key},
        body:JSON.stringify({state,revision:report.revision,action:redact?"redact":undefined}),
      });
      setReport(result.data);setCommand(undefined);
    }catch(problem){
      setError(timetableError(locale,problem));
      if(problem instanceof ApiResponseError&&[401,403,404].includes(problem.status))setReport(undefined);
      if(problem instanceof ApiResponseError&&problem.code==="stale_revision")setReload((value)=>value+1);
    }finally{setBusy(false);}
  }
  if(forbidden)return <AsyncSurface locale={locale} state={{kind:"forbidden"}}/>;
  return <section className="auth-card">
    <h1>{text.title}</h1>
    {error&&<p role="alert">{error}</p>}
    {selected?<div className="auth-form">
      <button type="button" className="plain-button" disabled={busy} onClick={()=>{setSelected(undefined);setReport(undefined);setError("");}}>{text.back}</button>
      {!report&&!error&&<AsyncSurface locale={locale} state={{kind:"initialLoading"}}/>}
      {report&&<div className="auth-form">
        <p>{text[report.state]}</p>
        <p><strong>{text.reason}</strong></p><p dir="auto">{report.reason}</p>
        <p><bdi>{report.authorName??text.school}</bdi> · <bdi>{new Date(report.messageCreatedAt).toLocaleString(locale==="ar"?"ar":"de-DE")}</bdi></p>
        {report.messageBody&&<p dir="auto" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{report.messageBody}</p>}
        {report.attachments.map((item)=><PrivateChatMedia key={item.id} locale={locale} kind={item.kind}
          path={`/api/v1/message-reports/${report.id}/media/${item.id}`}/>)}
        {(report.state==="pending"||report.state==="in_review")&&<div className="header-actions">
          {report.state==="pending"&&<button type="button" className="plain-button" disabled={busy} onClick={()=>void review("in_review")}>{text.mark}</button>}
          <button type="button" className="plain-button" disabled={busy} onClick={()=>void review("resolved")}>{text.close}</button>
          <button type="button" className="plain-button" disabled={busy} onClick={()=>void review("dismissed")}>{text.dismiss}</button>
          <button type="button" className="plain-button" disabled={busy} onClick={()=>void review("resolved",true)}>{text.redact}</button>
        </div>}
      </div>}
    </div>:rows?<div className="auth-form">
      {!rows.length&&<p>{text.none}</p>}
      <ul className="group-list">{rows.map((entry)=><li key={entry.id} className="timetable-day">
        <p>{text[entry.state]} · <bdi>{new Date(entry.createdAt).toLocaleString(locale==="ar"?"ar":"de-DE")}</bdi></p>
        <button type="button" className="plain-button" onClick={()=>{setSelected(entry.id);setError("");}}>{text.open}</button>
      </li>)}</ul>
      {cursor&&<button type="button" className="plain-button" disabled={busy} onClick={()=>void page()}>{text.more}</button>}
    </div>:<AsyncSurface locale={locale} state={error?{kind:"error",message:error,retry:()=>{setError("");setReload((value)=>value+1);}}:{kind:"initialLoading"}}/>}
  </section>;
}
