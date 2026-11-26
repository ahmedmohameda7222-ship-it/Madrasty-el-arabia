"use client";
import {useEffect,useRef,useState} from "react";
import {chatMessage,type ChatMessage,type Locale} from "@madrasty/contracts";
import {ApiResponseError,requestApi} from "@/api/client";
import {useAccountScope} from "@/ui/AccountScope";
import {AsyncSurface} from "@/ui/AsyncSurface";
import {Icon} from "@/ui/Icon";
import {timetableError} from "@/features/school/timetable/shared";
import {PrivateChatMedia} from "./ReportQueue";

const schema=chatMessage.array();
export function SharedChatMedia({locale,thread,denied}:{locale:Locale;thread:string;denied:()=>void}){
  const actor=useAccountScope(),ar=locale==="ar";
  const label=ar?"الصور والرسائل الصوتية":"Geteilte Medien";
  const modal=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false),[revision,setRevision]=useState(0);
  const [rows,setRows]=useState<ChatMessage[]>(),[cursor,setCursor]=useState<string>(),[error,setError]=useState<unknown>(),[busy,setBusy]=useState(false);
  const active=useRef<AbortController|null>(null),deny=useRef(denied);deny.current=denied;
  const root=`/threads/${thread}/messages?mediaOnly=true&limit=20` as const;
  const forbidden=(reason:unknown)=>reason instanceof ApiResponseError&&[401,403,404].includes(reason.status);
  useEffect(()=>{
    if(!open)return;
    const abort=new AbortController();active.current=abort;
    setRows(undefined);setCursor(undefined);setError(undefined);setBusy(false);
    requestApi(root,schema,{headers:{"X-School-Persona":actor.persona},signal:abort.signal}).then(page=>{
      if(!abort.signal.aborted){setRows(page.data);setCursor(page.meta?.nextCursor);}
    },reason=>{
      if(abort.signal.aborted)return;
      if(forbidden(reason)){modal.current?.close();deny.current();}else setError(reason);
    });
    return ()=>{abort.abort();if(active.current===abort)active.current=null;};
  },[open,revision,root,actor.accountId,actor.sessionId,actor.persona]);
  async function older(){
    const abort=active.current;
    if(!cursor||busy||!abort||abort.signal.aborted)return;
    setBusy(true);setError(undefined);
    try{
      const page=await requestApi(`${root}&before=${encodeURIComponent(cursor)}`,schema,{headers:{"X-School-Persona":actor.persona},signal:abort.signal});
      if(!abort.signal.aborted){setRows(current=>[...new Map([...(current??[]),...page.data].map(item=>[item.id,item])).values()]);setCursor(page.meta?.nextCursor);}
    }catch(reason){if(!abort.signal.aborted){if(forbidden(reason)){modal.current?.close();deny.current();}else setError(reason);}}
    finally{if(!abort.signal.aborted)setBusy(false);}
  }
  return <>
    <button ref={trigger} className="plain-button" type="button" aria-haspopup="dialog" onClick={()=>{setOpen(true);modal.current?.showModal();}}><Icon name="photo"/>{label}</button>
    <dialog ref={modal} aria-label={label} className="scope-sheet comms-gallery-sheet" onClose={()=>{active.current?.abort();setOpen(false);setRows(undefined);setCursor(undefined);setError(undefined);trigger.current?.focus({preventScroll:true});}}>
      <div className="sheet-header"><h2>{label}</h2><button className="plain-button" type="button" onClick={()=>modal.current?.close()}>{ar?"إغلاق":"Schließen"}</button></div>
      {open&&<>
        {error!==undefined&&<AsyncSurface locale={locale} state={{kind:"error",message:timetableError(locale,error),retry:()=>setRevision(n=>n+1)}}/>}
        {!rows&&error===undefined&&<AsyncSurface locale={locale} state={{kind:"initialLoading"}}/>}
        {rows?.length===0&&<AsyncSurface locale={locale} state={{kind:"empty",message:ar?"مفيش مرفقات في المحادثة دي.":"Keine geteilten Medien in dieser Unterhaltung."}}/>}
        {!!rows?.length&&<ul className="comms-gallery-grid">{rows.flatMap(message=>message.attachments.map(item=><li className="comms-gallery-item" key={item.id}>
          <small><bdi>{message.authorName??(ar?"المدرسة":"Schule")}</bdi> · {new Date(message.createdAt).toLocaleDateString(ar?"ar":"de-DE")}</small>
          <PrivateChatMedia locale={locale} kind={item.kind} path={`/api/v1/threads/${thread}/media/${item.id}`}/>
        </li>))}</ul>}
        {cursor&&<button className="plain-button" type="button" disabled={busy} onClick={()=>void older()}>{ar?"عرض المزيد":"Weitere anzeigen"}</button>}
      </>}
    </dialog>
  </>;
}
