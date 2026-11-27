"use client";

import css from "./FinanceWorkspace.module.css";
import {FinanceDateField,financeDate} from "./FinanceDateField";
import {AutomaticBilling} from "./AutomaticBilling";

import {useRef,useState,type FormEvent} from "react";
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
  const options=useTimetableRead("/finance/billing-options",billingOptions);
  return <div className={css.workspace}><section className={`${css.panel} auth-form`}>
    <TimetableRead locale={locale} result={options}>{(context)=><SettingsForm locale={locale} options={context} student={student}/>}</TimetableRead>
  </section></div>;
}
function SettingsForm({locale,options,student}:{locale:Locale;options:Billing;student?:string}){
  const text=billingCopy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [tab,setTab]=useState<"tariffs"|"payer">(student?"payer":"tariffs");
  const [month,setMonth]=useState(options.schoolMonth),[day,setDay]=useState(String(options.dueDay??1));
  const [amount,setAmount]=useState(""),[revision,setRevision]=useState(0);
  const [selected,setSelected]=useState(student),[attempted,setAttempted]=useState(false);
  const lock=useRef(false);
  const [term,setTerm]=useState(""),[query,setQuery]=useState("");
  const [pending,setPending]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
  const records=useAcademicPage(tab==="tariffs"?"/finance/tariffs?limit=25":null,tariffs,revision);
  const candidates=useAcademicPage(tab==="payer"&&!selected?`/finance/pupils?limit=25&period=${options.schoolMonth}&q=${encodeURIComponent(query)}`:null,pupils,revision);
  const profile=useTimetableRead(tab==="payer"&&selected?`/finance/children/${selected}/payer`:null,payerProfile,revision);
  const validated=feeTariffInput.safeParse({effectiveFromMonth:month,dueDay:Number(day),lines:[{titleAr:"اشتراك شهري",titleDe:"Monatsbeitrag",amountMinor:options.currency?inputAmountMinor(amount,options.currency):null}]});
  async function save(event:FormEvent){
    event.preventDefault();setAttempted(true);setError("");setNotice("");
    if(!validated.success||month<options.schoolMonth||lock.current)return;
    lock.current=true;setPending(true);
    try{
      await command("/finance/tariffs","POST",validated.data,feeTariff);
      setAttempted(false);setNotice(text.saved);setRevision((value)=>value+1);
    }catch(problem){setError(timetableError(locale,problem));}
    finally{lock.current=false;setPending(false);}
  }
  return <>
    <div className={`${css.tabs} ${css.feeTabs}`}>
      <button className="plain-button" type="button" aria-label={text.tariffs} aria-pressed={tab==="tariffs"} onClick={()=>setTab("tariffs")}>{locale==="ar"?"الرسوم":"Gebühren"}</button>
      <button className="plain-button" type="button" aria-label={text.payer} aria-pressed={tab==="payer"} onClick={()=>setTab("payer")}>{locale==="ar"?"مسؤول السداد":"Zahler"}</button>
    </div>
    {tab==="tariffs"?<>
      <AutomaticBilling locale={locale}/>
      <h2>{locale==="ar"?"الاشتراك الشهري":"Monatsbeitrag"}</h2>
      {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
      <form className="auth-form" onSubmit={save} noValidate>
        <FinanceDateField locale={locale} label={text.effective} type="month" value={month} min={options.schoolMonth} onChange={(event)=>setMonth(event.target.value)} disabled={pending} required aria-invalid={attempted&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<options.schoolMonth)}/>
        {attempted&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<options.schoolMonth)&&<p role="alert">{locale==="ar"?"اختر الشهر الحالي أو شهرًا قادمًا.":"Wähle diesen oder einen zukünftigen Monat."}</p>}
        <label>{text.dueDay}<input type="number" dir="ltr" min={1} max={31} value={day} disabled={pending} onChange={(event)=>setDay(event.target.value)} required aria-invalid={attempted&&(!Number.isInteger(Number(day))||Number(day)<1||Number(day)>31)}/></label>
        {attempted&&(!Number.isInteger(Number(day))||Number(day)<1||Number(day)>31)&&<p role="alert">{locale==="ar"?"اختر يومًا من ١ إلى ٣١.":"Gib einen Tag zwischen 1 und 31 ein."}</p>}
        <label><span className={css.amountLabel}><span>{locale==="ar"?"الاشتراك الشهري لكل طالب":"Monatsbeitrag pro Schüler"}</span><bdi>{options.currency}</bdi></span><input dir="ltr" inputMode="decimal" value={amount} disabled={pending} onChange={e=>setAmount(e.target.value)} required aria-invalid={attempted&&(!options.currency||inputAmountMinor(amount,options.currency)===null)}/></label>
        {attempted&&(!options.currency||inputAmountMinor(amount,options.currency)===null)&&<p role="alert">{locale==="ar"?"اكتب مبلغ اشتراك صحيحًا أكبر من صفر.":"Gib einen gültigen Monatsbeitrag über 0 ein."}</p>}
        <p className={css.secondary}>{locale==="ar"?"التغيير يسري من الشهر المختار، ولا يعدل الفواتير الصادرة.":"Die Änderung gilt ab dem gewählten Monat. Ausgestellte Rechnungen bleiben unverändert."}</p>
        <button className="primary-button" type="submit" disabled={pending}>{pending?text.busy:text.save}</button>
      </form>
      <AcademicPageItems locale={locale} page={records}>{(items)=><ul className="group-list">{items.map((item)=><li key={item.id} className="timetable-day">
        <details><summary>{text.effective} · <bdi>{financeDate(item.effectiveFromMonth,locale,"month")}</bdi></summary>
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
  const current=[...profile.designations].filter(item=>item.effectiveFromMonth<=month).sort((a,b)=>b.effectiveFromMonth.localeCompare(a.effectiveFromMonth)||b.revision-a.revision)[0];
  const [guardian,setGuardian]=useState(current&&profile.choices.some(item=>item.id===current.guardianId)?current.guardianId:""),[effective,setEffective]=useState(month);
  const [pending,setPending]=useState(false),[error,setError]=useState("");
  const lock=useRef(false);
  const input=payerEdit.safeParse({guardianId:guardian,effectiveFromMonth:effective,revision:profile.revision});
  async function save(event:FormEvent){
    event.preventDefault();
    if(lock.current)return;
    if(!input.success||effective<month){setError(locale==="ar"?"اختر ولي الأمر وشهر السريان الصحيح.":"Wähle einen Elternteil und einen gültigen Monat.");return;}
    lock.current=true;setPending(true);setError("");
    try{await command(`/finance/children/${profile.studentId}/payer`,"PUT",input.data,payerProfile);refresh();}
    catch(problem){setError(timetableError(locale,problem));}
    finally{lock.current=false;setPending(false);}
  }
  return <div className="auth-form">
    <h2><bdi>{profile.studentName}</bdi> · <bdi>{profile.studentNumber}</bdi></h2>
    {!profile.choices.length?<p>{text.emptyPayer}</p>:<form className="auth-form" onSubmit={(event)=>void save(event)} noValidate>
      <>
        <label>{text.guardian}<select value={guardian} disabled={pending} onChange={(event)=>setGuardian(event.target.value)}>
          <option value="" disabled>{locale==="ar"?"اختر مسؤول السداد":"Zahler auswählen"}</option>
          {profile.choices.map((item)=><option key={item.id} value={item.id}>{item.displayName}{!item.activeAccount?" · "+text.activeLater:""}</option>)}
        </select></label>
        <FinanceDateField locale={locale} label={text.effective} type="month" min={month} value={effective} disabled={pending} onChange={(event)=>setEffective(event.target.value)} required/>
      </>
      <div className="header-actions">
        <button className="primary-button" type="submit" disabled={pending}>{pending?text.busy:text.save}</button>
      </div>
    </form>}
    {error&&<p role="alert">{error}</p>}
    <ul className="group-list">{profile.designations.map((item)=><li key={item.revision}>
      <bdi>{financeDate(item.effectiveFromMonth,locale,"month")}</bdi> · <bdi>{item.guardianName}</bdi>
    </li>)}</ul>
  </div>;
}
