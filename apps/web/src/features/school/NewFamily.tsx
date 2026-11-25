"use client";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  createFamilyInput, createFamilyChildInput, createdFamilySchema, studentSchema,
  schoolClassSchema, yearSchema, familySituation, familyRelationship, type Locale, type Guardian, type Student,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { ExistingPersonPicker } from "./FamilyPeople";
import { Icon } from "@/ui/Icon";

type Classroom = z.infer<typeof schoolClassSchema>;
type Relation = z.infer<typeof familyRelationship>;
type LinkDraft = {state:"none"|"pending"|"approved";relationship:Relation};
type ChildDraft = { key:number; name:string; classId:string; birthDate:string; existingId?:string; links:Record<number,LinkDraft>; payer?:number };
type AdultDraft = {key:number;name:string;email:string;phone:string;address:string;birthDate:string;language:Locale;existingId?:string};
const yearList = yearSchema.array();
const classList = schoolClassSchema.array();
let sequence = 0;
const childDraft = (): ChildDraft => ({ key: ++sequence, name: "", classId: "", birthDate:"",links:{} });
const adultDraft=(language:Locale):AdultDraft=>({key:++sequence,name:"",email:"",phone:"",address:"",birthDate:"",language});

const copy = {
  de: {
    newFamily: "Neue Familie hinzufügen", familyDetails: "Sorgeberechtigte", second: "Weitere sorgeberechtigte Person",
    children: "Kinder", child: "Kind", another: "Weiteres Kind hinzufügen",
    name: "Name", email: "E-Mail-Adresse", phone: "Telefonnummer", language: "Sprache für Mitteilungen",
    year: "Schuljahr für die Klassenauswahl", choose: "Auswählen", classroom: "Klasse (optional)",
    noClass: "Noch keine Klasse", save: "Familie und Kinder speichern", cancel: "Abbrechen",
    saved: "Die Familie mit ihren Kindern wurde gespeichert.", addChild: "Kind zur Familie hinzufügen",
    singleHint: "Mindestens eine sorgeberechtigte Person und ein Kind sind erforderlich.",
  },
  ar: {
    newFamily: "إضافة أسرة جديدة", familyDetails: "أولياء الأمور", second: "إضافة ولي أمر ثانٍ",
    children: "الأطفال", child: "طفل", another: "إضافة طفل آخر",
    name: "الاسم", email: "البريد الإلكتروني", phone: "رقم الهاتف", language: "لغة التواصل",
    year: "السنة الدراسية لاختيار الفصل", choose: "اختر", classroom: "الفصل (اختياري)",
    noClass: "بدون فصل حاليًا", save: "حفظ الأسرة والأطفال", cancel: "إلغاء",
    saved: "تم حفظ الأسرة والأطفال.", addChild: "إضافة طفل للأسرة",
    singleHint: "لازم ولي أمر واحد وطفل واحد على الأقل.",
  },
} as const;

export function useClasses(locale: Locale) {
  const [years, setYears] = useState<z.infer<typeof yearList>>([]);
  const [yearId, setYearId] = useState("");
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    const ctrl = new AbortController();
    requestApi("/school/years", yearList, { signal: ctrl.signal }).then(({data}) => setYears(data))
      .catch((error) => { if (!ctrl.signal.aborted) setProblem(message(locale, error)); });
    return () => ctrl.abort();
  }, [locale]);
  useEffect(() => {
    if (!yearId) return;
    const ctrl = new AbortController();
    requestApi(`/school/classes?yearId=${encodeURIComponent(yearId)}&limit=100`, classList, { signal: ctrl.signal })
      .then(({data}) => setClasses(data))
      .catch((error) => { if (!ctrl.signal.aborted) setProblem(message(locale, error)); });
    return () => ctrl.abort();
  }, [yearId, locale]);
  const chooseYear = (id: string) => { setYearId(id); setClasses([]); };
  return {years, yearId, classes, problem, chooseYear};
}
const message=(locale:Locale,error:unknown)=>error instanceof ApiResponseError ? localizedError(locale,error.messageKey):dictionary(locale)["error.unavailable"];

export function YearPicker({locale,value,options,onChange}:{locale:Locale;value:string;options:z.infer<typeof yearList>;onChange:(v:string)=>void}) {
  const t=copy[locale];
  return <label>{t.year}<select value={value} onChange={e=>onChange(e.target.value)}>
    <option value="">{t.choose}</option>{options.filter(y=>y.state!=="closed").map(y=><option key={y.id} value={y.id}>{y.startsOn} – {y.endsExclusive}</option>)}
  </select></label>;
}
export function ClassPicker({locale,classes,value,onChange,disabled}:{locale:Locale;classes:Classroom[];value:string;onChange:(v:string)=>void;disabled:boolean}) {
  const t=copy[locale];
  return <label>{t.classroom}<select value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}>
    <option value="">{t.noClass}</option>
    {classes.map(item=><option value={item.id} key={item.id}>{item.code} · {locale==="ar"?item.nameAr:item.nameDe}</option>)}
  </select></label>;
}

export const situationNames={de:{unknown:"Keine Angabe",together:"Zusammenlebend",separated:"Getrennt lebend",divorced:"Geschieden",single:"Alleinerziehend",other:"Andere Situation"},ar:{unknown:"بدون تحديد",together:"يعيشان معًا",separated:"منفصلان",divorced:"مطلقان",single:"ولي أمر واحد",other:"وضع آخر"}} as const;
export const relationNames={de:{unspecified:"Keine Angabe",father:"Vater",mother:"Mutter",legal:"Gesetzliche Vertretung",other:"Andere Bezugsperson"},ar:{unspecified:"بدون تحديد",father:"الأب",mother:"الأم",legal:"الوصي القانوني",other:"شخص مسؤول آخر"}} as const;
const wizardCopy={
 de:{family:"Familienname",situation:"Familiensituation (optional)",privacy:"Die Familiensituation ändert keine Zugriffsrechte. Nur berechtigte Schulverwaltung sieht diese Angabe.",steps:["Familie","Sorgeberechtigte","Kinder","Zuordnung","Prüfen"],next:"Weiter",back:"Zurück",birth:"Geburtsdatum (optional)",address:"Notfalladresse (optional)",existing:"Vorhandene Person wählen",newPerson:"Neue Person",remove:"Entfernen",adult:"Person",link:"Zugang zum Kind",none:"Nicht neu verknüpfen",pending:"Zur Prüfung",approved:"Bestätigter Zugang",relation:"Beziehung zum Kind",linkHelp:"Nur ausdrücklich bestätigte Verknüpfungen erlauben den Zugriff auf Kinderdaten. Bestehende Rechte werden hier nicht widerrufen.",payer:"Zahlungsverantwortung",later:"Später festlegen",payerHelp:"Zahler können später in den Buchhaltungseinstellungen geändert werden. Für neue Kinder gilt die Auswahl ab dem aktuellen Schulmonat.",invalidLink:"Bitte bestätigen Sie mindestens eine berechtigte Person pro Kind und wählen Sie die Beziehung.",invalidPerson:"Bitte prüfen Sie Namen, E-Mail-Adressen und doppelte Personen.",review:"Bitte prüfen Sie die Namen, Klassen und Zugriffsrechte.",confirm:"Ich habe die Angaben und Berechtigungen geprüft.",noInvite:"Einladungen werden nicht automatisch versendet. Sie können sie nach dem Speichern vorbereiten.",existingHint:"Ein vorhandener Datensatz wird verwendet, nicht überschrieben.",emailOptional:"E-Mail-Adresse (für ein Konto erforderlich)",count:"Schritt",selected:"Ausgewählt",create:"Weitere Person hinzufügen"},
 ar:{family:"اسم الأسرة",situation:"الوضع الأسري (اختياري)",privacy:"الوضع الأسري لا يغيّر صلاحيات الوصول. يراه فقط مسؤولو شؤون الطلاب المصرح لهم.",steps:["الأسرة","أولياء الأمور","الأطفال","الروابط","المراجعة"],next:"التالي",back:"السابق",birth:"تاريخ الميلاد (اختياري)",address:"عنوان الطوارئ (اختياري)",existing:"اختيار شخص موجود",newPerson:"شخص جديد",remove:"إزالة",adult:"ولي أمر",link:"الوصول إلى بيانات الطفل",none:"عدم إنشاء رابط جديد",pending:"بانتظار المراجعة",approved:"وصول معتمد",relation:"العلاقة بالطفل",linkHelp:"فقط الروابط المعتمدة صراحةً تسمح بالوصول إلى بيانات الطفل. الصلاحيات الحالية لا تُلغى هنا.",payer:"مسؤول السداد",later:"تحديد لاحقًا",payerHelp:"يمكن تغيير مسؤول السداد لاحقًا من إعدادات الحسابات. اختيار الطفل الجديد يبدأ من شهر المدرسة الحالي.",invalidLink:"اعتمد ولي أمر واحدًا على الأقل لكل طفل وحدد العلاقة.",invalidPerson:"راجع الأسماء والبريد الإلكتروني وتكرار الأشخاص.",review:"راجع الأسماء والفصول وصلاحيات الوصول.",confirm:"راجعت البيانات والصلاحيات.",noInvite:"لن تُرسل الدعوات تلقائيًا. يمكنك تجهيزها بعد الحفظ.",existingHint:"سيُستخدم السجل الموجود دون استبدال بياناته.",emailOptional:"البريد الإلكتروني (مطلوب للحساب)",count:"الخطوة",selected:"تم الاختيار",create:"إضافة ولي أمر آخر"},
} as const;
export function NewFamilyForm({locale,saved,cancel,financeIssue=false}:{locale:Locale;saved:(guardianId:string,familyId?:string)=>void;cancel:()=>void;financeIssue?:boolean}){
 const t=copy[locale],w=wizardCopy[locale],command=useAdminCommand(),school=useClasses(locale);
 const [step,setStep]=useState(0),[familyName,setFamilyName]=useState(""),[situation,setSituation]=useState<z.infer<typeof familySituation>>("unknown");
 const [adults,setAdults]=useState<AdultDraft[]>(()=>[adultDraft(locale)]),[children,setChildren]=useState<ChildDraft[]>(()=>[childDraft()]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[confirmed,setConfirmed]=useState(false);
 const [picker,setPicker]=useState<{kind:"guardian"|"student";key:number}>();
 const updateAdult=(key:number,patch:Partial<AdultDraft>)=>setAdults(rows=>rows.map(row=>row.key===key?{...row,...patch}:row));
 const updateChild=(key:number,patch:Partial<ChildDraft>)=>setChildren(rows=>rows.map(row=>row.key===key?{...row,...patch}:row));
 const removeAdult=(key:number)=>{setAdults(rows=>rows.filter(r=>r.key!==key));setChildren(rows=>rows.map(c=>{const links={...c.links};delete links[key];return {...c,links,payer:c.payer===key?undefined:c.payer};}));};
 const choose=(person:Student|Guardian)=>{
   if(!picker)return;
   if(picker.kind==="guardian"&&"contactEmail" in person)updateAdult(picker.key,{existingId:person.id,name:person.displayName,email:person.contactEmail??"",phone:person.contactPhone??"",language:person.correspondenceLocale,birthDate:"",address:""});
   if(picker.kind==="student"&&"studentNumber" in person)updateChild(picker.key,{existingId:person.id,name:person.displayName,classId:"",birthDate:"",payer:undefined,links:{}});
   setPicker(undefined);
 };
 const linkOf=(c:ChildDraft,a:AdultDraft):LinkDraft=>c.links[a.key]??{state:"none",relationship:"unspecified"};
 const updateLink=(c:ChildDraft,a:AdultDraft,patch:Partial<LinkDraft>)=>{
   const link={...linkOf(c,a),...patch};updateChild(c.key,{links:{...c.links,[a.key]:link},payer:c.payer===a.key&&link.state!=="approved"?undefined:c.payer});
 };
 const input=()=>createFamilyInput.safeParse({displayName:familyName,situation,
   guardians:adults.map(a=>({displayName:a.name,contactEmail:a.email.trim()||null,contactPhone:a.phone.trim()||null,correspondenceLocale:a.language,existingId:a.existingId,birthDate:a.existingId?undefined:a.birthDate||null,emergencyAddress:a.existingId?undefined:a.address.trim()||null})),
   children:children.map(c=>({displayName:c.name,existingId:c.existingId,classId:c.existingId?undefined:c.classId||null,birthDate:c.existingId?undefined:c.birthDate||null,
    guardianLinks:adults.flatMap((a,i)=>{const l=linkOf(c,a);return l.state==="none"?[]:[{guardianIndex:i,relationship:l.relationship,approved:l.state==="approved"}];}),
    payerGuardianIndex:financeIssue&&!c.existingId&&c.payer!==undefined?adults.findIndex(a=>a.key===c.payer):undefined}))});
 const submit=async(event:FormEvent<HTMLFormElement>)=>{
   event.preventDefault();setError("");setPicker(undefined);
   if(step===1){const emails=adults.map(a=>a.email.trim().toLowerCase()).filter(Boolean);if(new Set(emails).size!==emails.length||adults.some(a=>!a.name.trim())){setError(w.invalidPerson);return;}}
   if(step===3){if(children.some(c=>!adults.some(a=>linkOf(c,a).state==="approved")||adults.some(a=>linkOf(c,a).state!=="none"&&linkOf(c,a).relationship==="unspecified"))){setError(w.invalidLink);return;}}
   if(step<4){setStep(s=>s+1);setConfirmed(false);return;}
   const parsed=input();if(!parsed.success){setError(dictionary(locale)["error.validation"]);return;}
   if(!confirmed||busy)return;setBusy(true);
   try{const response=await command("/school/families","POST",parsed.data,createdFamilySchema);saved(response.guardianIds[0],response.familyId);}catch(err){setError(message(locale,err));}finally{setBusy(false);}
 };
 return <section className="family-wizard auth-card" aria-labelledby="family-wizard-title">
  <h1 id="family-wizard-title">{t.newFamily}</h1>
  <p className="family-step-caption">{w.count} {step+1} / 5 · {w.steps[step]}</p>
  <ol className="family-step-track" aria-label={w.count}>{w.steps.map((label,i)=><li key={label} data-current={i===step} data-done={i<step} aria-current={i===step?"step":undefined}><span>{i+1}</span><small>{label}</small></li>)}</ol>
  <form className="auth-form" onSubmit={submit} aria-busy={busy}>
  {step===0&&<>
   <label>{w.family}<input autoComplete="off" value={familyName} required maxLength={200} onChange={e=>setFamilyName(e.target.value)}/></label>
   <label>{w.situation}<select value={situation} onChange={e=>setSituation(familySituation.parse(e.target.value))}>{familySituation.options.map(v=><option key={v} value={v}>{situationNames[locale][v]}</option>)}</select></label>
   <p className="family-hint">{w.privacy}</p>
  </>}
  {step===1&&<>
   {adults.map((adult,i)=><fieldset className="family-fieldset auth-form" key={adult.key}>
    <legend>{w.adult} {i+1}</legend>
    <div className="family-mode-row"><button type="button" className="plain-button" onClick={()=>setPicker({kind:"guardian",key:adult.key})}>{w.existing}</button>
      {adult.existingId&&<button type="button" className="plain-button" onClick={()=>updateAdult(adult.key,{...adultDraft(locale),key:adult.key,existingId:undefined})}>{w.newPerson}</button>}</div>
    {picker?.kind==="guardian"&&picker.key===adult.key&&<ExistingPersonPicker locale={locale} kind="guardian" exclude={adults.flatMap(a=>a.existingId?[a.existingId]:[])} select={choose}/>}
    {adult.existingId?<p className="family-hint"><bdi>{adult.name}</bdi> · {w.existingHint}</p>:<>
     <label>{t.name}<input name={"guardian"+(i+1)+"Name"} value={adult.name} required maxLength={200} onChange={e=>updateAdult(adult.key,{name:e.target.value})}/></label>
     <label>{w.emailOptional}<input name={"guardian"+(i+1)+"Email"} type="email" dir="ltr" value={adult.email} onChange={e=>updateAdult(adult.key,{email:e.target.value})}/></label>
     <label>{t.phone}<input type="tel" dir="ltr" value={adult.phone} maxLength={48} onChange={e=>updateAdult(adult.key,{phone:e.target.value})}/></label>
     <label>{w.birth}<input type="date" min="1900-01-01" max={new Date().toISOString().slice(0,10)} value={adult.birthDate} onChange={e=>updateAdult(adult.key,{birthDate:e.target.value})}/></label>
     <label>{w.address}<textarea value={adult.address} maxLength={500} onChange={e=>updateAdult(adult.key,{address:e.target.value})}/></label>
     <label>{t.language}<select value={adult.language} onChange={e=>updateAdult(adult.key,{language:e.target.value as Locale})}><option value="ar">العربية</option><option value="de">Deutsch</option></select></label>
    </>}
    {adults.length>1&&<button type="button" className="plain-button" onClick={()=>removeAdult(adult.key)}>{w.remove} · {w.adult} {i+1}</button>}
   </fieldset>)}
   {adults.length<8&&<button type="button" className="plain-button" onClick={()=>setAdults(rows=>[...rows,adultDraft(locale)])}><Icon name="plus"/>{w.create}</button>}
  </>}
  {step===2&&<>
    <YearPicker locale={locale} value={school.yearId} options={school.years} onChange={id=>{school.chooseYear(id);setChildren(rows=>rows.map(c=>({...c,classId:""})));}}/>
    {children.map((child,i)=><fieldset className="family-fieldset auth-form" key={child.key}>
      <legend>{t.child} {i+1}</legend>
      <div className="family-mode-row"><button type="button" className="plain-button" onClick={()=>setPicker({kind:"student",key:child.key})}>{w.existing}</button>
      {child.existingId&&<button type="button" className="plain-button" onClick={()=>updateChild(child.key,{name:"",existingId:undefined,classId:"",birthDate:"",links:{}})}>{w.newPerson}</button>}</div>
      {picker?.kind==="student"&&picker.key===child.key&&<ExistingPersonPicker locale={locale} kind="student" exclude={children.flatMap(c=>c.existingId?[c.existingId]:[])} select={choose}/>}
      {child.existingId?<p className="family-hint"><bdi>{child.name}</bdi> · {w.existingHint}</p>:<>
        <label>{t.name}<input value={child.name} required maxLength={200} onChange={e=>updateChild(child.key,{name:e.target.value})}/></label>
        <label>{w.birth}<input type="date" min="1900-01-01" max={new Date().toISOString().slice(0,10)} value={child.birthDate} onChange={e=>updateChild(child.key,{birthDate:e.target.value})}/></label>
        <ClassPicker locale={locale} classes={school.classes} disabled={!school.yearId} value={child.classId} onChange={v=>updateChild(child.key,{classId:v})}/>
      </>}
      {children.length>1&&<button type="button" className="plain-button" onClick={()=>setChildren(rows=>rows.filter(c=>c.key!==child.key))}>{w.remove} · {t.child} {i+1}</button>}
    </fieldset>)}
    {children.length<25&&<button type="button" className="plain-button" onClick={()=>setChildren(rows=>[...rows,childDraft()])}><Icon name="plus"/>{t.another}</button>}
  </>}
  {step===3&&<>
   <p className="family-hint">{w.linkHelp}</p>
   {children.map(child=><fieldset className="auth-form family-fieldset" key={child.key}><legend><bdi>{child.name}</bdi></legend>
    {adults.map(adult=>{const link=linkOf(child,adult);return <div className="family-link-options" key={adult.key}><strong><bdi>{adult.name}</bdi></strong>
      <label>{w.link}<select value={link.state} onChange={e=>updateLink(child,adult,{state:e.target.value as LinkDraft["state"]})}><option value="none">{w.none}</option><option value="pending">{w.pending}</option><option value="approved">{w.approved}</option></select></label>
      {link.state!=="none"&&<label>{w.relation}<select value={link.relationship} onChange={e=>updateLink(child,adult,{relationship:familyRelationship.parse(e.target.value)})}>{familyRelationship.options.map(r=><option key={r} value={r}>{relationNames[locale][r]}</option>)}</select></label>}
    </div>;})}
    {financeIssue&&!child.existingId&&<><label>{w.payer}<select value={child.payer??""} onChange={e=>updateChild(child.key,{payer:e.target.value?Number(e.target.value):undefined})}><option value="">{w.later}</option>{adults.filter(a=>linkOf(child,a).state==="approved").map(a=><option key={a.key} value={a.key}>{a.name}</option>)}</select></label><small>{w.payerHelp}</small></>}
   </fieldset>)}
  </>}
  {step===4&&<>
    <h2><bdi>{familyName}</bdi></h2><p className="family-hint">{w.review}</p>
    {children.map(child=><div key={child.key} className="family-review-card"><strong><bdi>{child.name}</bdi></strong><small>{child.existingId?w.selected:(school.classes.find(c=>c.id===child.classId)?.[locale==="ar"?"nameAr":"nameDe"]??t.noClass)}</small>
      {adults.map(adult=>{const l=linkOf(child,adult);return <div key={adult.key} className="family-review-line"><bdi>{adult.name}</bdi><span>{l.state==="none"?w.none:(relationNames[locale][l.relationship]+" · "+w[l.state])}{child.payer===adult.key?" · "+w.payer:""}</span></div>;})}</div>)}
    <p className="family-hint">{w.noInvite}</p><label className="access-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{w.confirm}</label>
  </>}
  {school.problem&&step===2&&<p role="alert">{school.problem}</p>}{error&&<p role="alert">{error}</p>}
  <div className="family-wizard-actions"><button className="plain-button" type="button" disabled={busy} onClick={()=>{setPicker(undefined);setError("");if(step===0)cancel();else setStep(s=>s-1);}}>{step===0?t.cancel:w.back}</button>
  <button className="primary-button" disabled={busy||(step===4&&!confirmed)}>{step===4?t.save:w.next}</button></div>
  </form>
 </section>;
}

export function AddFamilyChildForm({locale,guardianId,saved}:{locale:Locale;guardianId:string;saved:()=>void}) {
  const t=copy[locale], command=useAdminCommand(),school=useClasses(locale);
  const [name,setName]=useState(""),[classId,setClassId]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const validated=createFamilyChildInput.safeParse({displayName:name,classId:classId||null});
    if(!validated.success){setError(dictionary(locale)["error.validation"]);return;}
    setBusy(true);setError("");
    void command(`/school/families/${guardianId}/children`,"POST",validated.data,studentSchema)
      .then(()=>{setName("");setClassId("");saved();})
      .catch(err=>setError(message(locale,err))).finally(()=>setBusy(false));
  };
  return <form className="auth-form" onSubmit={submit}>
    <h3>{t.addChild}</h3>
    <label>{t.name}<input value={name} required maxLength={200} onChange={e=>setName(e.target.value)}/></label>
    <YearPicker locale={locale} value={school.yearId} options={school.years}
      onChange={id=>{school.chooseYear(id);setClassId("");}}/>
    <ClassPicker locale={locale} classes={school.classes} disabled={!school.yearId} value={classId} onChange={setClassId}/>
    {school.problem&&<p role="alert">{school.problem}</p>}
    {error&&<p role="alert">{error}</p>}
    <button className="primary-button" disabled={busy}>{t.addChild}</button>
  </form>;
}
