"use client";

import { useEffect,useState } from "react";
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
