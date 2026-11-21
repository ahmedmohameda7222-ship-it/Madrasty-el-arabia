"use client";

import {useEffect,useRef,useState} from "react";
import {
  mediaUploadGrant,mediaUploadState,voiceMaxMilliseconds,type Locale,type Persona,
} from "@madrasty/contracts";
import {ApiResponseError,requestApi} from "@/api/client";
import {webHeaders} from "@/features/identity/SessionControls";
import {convertPhoto,voiceCapture} from "./capture";

const copy={
  ar:{gallery:"اختيار صورة",camera:"تصوير",record:"سجّل صوت",stop:"إنهاء التسجيل",cancel:"إلغاء التسجيل",audio:"معاينة التسجيل",
    photo:"معاينة الصورة",upload:"تجهيز المرفق",retry:"أعد رفع المرفق",discard:"حذف المرفق من المسودة",ready:"المرفق جاهز للإرسال",
    working:"جارٍ تجهيز المرفق",unsupported:"تعذّر تجهيز الملف بهذا الحجم أو التنسيق.",permission:"اسمح بالميكروفون في إعدادات جهازك أو المتصفح.",
    failed:"تعذّر رفع المرفق. تقدر تعيد المحاولة.",expired:"الجلسة انتهت أو صلاحية المحادثة اتغيّرت.",recording:"جارٍ التسجيل"},
  de:{gallery:"Foto auswählen",camera:"Foto aufnehmen",record:"Audio aufnehmen",stop:"Aufnahme beenden",cancel:"Aufnahme verwerfen",audio:"Aufnahme anhören",
    photo:"Fotovorschau",upload:"Anhang vorbereiten",retry:"Anhang erneut hochladen",discard:"Anhang aus Entwurf entfernen",ready:"Anhang ist sendebereit",
    working:"Anhang wird vorbereitet",unsupported:"Die Dateigröße oder das Dateiformat wird nicht unterstützt.",permission:"Erlaube den Zugriff auf das Mikrofon in den Geräte- oder Browsereinstellungen.",
    failed:"Der Anhang konnte nicht hochgeladen werden. Du kannst es erneut versuchen.",expired:"Die Sitzung oder der Zugriff auf die Unterhaltung ist abgelaufen.",
    recording:"Aufnahme läuft"},
} as const;

type Draft={kind:"photo"|"voice";file:Blob;preview:string;key:string;uploadId?:string;readyId?:string;sentBytes:boolean};
type Token={uploadId:string;url:string;expiresAt:string};
type ErrorKey="unsupported"|"permission"|"failed"|"expired";
const wait=(signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason);return;}
  const stop=()=>{window.clearTimeout(timer);reject(signal.reason);};
  const timer=window.setTimeout(()=>{signal.removeEventListener("abort",stop);resolve();},850);
  signal.addEventListener("abort",stop,{once:true});
});
function uploadFile(url:string,file:Blob,signal:AbortSignal,progress:(percent:number)=>void){
  return new Promise<void>((resolve,reject)=>{
    if(signal.aborted){reject(signal.reason);return;}
    const request=new XMLHttpRequest();
    const abort=()=>request.abort();
    const finish=(error?:Error)=>{
      signal.removeEventListener("abort",abort);
      if(error)reject(error);else resolve();
    };
    request.open("PUT",url);
    request.timeout=90000;
    request.setRequestHeader("Content-Type",file.type);
    request.upload.onprogress=(event)=>{if(event.lengthComputable)progress(Math.round(100*event.loaded/event.total));};
    request.onload=()=>finish(request.status>=200&&request.status<300?undefined:new Error("upload rejected"));
    request.onerror=request.ontimeout=request.onabort=()=>finish(new Error("upload interrupted"));
    signal.addEventListener("abort",abort,{once:true});
    request.send(file);
  });
}

export function MediaComposer({locale,persona,thread,locked,consumed,onReady,onBusy}:{
  locale:Locale;persona:Persona;thread:string;locked:boolean;consumed:string|undefined;
  onReady:(id?:string)=>void;onBusy:(busy:boolean)=>void;
}){
  const labels=copy[locale],root=`/threads/${thread}/uploads` as const;
  const [draft,setDraft]=useState<Draft>(),[percent,setPercent]=useState(0),[working,setWorking]=useState(false);
  const [mic,setMic]=useState<"idle"|"starting"|"recording"|"finishing">("idle"),[elapsed,setElapsed]=useState(0);
  const [error,setError]=useState<ErrorKey>();
  const current=useRef<Draft>(undefined),capture=useRef<ReturnType<typeof voiceCapture>>(undefined);
  const token=useRef<Token>(undefined),upload=useRef<AbortController>(undefined),generation=useRef(0);
  const finishing=useRef(false),alive=useRef(false),captureStarts=useRef(0),photoInput=useRef<HTMLInputElement>(null),cameraInput=useRef<HTMLInputElement>(null);
  const headers=()=>webHeaders(persona);
  const updateDraft=(value?:Draft)=>{current.current=value;setDraft(value);};

  useEffect(()=>{
    alive.current=true;
    const release=()=>{
      generation.current++;
      upload.current?.abort();capture.current?.close();capture.current=undefined;finishing.current=false;
      if(current.current)URL.revokeObjectURL(current.current.preview);
      current.current=undefined;token.current=undefined;
    };
    function pageHidden(){release();setDraft(undefined);setWorking(false);setMic("idle");onBusy(false);onReady();}
    window.addEventListener("pagehide",pageHidden);
    return ()=>{alive.current=false;window.removeEventListener("pagehide",pageHidden);release();};
  },[onBusy,onReady]);

  useEffect(()=>{
    if(!consumed||current.current?.readyId!==consumed)return;
    URL.revokeObjectURL(current.current.preview);
    current.current=undefined;token.current=undefined;setDraft(undefined);setPercent(0);setError(undefined);
  },[consumed]);
  useEffect(()=>{
    if(mic!=="recording")return;
    const timer=window.setInterval(()=>setElapsed(Math.min(180,Math.floor((Date.now()-captureStarts.current)/1000))),250);
    return ()=>window.clearInterval(timer);
  },[mic]);
  useEffect(()=>onBusy(working||mic!=="idle"||!!draft&&!draft.readyId),[working,mic,draft,onBusy]);
  function preview(kind:Draft["kind"],file:Blob){
    token.current=undefined;
    updateDraft({kind,file,preview:URL.createObjectURL(file),key:crypto.randomUUID(),sentBytes:false});
    setPercent(0);
  }
  async function pick(file?:File){
    if(!file||working||current.current||capture.current)return;
    const version=++generation.current;
    onBusy(true);setWorking(true);setError(undefined);
    try{
      const converted=await convertPhoto(file);
      if(alive.current&&version===generation.current)preview("photo",converted);
    }catch{if(alive.current&&version===generation.current)setError("unsupported");}
    finally{if(alive.current&&version===generation.current){setWorking(false);onBusy(false);}}
  }
  async function stopRecording(recorder= capture.current){
    if(!recorder||capture.current!==recorder||finishing.current)return;
    finishing.current=true;
    setMic("finishing");
    const version=generation.current;
    try{
      const sound=await recorder.finish();
      if(alive.current&&version===generation.current)preview("voice",sound);
    }catch{if(alive.current&&version===generation.current)setError("unsupported");}
    finally{
      if(capture.current===recorder){capture.current=undefined;finishing.current=false;}
      if(alive.current&&version===generation.current){setMic("idle");onBusy(false);}
    }
  }
  async function record(){
    const version=++generation.current;
    setError(undefined);setElapsed(0);setMic("starting");onBusy(true);
    try{
      const recorder=voiceCapture(()=>{if(alive.current&&generation.current===version)void stopRecording(recorder);});
      capture.current=recorder;
      await recorder.start();
      if(alive.current&&version===generation.current){
        captureStarts.current=Date.now();setMic("recording");
      }
    }catch(problem){
      if(alive.current&&version===generation.current){
        capture.current=undefined;setMic("idle");onBusy(false);
        const denied=problem instanceof DOMException&&["NotAllowedError","SecurityError"].includes(problem.name);
        setError(denied?"permission":"unsupported");
      }
    }
  }
  function cancelRecording(){
    generation.current++;capture.current?.close();capture.current=undefined;finishing.current=false;setMic("idle");onBusy(false);
  }
  function discard(){
    generation.current++;upload.current?.abort();upload.current=undefined;
    const entry=current.current;
    if(entry){
      URL.revokeObjectURL(entry.preview);
      if(entry.uploadId)void requestApi(`${root}/${entry.uploadId}`,mediaUploadState,{
        method:"POST",headers:headers(),body:JSON.stringify({action:"cancel"}),
      }).catch(()=>undefined);
    }
    token.current=undefined;updateDraft(undefined);setWorking(false);setError(undefined);onReady();onBusy(false);
  }
  async function submit(){
    const entry=current.current;
    if(!entry||working||entry.readyId)return;
    const version=++generation.current,abort=new AbortController();
    upload.current=abort;setWorking(true);onBusy(true);setError(undefined);
    const finalize=(id:string)=>requestApi(`${root}/${id}`,mediaUploadState,{
      method:"POST",signal:abort.signal,headers:{...headers(),"Idempotency-Key":id},body:JSON.stringify({action:"finalize"}),
    });
    try{
      const stillCurrent=()=>alive.current&&generation.current===version;
      if(entry.uploadId&&entry.sentBytes){
        const prior=await finalize(entry.uploadId);
        if(!stillCurrent())return;
        if(prior.data.state==="ready"){
          updateDraft({...entry,readyId:prior.data.mediaId});onReady(prior.data.mediaId);return;
        }
        if(prior.data.state==="failed"){setError("unsupported");return;}
        if(prior.data.state==="staged")entry.sentBytes=false;
        if(prior.data.state==="cancelled"){
          entry.key=crypto.randomUUID();entry.uploadId=undefined;entry.sentBytes=false;token.current=undefined;
        }
      }
      if(!entry.sentBytes||!token.current){
        const result=await requestApi(root,mediaUploadGrant,{
          method:"POST",signal:abort.signal,headers:{...headers(),"Idempotency-Key":entry.key},
          body:JSON.stringify({mediaKind:entry.kind,mime:entry.file.type,bytes:entry.file.size}),
        });
        if(!stillCurrent())return;
        if(entry.file.size>result.data.maxBytes||(entry.kind==="voice"&&result.data.maxDurationMs!==voiceMaxMilliseconds)){
          setError("unsupported");return;
        }
        token.current=result.data;entry.uploadId=result.data.uploadId;
      }
      const authority=token.current;
      if(!authority||!entry.uploadId)throw new Error("upload authority");
      if(Date.parse(authority.expiresAt)<=Date.now()){
        token.current=undefined;entry.key=crypto.randomUUID();entry.uploadId=undefined;entry.sentBytes=false;
        setError("failed");return;
      }
      if(!entry.sentBytes){
        let delivered=false;
        try{await uploadFile(authority.url,entry.file,abort.signal,setPercent);delivered=true;}
        catch{if(abort.signal.aborted)return;}
        // A lost Storage response can still mean the immutable object arrived.
        entry.sentBytes=true;
        const result=await finalize(entry.uploadId);
        if(!stillCurrent())return;
        if(result.data.state==="ready"){
          entry.sentBytes=true;updateDraft({...entry,readyId:result.data.mediaId});onReady(result.data.mediaId);return;
        }
        if(result.data.state==="failed"){setError("unsupported");return;}
        entry.sentBytes=delivered||result.data.state==="processing";
        if(!entry.sentBytes){setError("failed");return;}
      }
      for(let retry=0;retry<5;retry++){
        await wait(abort.signal);
        const result=await finalize(entry.uploadId);
        if(!stillCurrent())return;
        if(result.data.state==="ready"){
          updateDraft({...entry,readyId:result.data.mediaId});onReady(result.data.mediaId);return;
        }
        if(result.data.state==="failed"){setError("unsupported");return;}
        if(result.data.state==="cancelled")break;
      }
      entry.sentBytes=false;
      setError("failed");
    }catch(problem){
      if(alive.current&&version===generation.current){
        setError(problem instanceof ApiResponseError&&[401,403,404].includes(problem.status)?"expired":"failed");
      }
    }finally{
      if(alive.current&&version===generation.current){setWorking(false);onBusy(false);}
      if(upload.current===abort)upload.current=undefined;
    }
  }

  return <div className="auth-form">
    {!draft&&mic==="idle"&&<div className="header-actions">
      <input ref={photoInput} type="file" hidden accept="image/*" onChange={(event)=>{void pick(event.currentTarget.files?.[0]);event.currentTarget.value="";}}/>
      <input ref={cameraInput} type="file" hidden accept="image/*" capture="environment" onChange={(event)=>{void pick(event.currentTarget.files?.[0]);event.currentTarget.value="";}}/>
      <button type="button" className="plain-button" disabled={locked||working} onClick={()=>photoInput.current?.click()}>{labels.gallery}</button>
      <button type="button" className="plain-button" disabled={locked||working} onClick={()=>cameraInput.current?.click()}>{labels.camera}</button>
      <button type="button" className="plain-button" disabled={locked||working} onClick={()=>void record()}>{labels.record}</button>
    </div>}
    {mic!=="idle"&&<div className="header-actions" role="group">
      <span dir="ltr" aria-label={labels.recording}>{Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,"0")}</span>
      <button className="plain-button" type="button" disabled={mic!=="recording"} onClick={()=>void stopRecording()}>{labels.stop}</button>
      <button className="plain-button" type="button" onClick={cancelRecording}>{labels.cancel}</button>
    </div>}
    {draft&&<div className="auth-form">
      {draft.kind==="photo"?<img src={draft.preview} alt={labels.photo} width={240} style={{maxWidth:"100%",objectFit:"contain"}}/>:
        <audio controls aria-label={labels.audio} src={draft.preview} style={{maxWidth:"100%"}}/>}
      <div className="header-actions">
        {!draft.readyId&&<button className="plain-button" type="button" disabled={working||locked} onClick={()=>void submit()}>
          {error==="failed"?labels.retry:labels.upload}
        </button>}
        <button className="plain-button" type="button" disabled={locked} onClick={discard}>{labels.discard}</button>
      </div>
    </div>}
    {working&&<div role="status">{labels.working}{draft&&<progress aria-label={labels.working} value={percent} max={100}/>}</div>}
    {draft?.readyId&&<p role="status">{labels.ready}</p>}
    {error&&<p role="alert">{labels[error]}</p>}
  </div>;
}
