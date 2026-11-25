"use client";

import { useEffect,useRef,useState,type FormEvent,type PointerEvent } from "react";
import {
  chatMessage,messageReaction,postMessageInput,reactionEmoji,threadReaderState,
  type ChatMessage,type Locale,type ThreadSummary,
} from "@madrasty/contracts";
import { ApiResponseError,requestApi } from "@/api/client";
import { webHeaders } from "@/features/identity/SessionControls";
import { timetableError } from "@/features/school/timetable/shared";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { MediaComposer } from "./MediaComposer";
import { Icon } from "@/ui/Icon";
import { projectReaction } from "./chat-state";
import { PrivateChatMedia,ReportMessage,reportCopy } from "./ReportQueue";

const copy={
  ar:{search:"ابحث في المحادثة",find:"بحث",clear:"مسح البحث",older:"رسائل أقدم",body:"رسالتك",send:"إرسال",
    sending:"جارٍ الإرسال",failed:"الإرسال تعذّر. المسودة محفوظة هنا.",retry:"أعد الإرسال",reply:"رد",cancelReply:"إلغاء الرد",
    reactions:"التفاعلات",school:"المدرسة",seen:"اتقرأت",sent:"اترسلت",archive:"أرشفة عندي",restore:"إرجاع للمحادثات",
    archived:"مؤرشفة عندك",closed:"المحادثة للعرض فقط.",photo:"صورة",voice:"رسالة صوتية",target:"افتح الرسالة المقتبسة"},
  de:{search:"Unterhaltung durchsuchen",find:"Suchen",clear:"Suche zurücksetzen",older:"Ältere Nachrichten",body:"Nachricht",send:"Senden",
    sending:"Wird gesendet",failed:"Nachricht konnte nicht gesendet werden. Der Entwurf ist hier verfügbar.",retry:"Erneut senden",reply:"Antworten",
    cancelReply:"Antwort verwerfen",reactions:"Reaktionen",school:"Schule",seen:"Gelesen",sent:"Gesendet",archive:"Für mich archivieren",
    restore:"In Unterhaltungen zurückholen",archived:"Für dich archiviert",closed:"Du kannst diese Unterhaltung lesen.",photo:"Foto",
    voice:"Sprachnachricht",target:"Zitierte Nachricht öffnen"},
} as const;
const messageList=chatMessage.array(),reactions=messageReaction.array();
type Proposed=ReturnType<typeof postMessageInput.parse>;
const unavailable=(problem:unknown)=>problem instanceof ApiResponseError&&[401,403,404].includes(problem.status);
const newer=(a:string,b:string)=>BigInt(a)>BigInt(b);
function merge(older:ChatMessage[],incoming:ChatMessage[]){
  const byId=new Map(older.map((item)=>[item.id,item]));
  incoming.forEach((item)=>byId.set(item.id,item));
  return [...byId.values()].sort((a,b)=>a.sequence===b.sequence?0:newer(a.sequence,b.sequence)?1:-1);
}

export function Conversation({locale,thread,changed}:{locale:Locale;thread:ThreadSummary;changed:()=>void}){
  const {persona}=useAccountScope(),text=copy[locale],root=`/threads/${thread.id}` as const;
  const [term,setTerm]=useState(""),[query,setQuery]=useState("");
  const messageArea=useRef<HTMLDivElement>(null);
  const followTail=useRef(true);
  useEffect(()=>{
    const area=messageArea.current;if(!area)return;
    const track=()=>{followTail.current=area.scrollHeight-area.scrollTop-area.clientHeight<80;};
    const update=()=>{if(followTail.current)area.scrollTop=area.scrollHeight;};
    area.addEventListener("scroll",track,{passive:true});
    const observer=new ResizeObserver(update);
    const timeline=area.querySelector(".comms-timeline");if(timeline)observer.observe(timeline);
    const mutations=new MutationObserver(()=>{const target=area.querySelector(".comms-timeline");if(target)observer.observe(target);update();});
    mutations.observe(area,{childList:true,subtree:true});
    return ()=>{area.removeEventListener("scroll",track);observer.disconnect();mutations.disconnect();};
  },[]);
  const [body,setBody]=useState(""),[quote,setQuote]=useState<ChatMessage>();
  const [attempt,setAttempt]=useState<{payload:Proposed;pending:boolean;failed:boolean}>();
  const [ack,setAck]=useState<ChatMessage>(),[lost,setLost]=useState(false);
  const [attachment,setAttachment]=useState<string>(),[consumed,setConsumed]=useState<string>(),[preparing,setPreparing]=useState(false);
  const [archived,setArchived]=useState(thread.archived),[notice,setNotice]=useState("");
  const archiveBusy=useRef(false);
  const live=useRef(false),sending=useRef(false),confirmed=useRef<string|undefined>(undefined);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>setArchived(thread.archived),[thread.archived]);
  function deny(){setLost(true);setBody("");setQuote(undefined);setAttempt(undefined);setAck(undefined);setAttachment(undefined);changed();}
  function clearSent(payload:Proposed){
    confirmed.current=payload.clientMessageId;
    setAttempt(undefined);setBody("");setQuote(undefined);
    if(payload.attachmentIds?.[0]){
      setConsumed(payload.attachmentIds[0]);setAttachment(undefined);
    }
  }
  function recognize(rows:ChatMessage[]){
    const payload=attempt?.payload;
    if(payload&&rows.some((item)=>item.clientMessageId===payload.clientMessageId))clearSent(payload);
  }
  async function send(payload:Proposed){
    if(sending.current||lost||!thread.canReply)return;
    sending.current=true;
    setAttempt({payload,pending:true,failed:false});
    try{
      const result=await requestApi(`${root}/messages`,chatMessage,{
        method:"POST",headers:{...webHeaders(persona),"Idempotency-Key":payload.clientMessageId},body:JSON.stringify(payload),
      });
      if(!live.current)return;
      setAck(result.data);
      if(confirmed.current!==payload.clientMessageId){
        clearSent(payload);
      }
    }catch(problem){
      if(!live.current||confirmed.current===payload.clientMessageId)return;
      if(unavailable(problem))deny();
      else {setAttempt({payload,pending:false,failed:true});if(problem instanceof ApiResponseError&&problem.status===409)changed();}
    }finally{sending.current=false;}
  }
  function compose(event:FormEvent){
    event.preventDefault();
    if(preparing)return;
    if(attempt?.failed&&attempt.payload.attachmentIds?.[0]===attachment){void send(attempt.payload);return;}
    const message=postMessageInput.safeParse({clientMessageId:crypto.randomUUID(),body:body.trim()||undefined,
      attachmentIds:attachment?[attachment]:undefined,replyToId:quote?.id});
    if(message.success)void send(message.data);
  }
  async function archive(){
    if(archiveBusy.current)return;
    archiveBusy.current=true;
    const next=!archived;setArchived(next);
    try{
      const state=await requestApi(`${root}/state`,threadReaderState,{
        method:"PATCH",headers:webHeaders(persona),body:JSON.stringify({archived:next}),
      });
      setArchived(state.data.archived);setNotice("");changed();
    }catch(problem){
      if(unavailable(problem))deny();
      else {setArchived(!next);setNotice(timetableError(locale,problem));}
    }finally{archiveBusy.current=false;}
  }
  if(lost)return <AsyncSurface locale={locale} state={{kind:"forbidden"}}/>;
  return <section className="comms-conversation auth-form" aria-label={text.search}>
    <details className="comms-chat-options"><summary>{locale==="ar"?"خيارات المحادثة":"Chat-Optionen"}</summary>
    <div className="header-actions">
      <button type="button" className="plain-button" onClick={()=>void archive()}>{archived?text.restore:text.archive}</button>
      {archived&&<p>{text.archived}</p>}{notice&&<p role="alert">{notice}</p>}
    </div>
    <form className="auth-form" onSubmit={(event)=>{event.preventDefault();setTerm(query.trim());}}>
      <label>{text.search}<input type="search" maxLength={120} value={query} onChange={(event)=>setQuery(event.target.value)}/></label>
      <div className="header-actions">
        <button type="submit" className="plain-button">{text.find}</button>
        {term&&<button type="button" className="plain-button" onClick={()=>{setTerm("");setQuery("");}}>{text.clear}</button>}
      </div>
    </form>
    </details>
    <div className="comms-message-area" ref={messageArea}>
    <Timeline key={term} locale={locale} thread={thread} term={term} ack={ack} reply={setQuote} deny={deny}
      recognize={recognize} updateArchive={setArchived}/>
    {attempt&&<div className="comms-message comms-pending" data-own="true" role={attempt.failed?"alert":"status"}>
      <p dir="auto">{attempt.payload.body}</p>
      <small>{attempt.pending?text.sending:text.failed}</small>
    </div>}
    </div>
    {thread.canReply?<form className="comms-composer auth-form" onSubmit={compose}>
      {quote&&<div className="notice">
        <span>{text.reply} · <bdi>{quote.authorName??text.school}</bdi></span>
        {quote.body&&<p dir="auto">{quote.body.slice(0,140)}</p>}
        <button className="plain-button" type="button" disabled={attempt?.pending} onClick={()=>{setQuote(undefined);setAttempt(undefined);}}>{text.cancelReply}</button>
      </div>}
      <div className="comms-input-bar">
        <MediaComposer locale={locale} persona={persona} thread={thread.id} locked={attempt?.pending===true} consumed={consumed}
          onReady={setAttachment} onBusy={setPreparing}/>
        <label className="comms-input-field"><textarea aria-label={text.body} placeholder={locale==="ar"?"اكتب رسالة…":"Nachricht schreiben…"} dir="auto" value={body} maxLength={4000} rows={1} disabled={attempt?.pending}
          onChange={(event)=>{setBody(event.target.value);setAttempt(undefined);}}/></label>
        <button className="comms-icon-button comms-send-button" type="submit" aria-label={attempt?.failed?text.retry:text.send} disabled={(!body.trim()&&!attachment)||preparing||attempt?.pending}>
          <Icon name={attempt?.failed?"retry":"sendUp"}/>
        </button>
      </div>
    </form>:<p>{text.closed}</p>}
  </section>;
}

function Timeline({locale,thread,term,ack,reply,deny,recognize,updateArchive}:{locale:Locale;thread:ThreadSummary;term:string;ack?:ChatMessage;
  reply:(value:ChatMessage)=>void;deny:()=>void;recognize:(rows:ChatMessage[])=>void;updateArchive:(archived:boolean)=>void}){
  const text=copy[locale],{persona}=useAccountScope(),headers={"X-School-Persona":persona};
  const [rows,setRows]=useState<ChatMessage[]>(),[cursor,setCursor]=useState<string>();
  const [failure,setFailure]=useState(""),[initialAttempt,setInitialAttempt]=useState(0),[highlight,setHighlight]=useState<string>();
  const [paging,setPaging]=useState(false);
  const [optimistic,setOptimistic]=useState<Record<string,typeof reactionEmoji.options[number]|null>>({});
  const reactionBusy=useRef(new Set<string>());
  const press=useRef<{pointerId:number;x:number;y:number;timer:number}|null>(null);
  const [clipboardNotice,setClipboardNotice]=useState<{id:string;ok:boolean}>();
  function cancelPress(){
    if(press.current){window.clearTimeout(press.current.timer);press.current=null;}
  }
  useEffect(()=>()=>cancelPress(),[]);
  function beginPress(event:PointerEvent<HTMLParagraphElement>){
    if(!event.isPrimary||event.button!==0||(event.pointerType!=="touch"&&event.pointerType!=="pen"))return;
    cancelPress();
    const actions=event.currentTarget.closest(".comms-message")?.querySelector<HTMLDetailsElement>(".comms-message-actions");
    if(!actions)return;
    const timer=window.setTimeout(()=>{if(actions.isConnected)actions.open=true;},500);
    press.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,timer};
  }
  function movePress(event:PointerEvent<HTMLParagraphElement>){
    const active=press.current;
    if(active&&active.pointerId===event.pointerId&&Math.hypot(event.clientX-active.x,event.clientY-active.y)>10)cancelPress();
  }
  async function copyBody(message:ChatMessage){
    if(!message.body)return;
    try{
      await navigator.clipboard.writeText(message.body);
      setClipboardNotice({id:message.id,ok:true});
    }catch{setClipboardNotice({id:message.id,ok:false});}
  }
  const expanded=useRef(false),acknowledged=useRef(thread.readThroughSeq),jumpPending=useRef<string|undefined>(undefined);
  const liveActions=useRef({deny,recognize,updateArchive});liveActions.current={deny,recognize,updateArchive};
  const highest=useRef<string|undefined>(undefined);
  const path=`/threads/${thread.id}/messages?limit=30${term?`&q=${encodeURIComponent(term)}`:""}` as const;

  useEffect(()=>{
    if(ack&&!term)setRows((old)=>merge(old??[],[ack]));
  },[ack,term]);
  useEffect(()=>{
    const abort=new AbortController();
    let working=false,failures=0,nextPoll=0;
    async function poll(){
      if(working||abort.signal.aborted||document.hidden||!navigator.onLine)return;
      working=true;
      try{
        const result=await requestApi(path,messageList,{signal:abort.signal,headers:{"X-School-Persona":persona}});
        if(abort.signal.aborted)return;
        const visible=result.data[0]?.sequence;
        const oldest=result.data.at(-1)?.sequence;
        if(!term&&highest.current&&oldest&&BigInt(oldest)>BigInt(highest.current)+1n){
          let after=highest.current;
          while(visible&&newer(visible,after)){
            const gap=await requestApi(`/threads/${thread.id}/messages?limit=100&after=${after}`,messageList,{
              signal:abort.signal,headers:{"X-School-Persona":persona},
            });
            const last=gap.data.at(-1)?.sequence;
            if(abort.signal.aborted||!last||!newer(last,after))break;
            setRows((old)=>merge(old??[],gap.data));
            liveActions.current.recognize(gap.data);
            after=last;
          }
        }
        if(visible&&(!highest.current||newer(visible,highest.current)))highest.current=visible;
        setRows((old)=>merge(old??[],result.data));
        liveActions.current.recognize(result.data);
        if(!expanded.current)setCursor(result.meta?.nextCursor);
        failures=0;nextPoll=0;setFailure("");
        if(!term&&visible&&newer(visible,acknowledged.current)){
          const saved=await requestApi(`/threads/${thread.id}/state`,threadReaderState,{
            method:"PATCH",headers:webHeaders(persona),signal:abort.signal,body:JSON.stringify({readThroughSeq:visible}),
          });
          acknowledged.current=saved.data.readThroughSeq;
          window.dispatchEvent(new Event("madrasty-notices-changed"));
          liveActions.current.updateArchive(saved.data.archived);
        }
      }catch(problem){
        if(!abort.signal.aborted){
          if(unavailable(problem)){setRows(undefined);liveActions.current.deny();}
          else {failures++;nextPoll=Date.now()+Math.min(60000,5000*2**Math.min(failures,4));setFailure(timetableError(locale,problem));}
        }
      }finally{working=false;}
    }
    const timer=window.setInterval(()=>{if(Date.now()>=nextPoll)void poll();},5000);
    window.addEventListener("online",poll);
    window.addEventListener("focus",poll);
    document.addEventListener("visibilitychange",poll);
    void poll();
    return ()=>{
      abort.abort();window.clearInterval(timer);window.removeEventListener("online",poll);
      window.removeEventListener("focus",poll);document.removeEventListener("visibilitychange",poll);
    };
  },[path,locale,persona,thread.id,term,initialAttempt]);

  async function older(){
    if(paging||!cursor)return;
    setPaging(true);
    try{
      const page=await requestApi(`${path}&before=${cursor}`,messageList,{headers});
      expanded.current=true;
      setRows((old)=>merge(old??[],page.data));setCursor(page.meta?.nextCursor);setFailure("");
    }catch(problem){if(unavailable(problem))deny();else setFailure(timetableError(locale,problem));}
    finally{setPaging(false);}
  }
  async function jump(quote:NonNullable<ChatMessage["reply"]>){
    if(!rows?.some((row)=>row.id===quote.id)){
      try{
        const before=String(BigInt(quote.sequence)+1n);
        const result=await requestApi(`/threads/${thread.id}/messages?limit=20&before=${before}`,messageList,{headers});
        setRows((old)=>merge(old??[],result.data));
      }catch(problem){if(unavailable(problem))deny();else setFailure(timetableError(locale,problem));return;}
    }
    jumpPending.current=quote.id;
    setHighlight(quote.id);
    focusMessage(quote.id);
  }
  function focusMessage(id:string){
    const item=document.getElementById(`message-${id}`);
    if(!item)return;
    jumpPending.current=undefined;
    item.focus();
    item.scrollIntoView({block:"center"});
  }
  useEffect(()=>{
    if(jumpPending.current)focusMessage(jumpPending.current);
  },[rows]);
  async function react(message:ChatMessage,emoji:typeof reactionEmoji.options[number]){
    if(reactionBusy.current.has(message.id))return;
    const mine=message.reactions.some((value)=>value.emoji===emoji&&value.mine);
    const choice=mine?null:emoji;
    reactionBusy.current.add(message.id);
    setOptimistic(old=>({...old,[message.id]:choice}));
    try{
      const result=await requestApi(`/threads/${thread.id}/messages/${message.id}/reaction`,reactions,{
        method:"PUT",headers:webHeaders(persona),body:JSON.stringify({emoji:choice}),
      });
      setRows((old)=>old?.map((item)=>item.id===message.id?{...item,reactions:result.data}:item));
    }catch(problem){if(unavailable(problem))deny();else setFailure(timetableError(locale,problem));}
    finally{
      reactionBusy.current.delete(message.id);
      setOptimistic(old=>{const next={...old};delete next[message.id];return next;});
    }
  }

  if(!rows)return <AsyncSurface locale={locale} state={failure?{kind:"error",message:failure,retry:()=>setInitialAttempt((n)=>n+1)}:{kind:"initialLoading"}}/>;
  return <>
    {cursor&&<button type="button" className="plain-button" onClick={()=>void older()} disabled={paging}>{text.older}</button>}
    {failure&&<p role="alert">{failure}</p>}
    {!rows.length&&<AsyncSurface locale={locale} state={{kind:"empty"}}/>}
    <ol className="comms-timeline">{rows.map((original)=>{const pending=Object.prototype.hasOwnProperty.call(optimistic,original.id);const message=pending?{...original,reactions:projectReaction(original.reactions,optimistic[original.id]??null)}:original;return <li key={message.id} id={`message-${message.id}`} tabIndex={-1} data-own={message.own} data-highlight={highlight===message.id} className="comms-message">
      {!message.own&&<strong className="comms-message-author"><bdi>{message.authorName??text.school}</bdi></strong>}
      {message.reply&&<button type="button" className="plain-button" aria-label={text.target} onClick={()=>{
        if(message.reply)void jump(message.reply);
      }}><bdi>{message.reply.authorName??text.school}</bdi>{message.reply.preview&&<> · <bdi>{message.reply.preview}</bdi></>}</button>}
      {message.body&&<p dir="auto" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}
        onPointerDown={beginPress} onPointerMove={movePress} onPointerUp={cancelPress} onPointerCancel={cancelPress} onPointerLeave={cancelPress}
        onContextMenu={(event)=>{if(press.current)event.preventDefault();}}>{message.body}</p>}
      {message.attachments.map((file)=><PrivateChatMedia key={file.id} locale={locale} kind={file.kind}
        path={`/api/v1/threads/${thread.id}/media/${file.id}`}/>)}
      {message.source==="human"&&!message.body&&!message.attachments.length&&<p>{reportCopy[locale].removed}</p>}
      <small className="comms-message-time"><bdi>{new Date(message.createdAt).toLocaleTimeString(locale==="ar"?"ar":"de-DE",{hour:"2-digit",minute:"2-digit"})}</bdi>{message.own&&<> · {message.counterpartRead?text.seen:text.sent}</>}</small>
      {message.reactions.length>0&&<div className="comms-reaction-strip" role="group" aria-label={text.reactions}>
        {message.reactions.map((entry)=><button type="button" className="comms-reaction-chip" key={entry.emoji} aria-pressed={entry.mine} disabled={pending}
          onClick={()=>void react(message,entry.emoji)}>{entry.emoji} {entry.count}</button>)}
      </div>}
      <details className="comms-message-actions"><summary aria-label={locale==="ar"?"إجراءات الرسالة":"Nachrichtenoptionen"}>⋯</summary>
      <div className="header-actions">
        {thread.canReply&&message.replyable&&<button type="button" className="plain-button" onClick={()=>reply(message)}>{text.reply}</button>}
        {message.body&&<button type="button" className="plain-button" onClick={()=>void copyBody(message)}>{locale==="ar"?"نسخ النص":"Text kopieren"}</button>}
        {clipboardNotice?.id===message.id&&<small role="status">{clipboardNotice.ok?(locale==="ar"?"تم النسخ":"Kopiert"):(locale==="ar"?"تعذّر نسخ النص":"Text konnte nicht kopiert werden")}</small>}
        {(message.body||message.attachments.length>0)&&<ReportMessage locale={locale} thread={thread.id} message={message.id}/>}
      </div>
      {(message.source==="system"||message.body||message.attachments.length>0)&&<details>
        <summary>{text.reactions}</summary>
        <div className="header-actions">{reactionEmoji.options.map((emoji)=><button type="button" className="plain-button" key={emoji}
          disabled={pending} aria-label={`${text.reactions} ${emoji}`} aria-pressed={message.reactions.some((entry)=>entry.emoji===emoji&&entry.mine)}
          onClick={()=>void react(message,emoji)}>{emoji}</button>)}</div>
      </details>}
      </details>
    </li>})}</ol>
  </>;
}
