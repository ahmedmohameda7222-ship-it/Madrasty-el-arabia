"use client";

import Link from "next/link";
import {useState,type FormEvent} from "react";
import {billingMonth,childSummarySchema,enrollmentStop,stopOptions,stopSubmit,type Locale} from "@madrasty/contracts";
import {useSchoolCommand} from "@/api/commands";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {nextBillingMonth,stopCopy,StopMonths} from "./stop-ui";

const pupils=childSummarySchema.array();
export function StopRequest({locale,initialStudent,submitted}:{locale:Locale;initialStudent?:string;submitted:()=>void}){
  const options=useTimetableRead("/enrollment-stops/options",stopOptions);
  return <TimetableRead locale={locale} result={options}>
    {(data)=><RequestForm locale={locale} initialStudent={initialStudent} month={data.schoolMonth} submitted={submitted}/>}
  </TimetableRead>;
}

function RequestForm({locale,initialStudent,month,submitted}:{
  locale:Locale;initialStudent?:string;month:string;submitted:()=>void;
}){
  const text=stopCopy[locale],command=useSchoolCommand("guardian");
  const [student,setStudent]=useState(initialStudent??""),[last,setLast]=useState(month);
  const [duration,setDuration]=useState<"one_month"|"indefinite">("one_month"),[reason,setReason]=useState("");
  const [preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [saved,setSaved]=useState<ReturnType<typeof enrollmentStop.parse>>();
  const choices=useAcademicPage("/me/children?limit=50",pupils,0);
  const start=billingMonth.safeParse(last).success?nextBillingMonth(last):undefined;
  const end=duration==="one_month"&&start?nextBillingMonth(start):null;
  const input=stopSubmit.safeParse({studentId:student,lastAttendanceMonth:last,duration,reason});
  const valid=input.success&&last>=month&&!!start&&(duration==="indefinite"||!!end);
  const root=`/${locale}/school/more/enrollment-stops`;
  async function save(event:FormEvent){
    event.preventDefault();
    if(!valid||busy)return;
    if(!preview){setPreview(true);setError("");return;}
    setBusy(true);setError("");
    try{
      const result=await command("/enrollment-stops","POST",input.data,enrollmentStop);
      setSaved(result);setPreview(false);submitted();
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setBusy(false);}
  }
  if(saved)return <div className="notice auth-form" role="status"><p>{text.saved} · {text[saved.state]}</p>
    <Link className="plain-button" href={`${root}?request=${saved.id}`}>{text.title}</Link></div>;
  return <section className="auth-form">
    <h2>{text.newRequest}</h2>
    <form className="auth-form" onSubmit={(event)=>void save(event)}>
      {error&&<p role="alert">{error}</p>}
      {preview&&start?<>
        <AcademicPageItems locale={locale} page={choices}>{(items)=><p><bdi>{items.find((item)=>item.id===student)?.displayName}</bdi></p>}</AcademicPageItems>
        <StopMonths locale={locale} last={last} start={start} end={end??null}/>
        <p>{text.reason} · <bdi>{reason.trim()}</bdi></p>
      </>:<>
        <AcademicPageItems locale={locale} page={choices}>{(items)=><label>{text.child}<select value={student}
          onChange={(event)=>setStudent(event.target.value)} required>
          <option value="">{text.choose}</option>{items.map((item)=><option key={item.id} value={item.id}>{item.displayName} · {item.studentNumber}</option>)}
        </select></label>}</AcademicPageItems>
        <label>{text.last}<input type="month" dir="ltr" value={last} min={month} onChange={(event)=>setLast(event.target.value)} required/></label>
        <label>{text.duration}<select value={duration} onChange={(event)=>setDuration(event.target.value==="indefinite"?"indefinite":"one_month")}>
          <option value="one_month">{text.one_month}</option><option value="indefinite">{text.indefinite}</option>
        </select></label>
        <label>{text.reason}<textarea value={reason} minLength={3} maxLength={800} onChange={(event)=>setReason(event.target.value)} required/></label>
      </>}
      <div className="header-actions">
        <button type="submit" className="primary-button" disabled={!valid||busy}>{preview?text.submit:text.preview}</button>
        {preview&&<button type="button" className="plain-button" disabled={busy} onClick={()=>setPreview(false)}>{text.edit}</button>}
      </div>
    </form>
  </section>;
}
