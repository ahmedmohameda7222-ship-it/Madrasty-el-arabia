"use client";

import {AutomaticBilling} from "./AutomaticBilling";
import {useState,type FormEvent} from "react";
import {
  billingOptions,billingPupil,feeTariff,feeTariffInput,payerEdit,payerProfile,type Locale,
} from "@madrasty/contracts";
import {useSchoolCommand} from "@/api/commands";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {billingCopy,FeeLines,inputAmountMinor} from "./invoice-ui";

const tariffs=feeTariff.array(),pupils=billingPupil.array();
type Billing=ReturnType<typeof billingOptions.parse>;

export function FeeSettings({locale,student}:{locale:Locale;student?:string}){
  const text=billingCopy[locale],options=useTimetableRead("/finance/billing-options",billingOptions);
  return <div className="auth-form"><AutomaticBilling locale={locale}/><section className="auth-card auth-form"><h1>{text.settings}</h1>
    <TimetableRead locale={locale} result={options}>{(context)=><SettingsForm locale={locale} options={context} student={student}/>}</TimetableRead>
  </section></div>;
}
function SettingsForm({locale,options,student}:{locale:Locale;options:Billing;student?:string}){
  const text=billingCopy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [tab,setTab]=useState<"tariffs"|"payer">(student?"payer":"tariffs");
  const [month,setMonth]=useState(options.schoolMonth),[day,setDay]=useState(String(options.dueDay??1));
  const [amount,setAmount]=useState(""),[revision,setRevision]=useState(0);
  const [preview,setPreview]=useState<ReturnType<typeof feeTariffInput.parse>>(),[selected,setSelected]=useState(student);
  const [term,setTerm]=useState(""),[query,setQuery]=useState("");
  const [pending,setPending]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
  const records=useAcademicPage(tab==="tariffs"?"/finance/tariffs?limit=25":null,tariffs,revision);
  const candidates=useAcademicPage(tab==="payer"&&!selected?`/finance/pupils?limit=25&period=${options.schoolMonth}&q=${encodeURIComponent(query)}`:null,pupils,revision);
  const profile=useTimetableRead(tab==="payer"&&selected?`/finance/children/${selected}/payer`:null,payerProfile,revision);
  const validated=feeTariffInput.safeParse({effectiveFromMonth:month,dueDay:Number(day),lines:[{titleAr:"اشتراك شهري",titleDe:"Monatsbeitrag",amountMinor:options.currency?inputAmountMinor(amount,options.currency):null}]});
  async function save(){
    if(!preview||pending)return;
    setPending(true);setError("");setNotice("");
    try{
      await command("/finance/tariffs","POST",preview,feeTariff);
      setPreview(undefined);setAmount("");setNotice(text.saved);setRevision((value)=>value+1);
    }catch(problem){setError(timetableError(locale,problem));}
    finally{setPending(false);}
  }
  return <>
    <div className="header-actions">
      <button className="plain-button" type="button" aria-pressed={tab==="tariffs"} onClick={()=>setTab("tariffs")}>{text.tariffs}</button>
      <button className="plain-button" type="button" aria-pressed={tab==="payer"} onClick={()=>setTab("payer")}>{text.payer}</button>
    </div>
    {tab==="tariffs"?<>
      {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
      {preview&&options.currency?<div className="notice auth-form">
        <p>{text.effective} · <bdi>{preview.effectiveFromMonth}</bdi></p>
        <p>{text.dueDay} · <bdi>{preview.dueDay}</bdi></p>
        <FeeLines locale={locale} lines={preview.lines} currency={options.currency}/>
        <div className="header-actions">
          <button className="primary-button" type="button" disabled={pending} onClick={()=>void save()}>{pending?text.busy:text.save}</button>
          <button className="plain-button" type="button" disabled={pending} onClick={()=>setPreview(undefined)}>{text.edit}</button>
        </div>
      </div>:<form className="auth-form" onSubmit={(event)=>{event.preventDefault();if(validated.success)setPreview(validated.data);}}>
        <label>{text.effective}<input type="month" dir="ltr" value={month} min={options.schoolMonth} onChange={(event)=>setMonth(event.target.value)} required/></label>
        <label>{text.dueDay}<input type="number" dir="ltr" min={1} max={31} value={day} onChange={(event)=>setDay(event.target.value)} required/></label>
        <label>{locale==="ar"?"الاشتراك الشهري لكل طالب":"Monatsbeitrag pro Schüler"} <bdi>{options.currency}</bdi><input dir="ltr" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
        <button className="primary-button" type="submit" disabled={!validated.success||month<options.schoolMonth}>{text.preview}</button>
      </form>}
      <AcademicPageItems locale={locale} page={records}>{(items)=><ul className="group-list">{items.map((item)=><li key={item.id} className="timetable-day">
        <details><summary>{text.effective} · <bdi>{item.effectiveFromMonth}</bdi></summary>
          <p>{text.dueDay} · {item.dueDay}</p><FeeLines locale={locale} lines={item.lines} currency={item.currency}/>
        </details>
      </li>)}</ul>}</AcademicPageItems>
    </>:selected?<>
      <button className="plain-button" type="button" onClick={()=>setSelected(undefined)}>{text.selectPupil}</button>
      <TimetableRead locale={locale} result={profile}>{(value)=><PayerForm key={value.studentId+"/"+value.revision} locale={locale}
        profile={value} month={options.schoolMonth} refresh={()=>setRevision((n)=>n+1)}/>}</TimetableRead>
    </>:<>
      <form className="auth-form" onSubmit={(event)=>{event.preventDefault();setQuery(term.trim());}}>
        <label>{text.search}<input type="search" value={term} maxLength={100} onChange={(event)=>setTerm(event.target.value)}/></label>
        <button type="submit" className="plain-button">{text.find}</button>
      </form>
      <AcademicPageItems locale={locale} page={candidates}>{(items)=><ul className="group-list">{items.map((item)=><li key={item.id}>
        <button className="plain-button" type="button" onClick={()=>setSelected(item.id)}><bdi>{item.studentName}</bdi> · <bdi>{item.studentNumber}</bdi></button>
      </li>)}</ul>}</AcademicPageItems>
    </>}
  </>;
}
function PayerForm({locale,profile,month,refresh}:{locale:Locale;profile:ReturnType<typeof payerProfile.parse>;month:string;refresh:()=>void}){
  const text=billingCopy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [guardian,setGuardian]=useState(profile.choices[0]?.id??""),[effective,setEffective]=useState(month);
  const [review,setReview]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState("");
  const chosen=profile.choices.find((item)=>item.id===guardian);
  const input=payerEdit.safeParse({guardianId:guardian,effectiveFromMonth:effective,revision:profile.revision});
  async function save(event:FormEvent){
    event.preventDefault();
    if(!input.success||pending||effective<month)return;
    if(!review){setReview(true);return;}
    setPending(true);setError("");
    try{await command(`/finance/children/${profile.studentId}/payer`,"PUT",input.data,payerProfile);refresh();}
    catch(problem){setError(timetableError(locale,problem));}
    finally{setPending(false);}
  }
  return <div className="auth-form">
    <h2><bdi>{profile.studentName}</bdi> · <bdi>{profile.studentNumber}</bdi></h2>
    {!profile.choices.length?<p>{text.emptyPayer}</p>:<form className="auth-form" onSubmit={(event)=>void save(event)}>
      {review?<p className="notice"><bdi>{chosen?.displayName}</bdi> · <bdi>{effective}</bdi></p>:<>
        <label>{text.guardian}<select value={guardian} onChange={(event)=>setGuardian(event.target.value)}>
          {profile.choices.map((item)=><option key={item.id} value={item.id}>{item.displayName}{!item.activeAccount?" · "+text.activeLater:""}</option>)}
        </select></label>
        <label>{text.effective}<input type="month" dir="ltr" min={month} value={effective} onChange={(event)=>setEffective(event.target.value)} required/></label>
      </>}
      <div className="header-actions">
        <button className="primary-button" type="submit" disabled={pending||!input.success||effective<month}>{pending?text.busy:review?text.save:text.preview}</button>
        {review&&<button className="plain-button" type="button" disabled={pending} onClick={()=>setReview(false)}>{text.edit}</button>}
      </div>
    </form>}
    {error&&<p role="alert">{error}</p>}
    <ul className="group-list">{profile.designations.map((item)=><li key={item.revision}>
      <bdi>{item.effectiveFromMonth}</bdi> · <bdi>{item.guardianName}</bdi>
    </li>)}</ul>
  </div>;
}
