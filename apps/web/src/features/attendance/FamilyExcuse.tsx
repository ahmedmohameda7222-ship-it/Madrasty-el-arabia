"use client";

import { useEffect, useState } from "react";
import { familyExcuseDay, familyExcuseCommandReceipt, type FamilyExcuseReceipt, type Locale } from "@madrasty/contracts";
import { ApiResponseError } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { TimetableRead, useTimetableRead } from "@/features/school/timetable/shared";

const words={
  ar:{title:"عذر الغياب",date:"يوم الغياب",apply:"اعرض اليوم",reason:"سبب الغياب",draft:"عذر غير مُرسل",
    submit:"إرسال العذر للمدرسة",withdraw:"سحب العذر",confirm:"تأكيد السحب",closed:"لا يمكن إرسال عذر لليوم ده.",
    pending:"تم استلام العذر",withdrawn:"تم سحب العذر",superseded:"تأكد الحضور الفعلي",notices:"أعذار اليوم",confirmed:"وصل العذر للمدرسة."},
  de:{title:"Abwesenheit entschuldigen",date:"Tag der Abwesenheit",apply:"Tag anzeigen",reason:"Grund der Abwesenheit",draft:"Entschuldigung nicht gesendet",
    submit:"Entschuldigung an die Schule senden",withdraw:"Entschuldigung zurückziehen",confirm:"Rücknahme bestätigen",closed:"Für diesen Tag kann keine Entschuldigung gesendet werden.",
    pending:"Entschuldigung eingegangen",withdrawn:"Entschuldigung zurückgezogen",superseded:"Ankunft bestätigt",notices:"Entschuldigungen für diesen Tag",confirmed:"Die Schule hat die Entschuldigung erhalten."},
} as const;

export function FamilyExcuse({locale,child}:{locale:Locale;child:string}){
  const text=words[locale],common=dictionary(locale),command=useSchoolCommand("guardian");
  const base=`/children/${child}/attendance/excuses` as const;
  const [day,setDay]=useState("");
  const [dateInput,setDateInput]=useState("");
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [withdraw,setWithdraw]=useState<FamilyExcuseReceipt>();
  const [feedback,setFeedback]=useState<{text:string;problem:boolean}>();
  const view=useTimetableRead(day?`${base}?date=${day}`:base,familyExcuseDay,refresh);
  const knownDay=view.value?.data?.schoolDate;
  const lost=view.value?.error instanceof ApiResponseError && [401,403,404].includes(view.value.error.status);

  useEffect(()=>{
    if(lost){setDrafts({});setFeedback(undefined);setWithdraw(undefined);}
  },[lost]);
  useEffect(()=>{
    const reload=()=>setRefresh((count)=>count+1);
    window.addEventListener("focus",reload);
    return ()=>window.removeEventListener("focus",reload);
  },[]);

  async function change(action:()=>Promise<void>){
    setBusy(true);
    setFeedback(undefined);
    try{await action();}
    catch(error){
      setFeedback({text:error instanceof ApiResponseError?localizedError(locale,error.messageKey):common["error.unavailable"],problem:true});
    }finally{setBusy(false);setWithdraw(undefined);setRefresh((count)=>count+1);}
  }

  return <>
    <h1>{text.title}</h1>
    <form className="auth-form auth-card" onSubmit={(event)=>{
      event.preventDefault();setDay(dateInput||knownDay||"");setWithdraw(undefined);setFeedback(undefined);
    }}>
      <label>{text.date}<input type="date" value={dateInput||knownDay||""} onChange={(event)=>setDateInput(event.target.value)}/></label>
      <button className="plain-button" type="submit" disabled={busy}>{text.apply}</button>
    </form>
    <TimetableRead locale={locale} result={view}>{(record)=>{
      const date=record.schoolDate,reason=drafts[date]??"";
      const active=record.receipts.some((item)=>item.state==="pending");
      return <section className="auth-card auth-form">
        <h2><bdi>{record.child.displayName}</bdi></h2>
        <bdi dir="ltr">{date}</bdi>
        {record.teachingDay&&!active&&<form className="auth-form" onSubmit={(event)=>{
          event.preventDefault();
          if(!reason.trim())return;
          void change(async()=>{
            await command(base,"POST",{schoolDate:date,reason:reason.trim()},familyExcuseCommandReceipt);
            setDrafts((drafted)=>({...drafted,[date]:""}));
            setFeedback({text:text.confirmed,problem:false});
          });
        }}>
          <label>{text.reason}<textarea required disabled={busy} value={reason} maxLength={500}
            onChange={(event)=>setDrafts({...drafts,[date]:event.target.value})}/></label>
          {reason&&<p role="status">{text.draft}</p>}
          <button type="submit" className="primary-button" disabled={busy||!reason.trim()}>{text.submit}</button>
        </form>}
        {!record.teachingDay&&<p>{text.closed}</p>}
        {record.receipts.length>0&&<>
          <h3>{text.notices}</h3>
          <ul className="group-list">{record.receipts.map((item)=><li key={item.id} className="timetable-day">
            <strong>{text[item.state]}</strong>
            <p><bdi>{item.reason}</bdi></p>
            <bdi>{new Date(item.submittedAt).toLocaleString(locale==="ar"?"ar":"de-DE")}</bdi>
            {item.withdrawable&&<div className="header-actions">
              <button type="button" className="plain-button" disabled={busy} onClick={()=>setWithdraw(item)}>{text.withdraw}</button>
              {withdraw?.id===item.id&&<button type="button" className="primary-button" disabled={busy} onClick={()=>void change(async()=>{
                await command(`${base}/${item.id}/withdraw`,"POST",{revision:withdraw.revision},familyExcuseCommandReceipt);
                setFeedback({text:text.withdrawn,problem:false});
              })}>{text.confirm}</button>}
            </div>}
          </li>)}</ul>
        </>}
        {feedback&&<p role={feedback.problem?"alert":"status"}>{feedback.text}</p>}
      </section>;
    }}</TimetableRead>
  </>;
}
