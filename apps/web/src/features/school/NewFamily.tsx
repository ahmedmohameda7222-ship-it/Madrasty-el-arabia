"use client";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  createFamilyInput, createFamilyChildInput, createdFamilySchema, studentSchema,
  schoolClassSchema, yearSchema, type Locale,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";

type Classroom = z.infer<typeof schoolClassSchema>;
type ChildDraft = { key: number; name: string; classId: string };
const yearList = yearSchema.array();
const classList = schoolClassSchema.array();
let sequence = 0;
const childDraft = (): ChildDraft => ({ key: ++sequence, name: "", classId: "" });

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

function useClasses(locale: Locale) {
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

function YearPicker({locale,value,options,onChange}:{locale:Locale;value:string;options:z.infer<typeof yearList>;onChange:(v:string)=>void}) {
  const t=copy[locale];
  return <label>{t.year}<select value={value} onChange={e=>onChange(e.target.value)}>
    <option value="">{t.choose}</option>{options.filter(y=>y.state!=="closed").map(y=><option key={y.id} value={y.id}>{y.startsOn} – {y.endsExclusive}</option>)}
  </select></label>;
}
function ClassPicker({locale,classes,value,onChange,disabled}:{locale:Locale;classes:Classroom[];value:string;onChange:(v:string)=>void;disabled:boolean}) {
  const t=copy[locale];
  return <label>{t.classroom}<select value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}>
    <option value="">{t.noClass}</option>
    {classes.map(item=><option value={item.id} key={item.id}>{item.code} · {locale==="ar"?item.nameAr:item.nameDe}</option>)}
  </select></label>;
}
function GuardianInputs({locale,prefix,required=false}:{locale:Locale;prefix:string;required?:boolean}) {
  const t=copy[locale];
  return <>
    <label>{t.name}<input name={prefix+"Name"} required={required} maxLength={200}/></label>
    <label>{t.email}<input name={prefix+"Email"} type="email" dir="ltr" required={required}/></label>
    <label>{t.phone}<input name={prefix+"Phone"} type="tel" dir="ltr" maxLength={48}/></label>
    <label>{t.language}<select name={prefix+"Locale"} defaultValue={locale}>
      <option value="ar">العربية</option><option value="de">Deutsch</option>
    </select></label>
  </>;
}
function parseAdult(form:FormData,prefix:string) {
  return {
    displayName: form.get(prefix+"Name"),
    contactEmail: form.get(prefix+"Email") || null,
    contactPhone: form.get(prefix+"Phone") || null,
    correspondenceLocale: form.get(prefix+"Locale"),
  };
}
export function NewFamilyForm({locale,saved,cancel}:{locale:Locale;saved:(id:string)=>void;cancel:()=>void}) {
  const t=copy[locale], command=useAdminCommand();
  const [second,setSecond]=useState(false);
  const [children,setChildren]=useState<ChildDraft[]>(()=>[childDraft()]);
  const school=useClasses(locale);
  const [busy,setBusy]=useState(false), [error,setError]=useState("");
  const changeChild=(key:number,field:"name"|"classId",value:string)=>
    setChildren(prev=>prev.map(child=>child.key===key?{...child,[field]:value}:child));
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const parsed=createFamilyInput.safeParse({
      guardians:[parseAdult(form,"guardian1"),...(second?[parseAdult(form,"guardian2")]:[])],
      children: children.map(child=>({displayName:child.name,classId:child.classId||null})),
    });
    if(!parsed.success){setError(dictionary(locale)["error.validation"]);return;}
    setBusy(true);setError("");
    void command("/school/families","POST",parsed.data,createdFamilySchema)
      .then(response=>saved(response.guardianIds[0]))
      .catch(err=>setError(message(locale,err))).finally(()=>setBusy(false));
  };
  return <section className="auth-card">
    <h2>{t.newFamily}</h2>
    <p>{t.singleHint}</p>
    <form className="auth-form" onSubmit={submit}>
      <h3>{t.familyDetails}</h3>
      <GuardianInputs locale={locale} prefix="guardian1" required/>
      <label className="access-check">
        <input type="checkbox" checked={second} onChange={e=>setSecond(e.target.checked)}/>{t.second}
      </label>
      {second&&<GuardianInputs locale={locale} prefix="guardian2" required/>}
      <h3>{t.children}</h3>
      <YearPicker locale={locale} value={school.yearId} options={school.years}
        onChange={id=>{school.chooseYear(id);setChildren(prev=>prev.map(child=>({...child,classId:""})));}}/>
      {children.map((child,index)=><fieldset key={child.key} className="auth-form">
        <legend>{t.child} {index+1}</legend>
        <label>{t.name}<input required maxLength={200} value={child.name} onChange={e=>changeChild(child.key,"name",e.target.value)}/></label>
        <ClassPicker locale={locale} classes={school.classes} disabled={!school.yearId}
          value={child.classId} onChange={v=>changeChild(child.key,"classId",v)}/>
        {children.length>1&&<button type="button" className="plain-button"
          onClick={()=>setChildren(prev=>prev.filter(c=>c.key!==child.key))}>{t.cancel} · {t.child} {index+1}</button>}
      </fieldset>)}
      <button type="button" className="plain-button" onClick={()=>setChildren(prev=>[...prev,childDraft()])}>{t.another}</button>
      {school.problem&&<p role="alert">{school.problem}</p>}
      {error&&<p role="alert">{error}</p>}
      <button className="primary-button" disabled={busy}>{t.save}</button>
      <button type="button" className="plain-button" disabled={busy} onClick={cancel}>{t.cancel}</button>
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
