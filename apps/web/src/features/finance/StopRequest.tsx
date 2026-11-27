"use client";

import Link from "next/link";
import {useRef,useState,type FormEvent} from "react";
import {billingMonth,childSummarySchema,enrollmentStop,stopOptions,stopSubmit,type Locale} from "@madrasty/contracts";
import {useSchoolCommand} from "@/api/commands";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {nextBillingMonth,stopCopy,StopMonths} from "./stop-ui";

const pupils=childSummarySchema.array();
export function StopRequest({locale,initialStudent,submitted}:{locale:Locale;initialStudent?:string;submitted:()=>void}){
  const options=useTimetableRead("/enrollment-stops/options",stopOptions);
  return <TimetableRead locale={locale} result={options}>
    {(data)=><RequestForm key={data.schoolMonth} locale={locale} initialStudent={initialStudent} month={data.schoolMonth} submitted={submitted}/>}
  </TimetableRead>;
}

function RequestForm({locale,initialStudent,month,submitted}:{
  locale:Locale;initialStudent?:string;month:string;submitted:()=>void;
}){
  const text=stopCopy[locale],ar=locale==="ar",command=useSchoolCommand("guardian");
  const [student,setStudent]=useState(initialStudent??""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [saved,setSaved]=useState<ReturnType<typeof enrollmentStop.parse>>();
  const submitting=useRef(false);
  const choices=useAcademicPage("/me/children?limit=50",pupils,0);
  const start=billingMonth.safeParse(month).success?nextBillingMonth(month):undefined;
  const end=start?nextBillingMonth(start):undefined;
  const input=stopSubmit.safeParse({studentId:student,lastAttendanceMonth:month,duration:"one_month",reason:ar?"توقف مؤقت":"Teilnahmepause"});
  const valid=input.success&&!!start&&!!end;
  const root=`/${locale}/school/more/enrollment-stops`;
  async function save(event:FormEvent){
    event.preventDefault();
    if(!input.success||!valid||submitting.current||saved)return;
    submitting.current=true;setBusy(true);setError("");
    try{
      const result=await command("/enrollment-stops","POST",input.data,enrollmentStop);
      setSaved(result);submitted();
    }catch(problem){setError(timetableError(locale,problem));}
    finally{submitting.current=false;setBusy(false);}
  }
  if(saved)return <div className="notice auth-form" role="status"><p>{text.saved} · {text[saved.state]}</p>
    <Link className="plain-button" href={`${root}?request=${saved.id}`}>{text.title}</Link></div>;
  return <section className="auth-form">
    <h2>{text.newRequest}</h2>
    <form className="auth-form" onSubmit={(event)=>void save(event)}>
      {error&&<p role="alert">{error}</p>}
      <AcademicPageItems locale={locale} page={choices}>{(items)=><label>{text.child}<select value={student}
        onChange={(event)=>setStudent(event.target.value)} required disabled={busy}>
        <option value="">{text.choose}</option>{items.map((item)=><option key={item.id} value={item.id}>{item.displayName} · {item.studentNumber}</option>)}
      </select></label>}</AcademicPageItems>
      {start&&end&&<StopMonths locale={locale} last={month} start={start} end={end}/>}
      <p>{ar?"التوقف للشهر القادم فقط. رسوم الشهر الحالي لا تتغير.":"Die Pause gilt nur für den nächsten Monat. Der Beitrag für diesen Monat bleibt unverändert."}</p>
      <button type="submit" className="primary-button" disabled={!valid||busy}>{text.submit}</button>
    </form>
  </section>;
}
