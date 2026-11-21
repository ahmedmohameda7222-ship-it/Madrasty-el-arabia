"use client";

import {useState} from "react";
import {deliveryKind,deliveryReceipt,deliveryState,deliveryStatusItem,type Locale} from "@madrasty/contracts";
import type {z} from "zod";
import {useSchoolCommand} from "@/api/commands";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {timetableError} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";

const copy={
  ar:{title:"حالة التوصيل",channel:"القناة",email:"البريد الإلكتروني",push:"إشعارات الجهاز",kind:"النوع",state:"الحالة",all:"الكل",updated:"آخر تحديث",
    attempts:"المحاولات",due:"موعد المحاولة",refresh:"تحديث",redrive:"إعادة للطابور",queuedAgain:"اتسجّلت محاولة جديدة.",
    invite_guardian:"دعوات الأسر",invite_teacher:"دعوات المدرسين",broadcast:"إعلانات المدرسة",attendance:"الحضور",academics:"الشؤون الأكاديمية",
    finance:"الحسابات",school:"تحديثات المدرسة",queued:"في الطابور",accepted:"قبله المزوّد",delivered:"اتسلّم",failed:"تعذّر التوصيل",
    bounced:"ارتدّ البريد",uncertain:"في انتظار تأكيد المزوّد",suppressed:"اتوقف التوصيل"},
  de:{title:"Zustellstatus",channel:"Kanal",email:"E-Mail",push:"Gerätebenachrichtigung",kind:"Typ",state:"Status",all:"Alle",updated:"Zuletzt aktualisiert",
    attempts:"Versuche",due:"Nächster Versuch",refresh:"Aktualisieren",redrive:"Erneut einreihen",queuedAgain:"Ein neuer Versuch wurde eingeplant.",
    invite_guardian:"Einladungen für Familien",invite_teacher:"Einladungen für Lehrkräfte",broadcast:"Schulmitteilungen",attendance:"Anwesenheit",
    academics:"Unterricht und Ergebnisse",finance:"Buchhaltung",school:"Neuigkeiten der Schule",queued:"In der Warteschlange",accepted:"Vom Anbieter angenommen",
    delivered:"Zugestellt",failed:"Zustellung fehlgeschlagen",bounced:"E-Mail unzustellbar",uncertain:"Bestätigung des Anbieters steht aus",
    suppressed:"Zustellung unterdrückt"},
} as const;
const rows=deliveryStatusItem.array();
type Delivery=z.infer<typeof deliveryStatusItem>;

export function DeliveryStatus({locale,job}:{locale:Locale;job?:string}){
  const text=copy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona);
  const [kind,setKind]=useState(""),[state,setState]=useState(""),[refresh,setRefresh]=useState(0);
  const [busy,setBusy]=useState<string>(),[error,setError]=useState(""),[ack,setAck]=useState(false);
  const selectedKind=deliveryKind.safeParse(kind),selectedState=deliveryState.safeParse(state);
  const path=`/delivery-status?limit=30${job?"&id="+job:""}${selectedKind.success?"&kind="+selectedKind.data:""}${selectedState.success?"&state="+selectedState.data:""}` as const;
  const page=useAcademicPage(path,rows,refresh);
  const time=(value:string)=>new Date(value).toLocaleString(locale==="de"?"de-DE":"ar");
  const number=new Intl.NumberFormat(locale);

  async function retry(item:Delivery){
    if(busy||!item.canRedrive)return;
    setBusy(item.id);setError("");setAck(false);
    try{
      await command(`/delivery-status/${item.id}/redrive`,"POST",{revision:item.revision},deliveryReceipt);
      setAck(true);setRefresh((value)=>value+1);
    }catch(problem){setError(timetableError(locale,problem));setRefresh((value)=>value+1);}
    finally{setBusy(undefined);}
  }
  return <section className="auth-card auth-form">
    <h1>{text.title}</h1>
    <div className="header-actions">
      <label>{text.kind}<select value={kind} onChange={(event)=>setKind(event.target.value)}>
        <option value="">{text.all}</option>
        {deliveryKind.options.map((option)=><option key={option} value={option}>{text[option]}</option>)}
      </select></label>
      <label>{text.state}<select value={state} onChange={(event)=>setState(event.target.value)}>
        <option value="">{text.all}</option>
        {deliveryState.options.map((option)=><option key={option} value={option}>{text[option]}</option>)}
      </select></label>
      <button className="plain-button" type="button" onClick={()=>setRefresh((value)=>value+1)}>{text.refresh}</button>
    </div>
    {ack&&<p role="status">{text.queuedAgain}</p>}
    {error&&<p role="alert">{error}</p>}
    <AcademicPageItems locale={locale} page={page}>{(entries)=><ul className="group-list">
      {entries.map((item)=><li className="timetable-day auth-form" key={item.id}>
        <h2>{text[item.kind]}</h2>
        <p>{text[item.channel]} · {text[item.state]}</p>
        <small>{text.attempts} · {number.format(item.attempts)}</small>
        <small>{text.updated} · <bdi>{time(item.updatedAt)}</bdi></small>
        {item.state==="queued"&&<small>{text.due} · <bdi>{time(item.dueAt)}</bdi></small>}
        {item.canRedrive&&<button type="button" className="plain-button" disabled={!!busy} onClick={()=>void retry(item)}>{text.redrive}</button>}
      </li>)}
    </ul>}</AcademicPageItems>
  </section>;
}
