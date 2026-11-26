"use client";
import { useEffect,useState, type FormEvent } from "react";
import { invitationSchema, type Invitation, type Locale } from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
const list = invitationSchema.array();
const wording = {
  ar:{title:"حساب ولي الأمر",active:"الحساب مفعل",activated:"الحساب مفعل",notInvited:"لم تُرسل دعوة بعد",pending:"دعوة بانتظار التفعيل",
    expired:"انتهت الدعوة",replaced:"تم استبدال الدعوة",revoked:"دعوة ملغاة",send:"إرسال دعوة",
    reissue:"إعادة إصدار الدعوة",correct:"تصحيح البريد (اختياري)",save:"تأكيد",noEmail:"يجب تسجيل البريد أولًا."},
  de:{title:"Elternzugang",active:"Konto aktiviert",activated:"Konto aktiviert",notInvited:"Noch keine Einladung",pending:"Einladung ausstehend",
    expired:"Einladung abgelaufen",replaced:"Einladung ersetzt",revoked:"Einladung widerrufen",
    send:"Einladung senden",reissue:"Einladung neu ausstellen",
    correct:"Korrigierte E-Mail (optional)",save:"Bestätigen",noEmail:"Bitte zuerst eine E-Mail-Adresse hinterlegen."},
} as const;
const message=(locale:Locale,e:unknown)=>e instanceof ApiResponseError?localizedError(locale,e.messageKey):dictionary(locale)["error.unavailable"];
export function GuardianInviteManager({locale,id,correspondenceLocale,linkedAccount}:{
  locale:Locale;id:string;correspondenceLocale:Locale;linkedAccount:boolean;
}) {
  const w=wording[locale], command=useAdminCommand();
  const [rows,setRows]=useState<Invitation[]>([]);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[problem,setProblem]=useState("");
  const [reissue,setReissue]=useState(false),[generation,setGeneration]=useState(0);
  useEffect(()=>{
    const ctrl=new AbortController();
    requestApi(`/school/guardians/${id}/invitations`,list,{signal:ctrl.signal})
      .then(({data})=>{setRows(data);setLoading(false);})
      .catch(err=>{if(!ctrl.signal.aborted){setProblem(message(locale,err));setLoading(false);}});
    return ()=>ctrl.abort();
  },[id,generation]);
  const latest=rows[0];
  const run=(promise:()=>Promise<unknown>)=>{
    setBusy(true);setProblem("");
    void promise().then(()=>{setReissue(false);setGeneration(g=>g+1);})
      .catch(err=>setProblem(message(locale,err))).finally(()=>setBusy(false));
  };
  const start=()=>run(()=>command("/invitations","POST",{
    recipientId:id,kind:"guardian",locale:correspondenceLocale,
  },invitationSchema));
  const resend=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(!latest)return;
    const email=new FormData(e.currentTarget).get("email");
    run(()=>command(`/invitations/${latest.id}/reissue`,"POST",{
      revision:latest.revision,...(email?{correctedEmail:email}:{}),
    },invitationSchema));
  };
  const status=linkedAccount?w.active:!latest?w.notInvited:w[latest.validity];
  return <section className="auth-form">
    <h4>{w.title}</h4>
    {loading?<p role="status">{dictionary(locale).loading}</p>:<p>{status}</p>}
    {!loading&&!linkedAccount&&!latest&&<button type="button" className="plain-button" disabled={busy} onClick={start}>{w.send}</button>}
    {!loading&&!linkedAccount&&latest&&["expired","pending"].includes(latest.validity)&&
      <button type="button" className="plain-button" disabled={busy} onClick={()=>setReissue(v=>!v)}>{w.reissue}</button>}
    {reissue&&latest&&<form className="auth-form" onSubmit={resend}>
      <label>{w.correct}<input name="email" type="email" dir="ltr"/></label>
      <button className="primary-button" disabled={busy}>{w.save}</button>
    </form>}
    {problem&&<p role="alert">{problem}</p>}
  </section>;
}
