"use client";

import { useEffect,useState,type ReactNode } from "react";
import type { z } from "zod";
import type { CurriculumOffering,Locale } from "@madrasty/contracts";
import { ApiResponseError,requestApi,requestInitialRead } from "@/api/client";
import { timetableError } from "@/features/school/timetable/shared";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";

const denied=(error:unknown)=>error instanceof ApiResponseError&&[401,403,404].includes(error.status);

export function useAcademicPage<T>(path:`/${string}`|null,schema:z.ZodType<T[]>,refresh:number,retainOnRefreshError=false){
  const {accountId,sessionId,persona}=useAccountScope();
  const scope=JSON.stringify([accountId,sessionId,persona,path]);
  const [read,setRead]=useState<{scope:string;refresh:number;items?:T[];cursor?:string;error?:unknown}>();
  const [retry,setRetry]=useState(0);
  const [busy,setBusy]=useState<string>();
  const [notice,setNotice]=useState<{scope:string;error:unknown}>();
  const visible=read?.scope===scope?read:undefined;
  useEffect(()=>{
    if(!path)return;
    const abort=new AbortController();
    const read=refresh===0&&retry===0
      ? requestInitialRead(scope,path,schema,persona,abort.signal)
      : requestApi(path,schema,{signal:abort.signal,headers:{"X-School-Persona":persona}});
    read.then(
      ({data,meta})=>{if(!abort.signal.aborted){setRead({scope,refresh,items:data,cursor:meta?.nextCursor});if(retainOnRefreshError)setNotice(undefined);}},
      (error)=>{if(!abort.signal.aborted){if(retainOnRefreshError&&!denied(error)){setRead(old=>old?.scope===scope&&old.items?old:{scope,refresh,error});setNotice({scope,error});}else setRead({scope,refresh,error});}},
    );
    return ()=>abort.abort();
  },[path,persona,refresh,retry,schema,scope,retainOnRefreshError]);
  async function more(){
    if(!path||!visible?.cursor||busy===scope)return;
    setBusy(scope);setNotice(undefined);
    try{
      const {data,meta}=await requestApi(`${path}&cursor=${encodeURIComponent(visible.cursor)}`,schema,{headers:{"X-School-Persona":persona}});
      setRead((old)=>old===visible?{scope,refresh,items:[...(visible.items??[]),...data],cursor:meta?.nextCursor}:old);
    }catch(error){
      if(denied(error))setRead((old)=>old===visible?{scope,refresh,error}:old);
      else setNotice({scope,error});
    }finally{setBusy(current=>current===scope?undefined:current);}
  }
  return {visible,retry:()=>setRetry((count)=>count+1),more,busy:busy===scope,notice:notice?.scope===scope?notice.error:undefined};
}

export function offeringText(value:CurriculumOffering,locale:Locale){
  return `${value.classCode} · ${locale==="ar"?value.classNameAr:value.classNameDe} · ${value.yearStart} – ${value.yearEnd}`;
}

export function AcademicReadError({locale,error,retry}:{locale:Locale;error:unknown;retry:()=>void}){
  return <AsyncSurface locale={locale} state={denied(error)?{kind:"forbidden"}:{kind:"error",message:timetableError(locale,error),retry}}/>;
}

export function AcademicPageItems<T>({locale,page,children,emptyMessage}:{locale:Locale;emptyMessage?:string;page:ReturnType<typeof useAcademicPage<T>>;children:(items:T[])=>ReactNode}){
  const read=page.visible;
  if(read?.error)return <AcademicReadError locale={locale} error={read.error} retry={page.retry}/>;
  if(!read?.items)return <AsyncSurface locale={locale} state={{kind:"initialLoading"}}/>;
  return <>
    {read.items.length?children(read.items):<AsyncSurface locale={locale} state={{kind:"empty",message:emptyMessage}}/>}
    {read.cursor&&<button className="plain-button" disabled={page.busy} onClick={()=>void page.more()}>{locale==="ar"?"عرض المزيد":"Weitere anzeigen"}</button>}
    {page.notice!==undefined&&<p role="alert">{timetableError(locale,page.notice)}</p>}
  </>;
}

export function scoreInput(raw:string){
  const normalized=raw.trim().replace(/[٠-٩]/g,(digit)=>String(digit.charCodeAt(0)-0x660))
    .replace(/[۰-۹]/g,(digit)=>String(digit.charCodeAt(0)-0x6f0)).replace(/[٬]/g,"").replace(/[,٫]/g,".");
  if(!normalized)return null;
  return /^\d+(?:\.\d{1,4})?$/.test(normalized)?Number(normalized):Number.NaN;
}
