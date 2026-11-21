"use client";

import { useEffect,useState,type ReactNode } from "react";
import { childSummarySchema,curriculumOffering,curriculumSubject,type CurriculumOffering,type Locale } from "@madrasty/contracts";
import { dictionary } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { TimetableRead,useTimetableRead } from "@/features/school/timetable/shared";
import { offeringText } from "./shared";

const children=childSummarySchema.array(),offerings=curriculumOffering.array(),subjects=curriculumSubject.array();
export type AssessmentContext={child?:string;offering?:CurriculumOffering;version:number;initial?:string};
export function AssessmentScope({locale,initialChild,initial,allow,children:render}:{
  locale:Locale;initialChild?:string;initial?:string;allow:(offering:CurriculumOffering)=>boolean;
  children:(scope:AssessmentContext)=>ReactNode;
}){
  const guardian=useAccountScope().persona==="guardian";
  const [selected,setSelected]=useState(guardian?initialChild??"":"");
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    const reload=()=>setVersion((n)=>n+1);
    window.addEventListener("focus",reload);
    return ()=>window.removeEventListener("focus",reload);
  },[]);
  const pupils=useTimetableRead(guardian?"/me/children?limit=100":null,children,version);
  const courses=useTimetableRead(guardian?null:"/academics/offerings",offerings,version);
  const catalog=useTimetableRead(guardian?null:"/academics/subjects?limit=100",subjects,version);
  if(guardian){
    const options=pupils.value?.data;
    const linked=options?.find((item)=>item.id===selected)??(!selected?options?.[0]:undefined);
    return <>
      <TimetableRead locale={locale} result={pupils}>{(items)=>items.length?<label className="auth-card">
        {locale==="ar"?"الطفل":"Kind"}
        <select value={linked?.id??""} onChange={(event)=>setSelected(event.target.value)}>
          {!linked&&<option value="">{dictionary(locale).choose}</option>}
          {items.map((item)=><option value={item.id} key={item.id}>{item.displayName}</option>)}
        </select>
      </label>:<AsyncSurface locale={locale} state={{kind:"empty"}}/>}</TimetableRead>
      {linked?render({child:linked.id,version,initial:selected===(initialChild??"")?initial:undefined})
        :selected&&options&&<AsyncSurface locale={locale} state={{kind:"forbidden"}}/>}
    </>;
  }
  const options=courses.value?.data?.filter(allow)??[];
  const picked=options.find((item)=>item.id===selected)??options[0];
  return <>
    <TimetableRead locale={locale} result={courses}>{()=>options.length?<label className="auth-card">
      {locale==="ar"?"المادة والفصل والسنة":"Fach, Klasse und Schuljahr"}
      <select value={picked?.id??""} onChange={(event)=>setSelected(event.target.value)}>
        {options.map((item)=>{
          const subject=catalog.value?.data?.find((entry)=>entry.id===item.subjectId);
          const name=subject?(locale==="ar"?subject.nameAr:subject.nameDe):"";
          return <option value={item.id} key={item.id}>{[name,offeringText(item,locale)].filter(Boolean).join(" · ")}</option>;
        })}
      </select>
    </label>:!initial&&<AsyncSurface locale={locale} state={{kind:"empty"}}/>}</TimetableRead>
    {(picked||initial)&&render({offering:picked,version,initial:selected?undefined:initial})}
  </>;
}
