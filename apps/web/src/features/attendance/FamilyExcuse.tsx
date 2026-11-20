"use client";

import { useEffect, useRef, useState } from "react";
import { familyExcuseDay, familyExcuseCommandReceipt, type FamilyExcuseReceipt, type Locale } from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { webHeaders } from "@/features/identity/SessionControls";
import { useAccountScope } from "@/ui/AccountScope";
import { activateAttendanceDrafts, excuseSlot, purgeAttendanceSlots, readPrivateDraft, writePrivateDraft, type CachedExcuse } from "./draft-store";
import { dictionary, localizedError } from "@/i18n";
import { TimetableRead, useTimetableRead } from "@/features/school/timetable/shared";

const words={
  ar:{title:"عذر الغياب",date:"يوم الغياب",apply:"اعرض اليوم",reason:"سبب الغياب",draft:"عذر غير مُرسل",
    submit:"إرسال العذر للمدرسة",withdraw:"سحب العذر",confirm:"تأكيد السحب",closed:"لا يمكن إرسال عذر لليوم ده.",
    pending:"تم استلام العذر",withdrawn:"تم سحب العذر",superseded:"تأكد الحضور الفعلي",notices:"أعذار اليوم",confirmed:"وصل العذر للمدرسة.",offline:"مسودات الأعذار على الجهاز",storage:"تعذّر حفظ المسودة على هذا الجهاز."},
  de:{title:"Abwesenheit entschuldigen",date:"Tag der Abwesenheit",apply:"Tag anzeigen",reason:"Grund der Abwesenheit",draft:"Entschuldigung nicht gesendet",
    submit:"Entschuldigung an die Schule senden",withdraw:"Entschuldigung zurückziehen",confirm:"Rücknahme bestätigen",closed:"Für diesen Tag kann keine Entschuldigung gesendet werden.",
    pending:"Entschuldigung eingegangen",withdrawn:"Entschuldigung zurückgezogen",superseded:"Ankunft bestätigt",notices:"Entschuldigungen für diesen Tag",confirmed:"Die Schule hat die Entschuldigung erhalten.",offline:"Entschuldigungsentwürfe auf dem Gerät",storage:"Der Entwurf konnte auf diesem Gerät nicht gespeichert werden."},
} as const;

export function FamilyExcuse({locale,child,initialDate}:{locale:Locale;child:string;initialDate?:string}){
  const text=words[locale],common=dictionary(locale),command=useSchoolCommand("guardian"),actor=useAccountScope();
  const base=`/children/${child}/attendance/excuses` as const;
  const [day,setDay]=useState(initialDate??"");
  const [dateInput,setDateInput]=useState(initialDate??"");
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [storageUnavailable,setStorageUnavailable]=useState(false);
  const records=useRef(new Map<string,CachedExcuse>());
  const saveTail=useRef(Promise.resolve(true));
  const [busy,setBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [withdraw,setWithdraw]=useState<FamilyExcuseReceipt>();
  const [feedback,setFeedback]=useState<{text:string;problem:boolean}>();
  const view=useTimetableRead(day?`${base}?date=${day}`:base,familyExcuseDay,refresh);
  const knownDay=view.value?.data?.schoolDate;
  const lost=view.value?.error instanceof ApiResponseError && [401,403,404].includes(view.value.error.status);

  useEffect(()=>{
    if(lost){
      records.current.clear();setDrafts({});setFeedback(undefined);setWithdraw(undefined);
      void saveTail.current.catch(()=>false).then(()=>purgeAttendanceSlots(actor,`excuse/${child}/`));
    }
  },[actor,child,lost]);
  useEffect(()=>{
    const reload=()=>setRefresh((count)=>count+1);
    window.addEventListener("focus",reload);
    window.addEventListener("online",reload);
    return ()=>{window.removeEventListener("focus",reload);window.removeEventListener("online",reload);};
  },[]);

  function save(record:CachedExcuse){
    records.current.set(record.schoolDate,record);
    setDrafts((state)=>({...state,[record.schoolDate]:record.reason}));
    const promise=saveTail.current.catch(()=>false).then(()=>writePrivateDraft(actor,excuseSlot(child,record.schoolDate),record));
    saveTail.current=promise;
    void promise.then((ok)=>setStorageUnavailable(!ok));
    return promise;
  }

  useEffect(()=>{
    const confirmed=view.value?.data;
    if(!confirmed)return;
    let active=true;
    const date=confirmed.schoolDate;
    void activateAttendanceDrafts(actor,locale).then(async()=>{
      const old=records.current.get(date)??await readPrivateDraft<CachedExcuse>(actor,excuseSlot(child,date));
      if(!active)return;
      const already=old?.inFlight&&confirmed.receipts.some((receipt)=>receipt.reason===old.inFlight?.reason&&receipt.state==="pending");
      await save({kind:"excuse",schoolDate:date,child:confirmed.child,confirmedAt:new Date().toISOString(),
        teachingDay:confirmed.teachingDay,validUntil:Date.parse(actor.expiresAt??""),reason:already?"":old?.reason??"",inFlight:already?undefined:old?.inFlight});
    });
    return ()=>{active=false;};
  },[actor,child,locale,view.value?.data]);

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
      <a className="plain-button" href="/offline/attendance.html">{text.offline}</a>
    </form>
    <TimetableRead locale={locale} result={view}>{(record)=>{
      const date=record.schoolDate,reason=drafts[date]??"";
      const active=record.receipts.some((item)=>item.state==="pending");
      return <section className="auth-card auth-form">
        <h2><bdi>{record.child.displayName}</bdi></h2>
        <bdi dir="ltr">{date}</bdi>
        {record.teachingDay&&!active&&records.current.has(date)&&<form className="auth-form" onSubmit={(event)=>{
          event.preventDefault();
          if(!reason.trim())return;
          void change(async()=>{
            const original=records.current.get(date);
            if(!original||!navigator.onLine)return;
            const body={schoolDate:date,reason:reason.trim()};
            const attempt=original.inFlight?.reason===body.reason?original.inFlight:{key:crypto.randomUUID(),reason:body.reason};
            await save({...original,inFlight:attempt});
            await requestApi(base,familyExcuseCommandReceipt,{method:"POST",
              headers:{...webHeaders("guardian"),"Idempotency-Key":attempt.key},body:JSON.stringify(body)});
            await save({...original,reason:"",inFlight:undefined});
            setFeedback({text:text.confirmed,problem:false});
          });
        }}>
          <label>{text.reason}<textarea required disabled={busy} value={reason} maxLength={500}
            onChange={(event)=>{const before=records.current.get(date);if(before)void save({...before,reason:event.target.value});}}/></label>
          {reason&&<p role="status">{text.draft}</p>}
          <button type="submit" className="primary-button" disabled={busy||!reason.trim()}>{text.submit}</button>
        </form>}
        {storageUnavailable&&<p role="alert">{text.storage}</p>}
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
