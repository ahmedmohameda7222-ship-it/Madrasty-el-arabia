"use client";

import css from "./FinanceWorkspace.module.css";

import {useState,type FormEvent} from "react";
import {z} from "zod";
import {
  bankChangeReceipt,bankChallenge,bankProposal,bankStepUpProof,schoolBank,
  type BankProposal,type Locale,
} from "@madrasty/contracts";
import {ApiResponseError,requestApi} from "@/api/client";
import {webHeaders} from "@/api/client-headers";
import {useSchoolCommand} from "@/api/commands";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {ConfirmedAt,CopyValue} from "@/ui/RecordValues";
import {displayIban,transferCopy} from "./TransferDetails";

const copy={
  ar:{title:"حساب التحصيل",current:"الحساب النشط",empty:"حساب التحصيل لسه متسجّلش.",propose:"حساب التحصيل الجديد",
    review:"مراجعة البيانات",confirm:"تأكيد البيانات والمتابعة للتحقق",edit:"تعديل البيانات",factor:"تطبيق المصادقة",
    noFactor:"أضف تطبيق مصادقة من إعدادات الأمان علشان تعتمد حساب التحصيل.",
    code:"الرمز المكوّن من ٦ أرقام من تطبيق المصادقة",apply:"اعتماد حساب التحصيل",retry:"أعد المحاولة",
    saved:"اتحدّث حساب التحصيل",busy:"جارٍ التنفيذ",expired:"ابدأ تحقق جديد علشان تعتمد التغيير.",
    stale:"بيانات حساب التحصيل اتغيّرت. اعمل معاينة جديدة.",invalidIban:"راجع صيغة الآيبان وأرقام التحقق."},
  de:{title:"Zahlungskonto",current:"Aktives Zahlungskonto",empty:"Das Zahlungskonto ist noch nicht eingerichtet.",propose:"Neues Zahlungskonto",
    review:"Daten prüfen",confirm:"Daten bestätigen und verifizieren",edit:"Daten bearbeiten",factor:"Authentifizierungs-App",
    noFactor:"Richte eine Authentifizierungs-App in den Sicherheitseinstellungen ein, um das Zahlungskonto freizugeben.",
    code:"Sechsstelliger Code aus der Authentifizierungs-App",apply:"Zahlungskonto freigeben",retry:"Erneut versuchen",
    saved:"Zahlungskonto aktualisiert",busy:"Wird verarbeitet",expired:"Starte eine neue Verifizierung, um die Änderung zu bestätigen.",
    stale:"Das Zahlungskonto wurde geändert. Prüfe die Daten erneut.",invalidIban:"Prüfe das IBAN-Format und die Prüfziffern."},
} as const;
const verifiedFactors=z.array(z.object({id:z.uuid(),friendly_name:z.string().optional(),status:z.enum(["verified","unverified"])}));
type Settings=ReturnType<typeof schoolBank.parse>;
type Challenge=ReturnType<typeof bankChallenge.parse>;
type Proof=ReturnType<typeof bankStepUpProof.parse>;

export function BankSettings({locale}:{locale:Locale}){
  const labels=copy[locale];
  const [version,setVersion]=useState(0),[receipt,setReceipt]=useState<string>();
  const settings=useTimetableRead("/finance/bank",schoolBank,version);
  return <section className={`${css.workspace} auth-form`}>
    <h1>{labels.title}</h1>
    {receipt&&<p role="status">{labels.saved} · <bdi dir="ltr">{receipt}</bdi></p>}
    <TimetableRead locale={locale} result={settings}>{(value)=><BankEditor key={value.revision} locale={locale} settings={value}
      saved={(masked)=>{setReceipt(masked);setVersion((current)=>current+1);}}
      reload={()=>setVersion((current)=>current+1)}/>}</TimetableRead>
  </section>;
}

function BankEditor({locale,settings,saved,reload}:{locale:Locale;settings:Settings;saved:(masked:string)=>void;reload:()=>void}){
  const text=copy[locale],fields=transferCopy[locale],{persona}=useAccountScope();
  const command=useSchoolCommand(persona);
  const [beneficiary,setBeneficiary]=useState(settings.active?.beneficiary??""),[iban,setIban]=useState(settings.active?.iban??"");
  const [proposal,setProposal]=useState<BankProposal>(),[challenge,setChallenge]=useState<Challenge>(),[proof,setProof]=useState<Proof>();
  const [factor,setFactor]=useState(""),[code,setCode]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const factors=useTimetableRead(proposal?"/auth/mfa/factors":null,verifiedFactors);
  const choices=factors.value?.data?.filter((item)=>item.status==="verified")??[];
  const selected=choices.find((item)=>item.id===factor)??choices[0];
  const candidate=bankProposal.safeParse({beneficiary,iban,revision:settings.revision});
  const request=(body:unknown,method:"POST"|"PATCH"="POST")=>({method,headers:webHeaders(persona),body:JSON.stringify(body)});
  function closeVerification(){setChallenge(undefined);setProof(undefined);setCode("");}

  async function review(event:FormEvent){
    event.preventDefault();
    if(!candidate.success||busy)return;
    setBusy(true);setError("");
    try{
      const {data}=await requestApi("/finance/bank/preview",bankProposal,request(candidate.data));
      setProposal(data);closeVerification();
    }catch(problem){
      if(problem instanceof ApiResponseError&&problem.status===409){setError(text.stale);reload();}
      else setError(problem instanceof ApiResponseError&&problem.fields?.iban?text.invalidIban:timetableError(locale,problem));
    }finally{setBusy(false);}
  }
  async function begin(){
    if(!proposal||!selected||busy)return;
    setBusy(true);setError("");closeVerification();
    try{
      const {data}=await requestApi("/finance/bank/step-up",bankChallenge,request({...proposal,factorId:selected.id}));
      setChallenge(data);
    }catch(problem){
      if(problem instanceof ApiResponseError&&problem.status===409){setProposal(undefined);setError(text.stale);reload();}
      else setError(timetableError(locale,problem));
    }finally{setBusy(false);}
  }
  async function apply(event:FormEvent){
    event.preventDefault();
    if(!proposal||busy||!proof&&(!challenge||!/^[0-9]{6}$/.test(code)))return;
    let verified=proof;
    setBusy(true);setError("");
    try{
      if(!verified&&challenge){
        const {data}=await requestApi("/finance/bank/step-up",bankStepUpProof,request({challengeId:challenge.challengeId,code},"PATCH"));
        verified=data;setProof(data);setCode("");
      }
      if(!verified)return;
      const confirmation=await command("/finance/bank","PUT",{...proposal,stepUpProof:verified.stepUpProof},bankChangeReceipt);
      setProposal(undefined);closeVerification();saved(confirmation.maskedIban);
    }catch(problem){
      if(problem instanceof ApiResponseError&&problem.status===409){
        setProposal(undefined);closeVerification();setError(text.stale);reload();
      }else{
        if(!verified||problem instanceof ApiResponseError&&[401,403,422].includes(problem.status))closeVerification();
        setError(verified&&problem instanceof ApiResponseError&&problem.status===403?text.expired:timetableError(locale,problem));
      }
    }finally{setBusy(false);}
  }

  return <div className="auth-form">
    <h2>{text.current}</h2>
    {settings.active?<section className="timetable-day auth-form">
      <CopyValue locale={locale} label={fields.beneficiary} value={settings.active.beneficiary}/>
      <CopyValue locale={locale} label={fields.iban} value={settings.active.iban} display={displayIban(settings.active.iban)}/>
      <ConfirmedAt locale={locale} value={settings.active.effectiveAt}/>
    </section>:<p>{text.empty}</p>}
    {error&&<p role="alert">{error}</p>}
    {proposal?<section className="notice auth-form">
      <h2>{text.review}</h2>
      <dl className="auth-form">
        <div><dt>{fields.beneficiary}</dt><dd dir="auto">{proposal.beneficiary}</dd></div>
        <div><dt>{fields.iban}</dt><dd><bdi dir="ltr">{displayIban(proposal.iban)}</bdi></dd></div>
      </dl>
      {!challenge&&!proof&&<TimetableRead locale={locale} result={factors}>{(listed)=>
        listed.some((item)=>item.status==="verified")?<div className="auth-form">
          {choices.length>1&&<label>{text.factor}<select value={selected?.id??""} disabled={busy} onChange={(event)=>setFactor(event.target.value)}>
            {choices.map((item,index)=><option key={item.id} value={item.id}>{item.friendly_name??`${text.factor} ${index+1}`}</option>)}
          </select></label>}
          <button type="button" className="primary-button" disabled={busy||!selected} onClick={()=>void begin()}>{busy?text.busy:text.confirm}</button>
        </div>:<p>{text.noFactor}</p>
      }</TimetableRead>}
      {(challenge||proof)&&<form className="auth-form" onSubmit={(event)=>void apply(event)}>
        {!proof&&<label>{text.code}<input dir="ltr" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
          disabled={busy} onChange={(event)=>setCode(event.target.value.replace(/[٠-٩]/g,(digit)=>String(digit.charCodeAt(0)-0x660)).replace(/[^0-9]/g,""))}/></label>}
        <button type="submit" className="primary-button" disabled={busy||!proof&&!/^[0-9]{6}$/.test(code)}>{busy?text.busy:proof?text.retry:text.apply}</button>
      </form>}
      <button type="button" className="plain-button" disabled={busy} onClick={()=>{setProposal(undefined);closeVerification();setError("");}}>{text.edit}</button>
    </section>:<form className="auth-form" onSubmit={(event)=>void review(event)}>
      <h2>{text.propose}</h2>
      <label>{fields.beneficiary}<input dir="auto" value={beneficiary} maxLength={140} required disabled={busy}
        onChange={(event)=>setBeneficiary(event.target.value)}/></label>
      <label>{fields.iban}<input dir="ltr" value={iban} maxLength={80} autoCapitalize="characters" required disabled={busy}
        onChange={(event)=>setIban(event.target.value)}/></label>
      <button type="submit" className="primary-button" disabled={busy||!candidate.success}>{busy?text.busy:text.review}</button>
    </form>}
  </div>;
}
