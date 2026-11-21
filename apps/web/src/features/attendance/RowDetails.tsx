"use client";

import { useEffect, useState } from "react";
import { attendanceRowDetail, type AttendanceRow, type Locale } from "@madrasty/contracts";
import { ApiResponseError } from "@/api/client";
import { useSchoolCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { TimetableRead, useTimetableRead } from "@/features/school/timetable/shared";

const words={
  ar:{details:"تفاصيل الحالة",reason:"العذر من ولي الأمر",arrival:"تأكيد الحضور الفعلي",present:"وصل في الموعد",late:"وصل متأخر",
    confirm:"سجّل الحضور الفعلي",changed:"الحالة اتغيّرت. راجع الحالة الحالية وأكّد الحضور مرة تانية.",
    recorded:"تم تسجيل الحضور الفعلي.",protected:"سبب العذر متاح للموظف المختص."},
  de:{details:"Eintrag ansehen",reason:"Entschuldigung der Familie",arrival:"Tatsächliche Ankunft bestätigen",present:"Pünktlich eingetroffen",late:"Verspätet eingetroffen",
    confirm:"Tatsächliche Ankunft erfassen",changed:"Der Eintrag wurde geändert. Prüfen Sie ihn und bestätigen Sie die Ankunft erneut.",
    recorded:"Die tatsächliche Ankunft wurde erfasst.",protected:"Der Grund ist für die zuständige Person sichtbar."},
} as const;

export function RowDetails({locale,id,markable,changed,revision}:{
  locale:Locale;id:string;markable:boolean;changed:(row:AttendanceRow)=>void;revision:number;
}){
  const text=words[locale],common=dictionary(locale),{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [open,setOpen]=useState(false);
  const [picked,setPicked]=useState<"present"|"late">();
  const [review,setReview]=useState<number>();
  const [refresh,setRefresh]=useState(0);
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState<{text:string;error:boolean}>();
  const path=`/attendance/rows/${id}` as const;
  const details=useTimetableRead(open?`${path}?detail=private`:null,attendanceRowDetail,refresh);
  useEffect(()=>{
    if(open){setReview(undefined);setRefresh((count)=>count+1);}
  },[open,revision]);

  function close(){
    setOpen(false);setReview(undefined);setPicked(undefined);setMessage(undefined);
  }
  async function submit(status:"present"|"late",expected:number){
    setPending(true);
    setMessage(undefined);
    try{
      const updated=await command(`${path}/confirm-arrival`,"POST",{status,revision:expected,confirm:true},attendanceRowDetail);
      changed(updated.row);
      setMessage({text:text.recorded,error:false});
      setRefresh((count)=>count+1);
    }catch(error){
      const stale=error instanceof ApiResponseError&&error.code==="stale_revision";
      setMessage({text:stale?text.changed:error instanceof ApiResponseError
        ?localizedError(locale,error.messageKey):common["error.unavailable"],error:true});
      if(error instanceof ApiResponseError&&[401,403,404,409].includes(error.status))setRefresh((count)=>count+1);
    }finally{setPending(false);setReview(undefined);}
  }

  if(!open)return <button className="plain-button" type="button" onClick={()=>setOpen(true)}>{text.details}</button>;
  return <section className="auth-card auth-form">
    <button type="button" className="plain-button" disabled={pending} onClick={close}>{common.close}</button>
    <TimetableRead locale={locale} result={details}>{({row,excuseReason})=><>
      {excuseReason&&<div><h4>{text.reason}</h4><p><bdi>{excuseReason}</bdi></p></div>}
      {row.locked&&!excuseReason&&<p>{text.protected}</p>}
      {markable&&!row.confirmedArrivalAt&&<>
        <fieldset disabled={pending}>
          <legend>{text.arrival}</legend>
          {(["present","late"] as const).map((status)=><label key={status} className="access-check">
            <input type="radio" name={`arrival-${id}`} checked={picked===status}
              onChange={()=>{setPicked(status);setReview(undefined);}}/>{text[status]}
          </label>)}
        </fieldset>
        {picked&&review!==row.revision&&<button type="button" className="plain-button" disabled={pending}
          onClick={()=>setReview(row.revision)}>{text.arrival}</button>}
        {picked&&review===row.revision&&<button type="button" className="primary-button" disabled={pending}
          onClick={()=>void submit(picked,review)}>{text.confirm}</button>}
      </>}
      {row.confirmedArrivalAt&&<p>{text.recorded}</p>}
      {message&&<p role={message.error?"alert":"status"}>{message.text}</p>}
    </>}</TimetableRead>
  </section>;
}
