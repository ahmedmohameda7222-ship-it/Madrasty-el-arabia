"use client";

import Link from "next/link";
import {useState} from "react";
import {enrollmentStop,stopState,type EnrollmentStop,type Locale} from "@madrasty/contracts";
import {ApiResponseError} from "@/api/client";
import {useSchoolCommand} from "@/api/commands";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {StopRequest} from "./StopRequest";
import {stopCopy,StopFacts} from "./stop-ui";

const records=enrollmentStop.array();
export function StopQueue({locale,id,student,staff}:{locale:Locale;id?:string;student?:string;staff:boolean}){
  const text=stopCopy[locale],root=`/${locale}/school/more/enrollment-stops`;
  const [status,setStatus]=useState(""),[refresh,setRefresh]=useState(0),[notice,setNotice]=useState("");
  const queue=useAcademicPage(id?null:`/enrollment-stops?limit=25${status?"&status="+status:""}${student?"&studentId="+student:""}`,records,refresh);
  const detail=useTimetableRead(id?`/enrollment-stops/${id}`:null,enrollmentStop,refresh);
  return <section className="auth-card auth-form">
    <h1>{staff?text.staffTitle:text.title}</h1>
    {notice&&<p role="status">{notice}</p>}
    {id?<><Link className="plain-button" href={root}>{text.back}</Link>
      <TimetableRead locale={locale} result={detail}>{(item)=><>
        <StopFacts locale={locale} item={item}/>
        {(item.canDecide||item.canWithdraw)&&<Decision key={item.revision} locale={locale} item={item}
          updated={(message)=>{setNotice(message);setRefresh((n)=>n+1);}}/>}
      </>}</TimetableRead>
    </>:<>
      {!staff&&<StopRequest locale={locale} initialStudent={student} submitted={()=>setRefresh((n)=>n+1)}/>}
      <label>{text.all}<select value={status} onChange={(event)=>setStatus(stopState.safeParse(event.target.value).data??"")}>
        <option value="">{text.all}</option>{stopState.options.map((key)=><option key={key} value={key}>{text[key]}</option>)}
      </select></label>
      {student&&<Link href={root}>{text.all}</Link>}
      <AcademicPageItems locale={locale} page={queue}>{(items)=><ul className="group-list">{items.map((item)=><li className="timetable-day" key={item.id}>
        <Link className="group-row" href={`${root}?request=${item.id}`}><bdi>{item.studentName}</bdi> · <bdi>{item.studentNumber}</bdi></Link>
        <p>{text[item.state]} · <bdi>{item.startMonth}</bdi> · {item.endMonthExclusive?<bdi>{item.endMonthExclusive}</bdi>:text.indefinite}</p>
      </li>)}</ul>}</AcademicPageItems>
    </>}
  </section>;
}

function Decision({locale,item,updated}:{locale:Locale;item:EnrollmentStop;updated:(message:string)=>void}){
  const text=stopCopy[locale],command=useSchoolCommand(useAccountScope().persona);
  const [choice,setChoice]=useState<"withdraw"|"approve"|"reject">(),[note,setNote]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function confirm(){
    if(!choice||busy)return;
    setBusy(true);setError("");
    try{
      const path=`/enrollment-stops/${item.id}` as const;
      const reply=choice==="withdraw"?
        await command(path,"PATCH",{action:"withdraw",revision:item.revision},enrollmentStop):
        await command(`${path}/decision`,"POST",{decision:choice,note:note.trim()||undefined,revision:item.revision},enrollmentStop);
      updated(text[reply.state]);
    }catch(problem){
      if(problem instanceof ApiResponseError&&problem.status===409)updated(text.stale);
      else setError(timetableError(locale,problem));
    }finally{setBusy(false);}
  }
  return <div className="auth-form">
    {error&&<p role="alert">{error}</p>}
    {choice?<>
      <h3>{text[choice]}</h3>
      {choice!=="withdraw"&&<label>{text.note}<textarea value={note} onChange={(event)=>setNote(event.target.value)} maxLength={800}/></label>}
      <div className="header-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={()=>void confirm()}>{text.confirm}</button>
        <button type="button" className="plain-button" disabled={busy} onClick={()=>setChoice(undefined)}>{text.edit}</button>
      </div>
    </>:<div className="header-actions">
      {item.canWithdraw&&<button type="button" className="plain-button" onClick={()=>setChoice("withdraw")}>{text.withdraw}</button>}
      {item.canDecide&&<><button type="button" className="primary-button" onClick={()=>setChoice("approve")}>{text.approve}</button>
        <button type="button" className="plain-button" onClick={()=>setChoice("reject")}>{text.reject}</button></>}
    </div>}
  </div>;
}
