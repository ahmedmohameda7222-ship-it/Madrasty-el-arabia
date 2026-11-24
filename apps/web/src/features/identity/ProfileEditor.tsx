"use client";
import { useState,type FormEvent } from "react";
import { accountProfilePatch,accountProfileSchema,profileSavedSchema,type AccountProfile,type AccountProfilePatch,type Locale } from "@madrasty/contracts";
import { useAccountScope } from "@/ui/AccountScope";
import { useSchoolCommand } from "@/api/commands";
import { requestApi,ApiResponseError } from "@/api/client";
import { dictionary,localizedError } from "@/i18n";

const copy={
 ar:{title:"الملف الشخصي",mine:"بياناتي",children:"أبنائي",name:"الاسم",birth:"تاريخ الميلاد",phone:"رقم الهاتف",address:"عنوان المنزل للطوارئ (اختياري)",age:"العمر",years:"سنة",save:"حفظ",reload:"تحديث البيانات",invalid:"راجع البيانات المدخلة."},
 de:{title:"Profil",mine:"Meine Daten",children:"Meine Kinder",name:"Name",birth:"Geburtsdatum",phone:"Handynummer",address:"Wohnadresse für Notfälle (optional)",age:"Alter",years:"Jahre",save:"Speichern",reload:"Daten aktualisieren",invalid:"Bitte prüfen Sie die Eingaben."},
} as const;
export function ProfileEditor({locale,initial}:{locale:Locale;initial:AccountProfile}){
  const text=copy[locale],actor=useAccountScope(),command=useSchoolCommand(actor.persona);
  const [profile,setProfile]=useState(initial),[busy,setBusy]=useState(false),[version,setVersion]=useState(0);
  const [feedback,setFeedback]=useState<{error:boolean;message:string}>();
  const refresh=async()=>{const {data}=await requestApi("/account/profile",accountProfileSchema,{headers:{"X-School-Persona":actor.persona}});setProfile(data);setVersion(v=>v+1)};
  async function save(event:FormEvent<HTMLFormElement>,input:(form:FormData)=>AccountProfilePatch){
    event.preventDefault();const result=accountProfilePatch.safeParse(input(new FormData(event.currentTarget)));
    if(!result.success){setFeedback({error:true,message:text.invalid});return}
    setBusy(true);setFeedback(undefined);
    try{await command("/account/profile","PATCH",result.data,profileSavedSchema);await refresh();setFeedback({error:false,message:dictionary(locale).saved})}
    catch(error){setFeedback({error:true,message:error instanceof ApiResponseError?localizedError(locale,error.messageKey):dictionary(locale)["error.unavailable"]})}
    finally{setBusy(false)}
  }
  const optional=(form:FormData,key:string)=>String(form.get(key)??"").trim()||null;
  return <>
    <h1>{text.title}</h1>
    <section className="auth-card"><h2>{text.mine}</h2>{profile.displayName&&<p><bdi>{profile.displayName}</bdi></p>}
    {profile.guardian&&<form key={version} className="auth-form" onSubmit={e=>void save(e,f=>({kind:"guardian",revision:profile.guardian!.revision,birthDate:optional(f,"birth"),phone:optional(f,"phone"),emergencyAddress:optional(f,"address")}))}>
      <label>{text.birth}<input name="birth" type="date" min="1900-01-01" max={new Date().toISOString().slice(0,10)} defaultValue={profile.guardian.birthDate??""}/></label>
      <label>{text.phone}<input name="phone" type="tel" dir="ltr" maxLength={48} defaultValue={profile.guardian.phone??""}/></label>
      <label>{text.address}<textarea name="address" rows={2} maxLength={500} defaultValue={profile.guardian.emergencyAddress??""}/></label>
      <button className="primary-button" disabled={busy}>{text.save}</button>
    </form>}</section>
    {profile.guardian&&<section className="auth-card"><h2>{text.children}</h2>{profile.children.map(child=><form className="auth-form" key={child.id+":"+version} onSubmit={e=>void save(e,f=>({kind:"child",id:child.id,revision:child.revision,displayName:String(f.get("name")??""),birthDate:optional(f,"birth")}))}>
      <h3><bdi>{child.displayName}</bdi></h3>
      <label>{text.name}<input name="name" required maxLength={200} defaultValue={child.displayName}/></label>
      <label>{text.birth}<input name="birth" type="date" min="1900-01-01" max={new Date().toISOString().slice(0,10)} defaultValue={child.birthDate??""}/></label>
      {child.age!==null&&<p>{text.age}: {new Intl.NumberFormat(locale).format(child.age)} {text.years}</p>}
      <button className="primary-button" disabled={busy}>{text.save}</button>
    </form>)}</section>}
    {feedback&&<p role={feedback.error?"alert":"status"}>{feedback.message}</p>}
    {feedback?.error&&<button className="plain-button" disabled={busy} onClick={()=>{setBusy(true);void refresh().then(()=>setFeedback(undefined)).catch(()=>setFeedback({error:true,message:dictionary(locale)["error.unavailable"]})).finally(()=>setBusy(false))}}>{text.reload}</button>}
  </>;
}
