"use client";

import { useEffect,useState,type ReactNode } from "react";
import type { z } from "zod";
import type { CurriculumOffering,Locale } from "@madrasty/contracts";
import { ApiResponseError,requestApi } from "@/api/client";
import { timetableError } from "@/features/school/timetable/shared";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";

const denied=(error:unknown)=>error instanceof ApiResponseError&&[401,403,404].includes(error.status);

export function useAcademicPage<T>(path:`/${string}`|null,schema:z.ZodType<T[]>,refresh:number){
  const {persona}=useAccountScope();
  const [read,setRead]=useState<{path:string;refresh:number;items?:T[];cursor?:string;error?:unknown}>();
  const [retry,setRetry]=useState(0);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState<unknown>();
  const visible=read?.path===path?read:undefined;
  useEffect(()=>{
    if(!path)return;
    const abort=new AbortController();
    requestApi(path,schema,{signal:abort.signal,headers:{"X-School-Persona":persona}}).then(
      ({data,meta})=>{if(!abort.signal.aborted)setRead({path,refresh,items:data,cursor:meta?.nextCursor});},
      (error)=>{if(!abort.signal.aborted)setRead({path,refresh,error});},
    );
    return ()=>abort.abort();
  },[path,persona,refresh,retry,schema]);
  async function more(){
    if(!path||!visible?.cursor||busy)return;
    setBusy(true);setNotice(undefined);
    try{
      const {data,meta}=await requestApi(`${path}&cursor=${encodeURIComponent(visible.cursor)}`,schema,{headers:{"X-School-Persona":persona}});
      setRead((old)=>old===visible?{path,refresh,items:[...(visible.items??[]),...data],cursor:meta?.nextCursor}:old);
    }catch(error){
      if(denied(error))setRead((old)=>old===visible?{path,refresh,error}:old);
      else setNotice(error);
    }finally{setBusy(false);}
  }
  return {visible,retry:()=>setRetry((count)=>count+1),more,busy,notice};
}

export function offeringText(value:CurriculumOffering,locale:Locale){
  return `${value.classCode} · ${locale==="ar"?value.classNameAr:value.classNameDe} · ${value.yearStart} – ${value.yearEnd}`;
}

export function AcademicReadError({locale,error,retry}:{locale:Locale;error:unknown;retry:()=>void}){
  return <AsyncSurface locale={locale} state={denied(error)?{kind:"forbidden"}:{kind:"error",message:timetableError(locale,error),retry}}/>;
}

export function AcademicPageItems<T>({locale,page,children}:{locale:Locale;page:ReturnType<typeof useAcademicPage<T>>;children:(items:T[])=>ReactNode}){
  const read=page.visible;
  if(read?.error)return <AcademicReadError locale={locale} error={read.error} retry={page.retry}/>;
  if(!read?.items)return <AsyncSurface locale={locale} state={{kind:"initialLoading"}}/>;
  return <>
    {read.items.length?children(read.items):<AsyncSurface locale={locale} state={{kind:"empty"}}/>}
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
