"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { homeworkContact,threadReceipt,type DirectoryTarget,type Locale,type ThreadReference } from "@madrasty/contracts";
import { useSchoolCommand } from "@/api/commands";
import { TimetableRead,timetableError,useTimetableRead } from "@/features/school/timetable/shared";
import { useAccountScope } from "@/ui/AccountScope";

const options=homeworkContact.array();
const copy={
  ar:{start:"افتح محادثة",homework:"اسأل عن الواجب",attendance:"راسل شؤون الطلبة",empty:"مدرس المادة غير متاح للمراسلة دلوقتي."},
  de:{start:"Unterhaltung öffnen",homework:"Zur Hausaufgabe nachfragen",attendance:"Schulbüro kontaktieren",empty:"Die Lehrkraft ist derzeit für Nachrichten nicht verfügbar."},
} as const;

export function StartConversation({locale,target,context,label}:{
  locale:Locale;target:DirectoryTarget;context?:ThreadReference;label?:string;
}){
  const router=useRouter(),{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [pending,setPending]=useState(false),[error,setError]=useState("");
  async function open(){
    if(pending)return;
    setPending(true);setError("");
    try{
      const value=await command("/threads","POST",{target,context},threadReceipt);
      router.push(`/${locale}/school/messages?thread=${value.threadId}`);
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setPending(false);}
  }
  return <>
    <button type="button" className="plain-button" disabled={pending} onClick={()=>void open()}>
      {label??(context?.kind==="attendance"?copy[locale].attendance:copy[locale].start)}
    </button>
    {error&&<p role="alert">{error}</p>}
  </>;
}
export function HomeworkConversation({locale,homework}:{locale:Locale;homework:string}){
  const [open,setOpen]=useState(false),text=copy[locale];
  const contacts=useTimetableRead(open?`/academics/homework/${homework}/thread-targets`:null,options);
  return <>
    <button type="button" className="plain-button" aria-expanded={open} onClick={()=>setOpen((old)=>!old)}>{text.homework}</button>
    {open&&<TimetableRead locale={locale} result={contacts}>{(items)=>items.length?<ul className="group-list">
      {items.map((item)=><li key={item.id}>
        <StartConversation locale={locale} target={{kind:"person",id:item.id}} context={{kind:"homework",id:homework}} label={item.displayName}/>
      </li>)}
    </ul>:<p>{text.empty}</p>}</TimetableRead>}
  </>;
}
