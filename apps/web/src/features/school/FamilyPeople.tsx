"use client";
import {useEffect,useRef,useState} from "react";
import {z} from "zod";
import {guardianSchema,studentSchema,type Guardian,type Student,type Locale} from "@madrasty/contracts";
import {requestApi} from "@/api/client";
import {dictionary} from "@/i18n";
import {Icon} from "@/ui/Icon";
const schema=z.union([studentSchema.array(),guardianSchema.array()]);
export function ExistingPersonPicker({locale,kind,exclude=[],select}:{locale:Locale;kind:"guardian"|"student";exclude?:string[];select:(person:Guardian|Student)=>void}){
 const ar=locale==="ar";const [query,setQuery]=useState(""),[rows,setRows]=useState<(Guardian|Student)[]>([]),[cursor,setCursor]=useState<string>(),[busy,setBusy]=useState(false),[searched,setSearched]=useState(false),[error,setError]=useState(false);
 const pending=useRef<AbortController|null>(null),last=useRef("");
 useEffect(()=>()=>pending.current?.abort(),[]);
 const load=async(next=false)=>{if(next&&!cursor)return;pending.current?.abort();const ctrl=new AbortController();pending.current=ctrl;const q=next?last.current:query.trim();last.current=q;setBusy(true);setError(false);if(!next){setRows([]);setCursor(undefined);}
 try{const result=await requestApi(`/school/${kind==="guardian"?"guardians":"students"}?sort=name&query=${encodeURIComponent(q)}${next?"&cursor="+encodeURIComponent(cursor!):""}`,schema,{signal:ctrl.signal});if(ctrl.signal.aborted)return;setRows(old=>next?[...old,...result.data]:result.data);setCursor(result.meta?.nextCursor);setSearched(true);}
 catch{if(!ctrl.signal.aborted)setError(true);}finally{if(!ctrl.signal.aborted)setBusy(false);}};
 return <div className="family-person-picker">
  <div className="family-search"><input type="search" aria-label={ar?"بحث عن شخص موجود":"Vorhandene Person suchen"} value={query} maxLength={120} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void load();}}}/><button type="button" className="plain-button" disabled={busy} onClick={()=>void load()}>{ar?"بحث":"Suchen"}</button></div>
  {busy&&<p role="status">{dictionary(locale).pending}</p>}{error&&<p role="alert">{dictionary(locale)["error.unavailable"]}</p>}
  <ul className="group-list">{rows.filter(r=>!exclude.includes(r.id)).map(r=><li key={r.id}><button type="button" className="family-list-row" onClick={()=>select(r)}><span><bdi>{r.displayName}</bdi>{"studentNumber" in r&&<small><bdi>{r.studentNumber}</bdi></small>}</span><Icon name="chevron"/></button></li>)}</ul>
  {searched&&!busy&&!rows.some(r=>!exclude.includes(r.id))&&<p>{dictionary(locale).empty}</p>}
  {cursor&&<button type="button" className="plain-button" disabled={busy} onClick={()=>void load(true)}>{ar?"نتائج إضافية":"Weitere Ergebnisse"}</button>}
 </div>;
}
