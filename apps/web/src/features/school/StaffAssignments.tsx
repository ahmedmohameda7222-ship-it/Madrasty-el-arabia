"use client";

import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  assignmentActions, assignmentSchema, assignmentWithSubstitutesSchema, schoolClassSchema, staffAccountSchema,
  staffRoleSchema, staffSchema, subjectSchema, substituteSchema, teachingViewSchema, yearSchema,
  type Locale, type StaffProfile,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";
import { AsyncSurface } from "@/ui/AsyncSurface";
import { DirectStaffForm } from "./DirectStaffForm";

const words = {
  ar: { title:"المدرسون والإدارة", profiles:"المدرسون والإدارة", assignments:"تكليفات الفصول", newProfile:"إضافة مدرس", newAssignment:"إضافة تكليف",
    choose:"اختر", name:"الاسم المهني", role:"الدور المهني", teacher:"مدرس", admin:"إدارة", principal:"مدير", deputy:"وكيل", office:"موظف مكتب",
    titleAr:"المسمى بالعربية", titleDe:"المسمى بالألمانية", email:"بريد العمل", phone:"هاتف العمل", account:"حساب المدرسة", noAccount:"بدون ربط",
    from:"بداية السريان", until:"تاريخ الانتهاء (غير مشمول)", save:"حفظ", class:"الفصل", year:"السنة الدراسية", kind:"نوع التكليف",
    primary:"مسؤول الحضور", subject:"مدرس مادة", course:"المادة", staff:"الموظف المكلّف", caps:"صلاحيات التكليف",
    replace:"استبدال المكلّف", end:"تعديل الانتهاء", revoke:"إلغاء التكليف", substitute:"تكليف بديل", substitutes:"البدلاء",
    active:"ساري", ended:"ملغى", overview:"تكليفاتي", search:"بحث باسم الموظف", more:"عرض المزيد",
  },
  de: { title:"Lehrkräfte und Verwaltung", profiles:"Lehrkräfte und Admins", assignments:"Klasseneinsätze", newProfile:"Lehrkraft hinzufügen", newAssignment:"Einsatz hinzufügen",
    choose:"Auswählen", name:"Dienstlicher Name", role:"Dienstliche Rolle", teacher:"Lehrkraft", admin:"Admin", principal:"Schulleitung", deputy:"Stellvertretung", office:"Schulbüro",
    titleAr:"Funktion auf Arabisch", titleDe:"Funktion auf Deutsch", email:"Dienstliche E-Mail", phone:"Diensttelefon", account:"Schulkonto", noAccount:"Ohne Verknüpfung",
    from:"Gültig ab", until:"Gültig bis (ausschließlich)", save:"Speichern", class:"Klasse", year:"Schuljahr", kind:"Aufgabe",
    primary:"Anwesenheitsverantwortung", subject:"Fachunterricht", course:"Fach", staff:"Beauftragte Person", caps:"Berechtigungen",
    replace:"Person ablösen", end:"Ende ändern", revoke:"Einsatz widerrufen", substitute:"Vertretung beauftragen", substitutes:"Vertretungen",
    active:"Gültig", ended:"Widerrufen", overview:"Meine Einsätze", search:"Nach Namen suchen", more:"Weitere anzeigen",
  },
} as const;

const actionLabel={"attendance.read":["عرض الحضور","Anwesenheit ansehen"],"attendance.mark":["تسجيل الحضور","Anwesenheit erfassen"],"attendance.approve":["اعتماد الحضور","Anwesenheit bestätigen"],"academics.plan":["خطة الدروس","Unterricht planen"],"academics.log":["سجل الشرح","Unterricht dokumentieren"],"academics.grade":["تسجيل الدرجات","Noten erfassen"],"academics.publish":["نشر النتائج","Ergebnisse veröffentlichen"],"comms.class":["مراسلات الفصل","Klassenkommunikation"]} as const;
const staffList=staffSchema.array(), accountList=staffAccountSchema.array(), subjects=subjectSchema.array();
const classes=schoolClassSchema.array(), years=yearSchema.array(), assignmentList=assignmentWithSubstitutesSchema.array();
const teaching=teachingViewSchema.array();
const updated=z.object({ assignment:assignmentSchema, replacement:assignmentSchema.nullable() });
type StaffAccounts=z.infer<typeof accountList>;
type Subject=z.infer<typeof subjectSchema>;
type Assignment=z.infer<typeof assignmentWithSubstitutesSchema>;
type Capability=z.infer<typeof assignmentSchema>["capabilities"][number];

function report(locale:Locale,error:unknown) {
  return error instanceof ApiResponseError ? localizedError(locale,error.messageKey) : dictionary(locale)["error.unavailable"];
}
function useOperation(locale:Locale) {
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState("");
  const [error,setError]=useState(false);
  return {busy,feedback,error,run:async(action:()=>Promise<void>,announce=true)=>{
    setBusy(true);setFeedback("");setError(false);
    try { await action(); if(announce)setFeedback(dictionary(locale).saved); }
    catch(cause) {setFeedback(report(locale,cause));setError(true);}
    finally {setBusy(false);}
  }};
}
function WorkNotice({ operation }: {operation:ReturnType<typeof useOperation>}) {
  return operation.feedback ? <p role={operation.error?"alert":"status"}>{operation.feedback}</p>:null;
}
const area = "/school";

export function StaffAssignments({locale,initialYear,initialClass,canCreateAdmin=false}: {locale:Locale;initialYear?:string;initialClass?:string;canCreateAdmin?:boolean}) {
  const text=words[locale], operation=useOperation(locale);
  const [mode,setMode]=useState<"profiles"|"assignments">(initialClass?"assignments":"profiles");
  const [accounts,setAccounts]=useState<StaffAccounts>();
  const [people,setPeople]=useState<StaffProfile[]>([]);
  const [peopleCursor,setPeopleCursor]=useState<string>();
  const [search,setSearch]=useState("");
  const [query,setQuery]=useState("");
  const [subjectsList,setSubjects]=useState<Subject[]>([]);
  const [record,setRecord]=useState<StaffProfile|null>();
  const [newRole,setNewRole]=useState<"teacher"|"admin"|null>(null);
  const [yearsList,setYears]=useState<z.infer<typeof years>>([]);
  const [yearId,setYearId]=useState(initialYear??"");
  const [classId,setClassId]=useState(initialClass??"");
  const [classList,setClassList]=useState<z.infer<typeof classes>>([]);
  const [readiness,setReadiness]=useState<"loading"|"ready"|"error">("loading");
  const [reload,setReload]=useState(0);
  const [error,setError]=useState("");
  const [rows,setRows]=useState<Assignment[]>([]);

  useEffect(()=>{
    const abort=new AbortController();
    Promise.all([
      requestApi(`${area}/staff/accounts`,accountList,{signal:abort.signal}),
      requestApi(`${area}/subjects`,subjects,{signal:abort.signal}),
      requestApi(`${area}/years`,years,{signal:abort.signal}),
    ]).then(([one,two,three])=>{
      setAccounts(one.data);setSubjects(two.data);setYears(three.data);setReadiness("ready");
    }).catch((error)=>{if(!abort.signal.aborted){setError(report(locale,error));setReadiness("error");}});
    return ()=>abort.abort();
  },[locale,reload]);

  useEffect(()=>{
    const abort=new AbortController();
    requestApi(`${area}/staff?query=${encodeURIComponent(query)}&limit=100`,staffList,{signal:abort.signal})
      .then(({data,meta})=>{setPeople(data);setPeopleCursor(meta?.nextCursor);})
      .catch((error)=>{if(!abort.signal.aborted)setError(report(locale,error));});
    return ()=>abort.abort();
  },[query,reload,locale]);

  useEffect(()=>{
    if(!yearId)return;
    const abort=new AbortController();
    requestApi(`${area}/classes?yearId=${yearId}&limit=100`,classes,{signal:abort.signal})
      .then(({data})=>setClassList(data)).catch((error)=>{if(!abort.signal.aborted)setError(report(locale,error));});
    return ()=>abort.abort();
  },[yearId,locale]);

  useEffect(()=>{
    if(!classId)return;
    const abort=new AbortController();
    requestApi(`${area}/classes/${classId}/assignments`,assignmentList,{signal:abort.signal}).then(({data})=>setRows(classId?data.filter((row)=>row.classId===classId):data))
      .catch((error)=>{if(!abort.signal.aborted)setError(report(locale,error));});
    return ()=>abort.abort();
  },[classId,locale,reload]);

  const content=<div className="auth-form">
    <div className="header-actions family-tabs">
      {(["profiles","assignments"] as const).map((option)=><button key={option} className="plain-button" aria-pressed={mode===option}
        onClick={()=>setMode(option)}>{text[option]}</button>)}
    </div>
    {mode==="profiles"?<div className="calendar-layout">
      <section className="auth-card">
        <h2>{text.profiles}</h2>
        <form className="auth-form" onSubmit={(e)=>{e.preventDefault();setQuery(search);}}>
          <label>{text.search}<input value={search} onChange={(e)=>setSearch(e.target.value)} /></label>
          <button className="plain-button">{text.choose}</button>
        </form>
        <ul className="group-list">{people.map((person)=><li key={person.id}>
          <button className="group-row" disabled={operation.busy} onClick={()=>void operation.run(async()=>{
            setRecord((await requestApi(`${area}/staff/${person.id}`,staffSchema)).data);
          },false)}><bdi>{person.displayName}</bdi><small>{text[person.role]}</small></button>
        </li>)}</ul>
        {peopleCursor && <button className="plain-button" disabled={operation.busy} onClick={()=>void operation.run(async()=>{
          const result=await requestApi(`${area}/staff?query=${encodeURIComponent(query)}&cursor=${peopleCursor}&limit=100`,staffList);
          setPeople([...people,...result.data]);setPeopleCursor(result.meta?.nextCursor);
        },false)}>{text.more}</button>}
        <div className="header-actions">
          <button className="primary-button" onClick={()=>{setRecord(undefined);setNewRole("teacher");}}>{text.newProfile}</button>
          {canCreateAdmin&&<button className="plain-button" onClick={()=>{setRecord(undefined);setNewRole("admin");}}>
            {locale==="ar"?"إضافة Admin":"Admin hinzufügen"}
          </button>}
        </div>
      </section>
      {newRole&&<DirectStaffForm locale={locale} role={newRole} canCreateAdmin={canCreateAdmin}
        saved={()=>{setNewRole(null);setReload(v=>v+1);}} cancel={()=>setNewRole(null)}/>}
      {record&&accounts&&<ProfileForm locale={locale} accounts={accounts} item={record}
        key={record?.id??"new"} saved={(item)=>{setRecord(item);setReload(reload+1);}}/>}
    </div>:<>
      <section className="auth-card">
        <h2>{text.assignments}</h2>
        <div className="auth-form">
          <label>{text.year}<select value={yearId} onChange={(event)=>{setYearId(event.target.value);setClassId("");setRows([]);setClassList([]);}}>
            <option value="">{text.choose}</option>{yearsList.map((item)=><option key={item.id} value={item.id}>{item.startsOn} – {item.endsExclusive}</option>)}
          </select></label>
          {yearId&&<label>{text.class}<select value={classId} onChange={(event)=>{setClassId(event.target.value);setRows([]);}}>
            <option value="">{text.choose}</option>{classList.map((item)=><option value={item.id} key={item.id}>{item.code} · {locale==="ar"?item.nameAr:item.nameDe}</option>)}
          </select></label>}
        </div>
        {classId&&<AssignmentForm key={classId} classId={classId} locale={locale} people={people.filter((item)=>item.accountId&&!item.disabled)}
          offered={subjectsList} saved={()=>setReload(reload+1)} />}
      </section>
      {classId&&rows.map((item)=><AssignmentCard key={item.id} item={item} locale={locale}
        people={people.filter((row)=>row.accountId&&!row.disabled)} saved={()=>setReload(reload+1)} />)}
    </>}
    <WorkNotice operation={operation}/>
    {error&&readiness==="ready"&&<p role="alert">{error}</p>}
  </div>;
  return <><h1>{text.title}</h1><AsyncSurface locale={locale} state={readiness==="ready"?{kind:"ready",content}
    :readiness==="error"?{kind:"error",message:error,retry:()=>{setReadiness("loading");setReload(reload+1);}}:{kind:"initialLoading"}} /></>;
}

function ProfileForm({locale,accounts,item,saved}:{locale:Locale;accounts:StaffAccounts;item:StaffProfile|null;saved:(item:StaffProfile)=>void}) {
  const text=words[locale],command=useAdminCommand(),operation=useOperation(locale);
  return <section className="auth-card">
    <h2>{item?text.profiles:text.newProfile}</h2>
    <form className="auth-form" onSubmit={(event)=>{
      event.preventDefault();
      const form=new FormData(event.currentTarget);
      void operation.run(async()=>{
        const output=await command(item?`${area}/staff/${item.id}`:`${area}/staff`,item?"PATCH":"POST",{
          displayName:form.get("name"),role:form.get("role"),titleAr:form.get("titleAr"),titleDe:form.get("titleDe"),
          workEmail:form.get("email")||null,workPhone:form.get("phone")||null,activeFrom:form.get("from"),activeUntil:form.get("until")||null,
          accountId:item?.accountId??(form.get("account")||null),...(item&&{revision:item.revision}),
        },staffSchema);
        saved(output);
      });
    }}>
      <label>{text.name}<input name="name" required maxLength={200} defaultValue={item?.displayName}/></label>
      <p>{text.role}: <strong>{text[item?.role??"teacher"]}</strong></p>
      <input type="hidden" name="role" value={item?.role??"teacher"}/>
      <label>{text.titleAr}<input name="titleAr" required maxLength={120} defaultValue={item?.titleAr}/></label>
      <label>{text.titleDe}<input name="titleDe" required maxLength={120} defaultValue={item?.titleDe}/></label>
      <label>{text.email}<input name="email" type="email" dir="ltr" defaultValue={item?.workEmail??""}/></label>
      <label>{text.phone}<input name="phone" type="tel" dir="ltr" defaultValue={item?.workPhone??""} maxLength={48}/></label>
      <label>{text.account}<select name="account" defaultValue={item?.accountId??""} disabled={Boolean(item?.accountId)}>
        <option value="">{text.noAccount}</option>{accounts.map((entry)=><option key={entry.accountId} value={entry.accountId}>
          {entry.displayName} · {entry.roles.map((role)=>dictionary(locale)[role]).join(" / ")}
        </option>)}
      </select></label>
      <label>{text.from}<input name="from" type="date" required defaultValue={item?.activeFrom}/></label>
      <label>{text.until}<input name="until" type="date" defaultValue={item?.activeUntil??""}/></label>
      <button className="primary-button" disabled={operation.busy}>{text.save}</button><WorkNotice operation={operation}/>
    </form>
  </section>;
}

function Capabilities({locale, options = assignmentActions}: {locale:Locale; options?:readonly Capability[]}) {
  return <fieldset><legend>{words[locale].caps}</legend>{options.map((cap)=><label key={cap} className="access-check">
    <input type="checkbox" name="capability" value={cap}/>{actionLabel[cap][locale==="ar"?0:1]}
  </label>)}</fieldset>;
}
function StaffSelect({locale,people}:{locale:Locale;people:StaffProfile[]}) {
  const text=words[locale];
  return <label>{text.staff}<select name="staffId" required><option value="">{text.choose}</option>
    {people.map((entry)=><option value={entry.id} key={entry.id}>{entry.displayName}</option>)}</select></label>;
}

function AssignmentForm({classId,locale,people,offered,saved}:{classId:string;locale:Locale;people:StaffProfile[];offered:Subject[];saved:()=>void}) {
  const text=words[locale],command=useAdminCommand(),operation=useOperation(locale);
  const [kind,setKind]=useState<"primary"|"subject">("primary");
  return <form className="auth-form" onSubmit={(event)=>{
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    void operation.run(async()=>{
      await command(`${area}/classes/${classId}/assignments`,"POST",{
        kind,staffId:data.get("staffId"),subjectId:kind==="subject"?data.get("subjectId"):null,
        from:data.get("from"),untilExclusive:data.get("until"),capabilities:data.getAll("capability"),
      },assignmentSchema);saved();
    });
  }}>
    <h3>{text.newAssignment}</h3>
    <StaffSelect locale={locale} people={people}/>
    <label>{text.kind}<select value={kind} onChange={(event)=>setKind(event.target.value as typeof kind)}>
      <option value="primary">{text.primary}</option><option value="subject">{text.subject}</option></select></label>
    {kind==="subject"&&<label>{text.course}<select name="subjectId" required>
      <option value="">{text.choose}</option>{offered.map((item)=><option value={item.id} key={item.id}>{locale==="ar"?item.nameAr:item.nameDe}</option>)}
    </select></label>}
    <label>{text.from}<input type="date" name="from" required/></label>
    <label>{text.until}<input type="date" name="until" required/></label>
    <Capabilities key={kind} locale={locale} options={kind==="primary"?assignmentActions:assignmentActions.filter((cap)=>!["attendance.mark","attendance.approve"].includes(cap))}/>
    <button className="primary-button" disabled={operation.busy}>{text.save}</button><WorkNotice operation={operation}/>
  </form>;
}

function AssignmentCard({item,locale,people,saved}:{item:Assignment;locale:Locale;people:StaffProfile[];saved:()=>void}) {
  const text=words[locale],command=useAdminCommand(),operation=useOperation(locale);
  const [mode,setMode]=useState<"replace"|"end"|"revoke"|"substitute">();
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    void operation.run(async()=>{
      const capabilities=data.getAll("capability"),revision=item.revision;
      if(mode==="substitute")await command(`${area}/assignments/${item.id}/substitutes`,"POST",{
        revision,staffId:data.get("staffId"),from:data.get("from"),untilExclusive:data.get("until"),capabilities,
      },substituteSchema);
      else await command(`${area}/assignments/${item.id}`,"PATCH",{
        revision,...(mode==="revoke"?{revoke:true}:mode==="end"?{untilExclusive:data.get("until")}:
          {replacement:{staffId:data.get("staffId"),from:data.get("from"),capabilities},untilExclusive:data.get("until")}),
      },updated);
      setMode(undefined);saved();
    });
  };
  return <section className="auth-card">
    <h3><bdi>{item.staffName}</bdi> · {item.kind==="primary"?text.primary:(locale==="ar"?item.subjectNameAr:item.subjectNameDe)}</h3>
    <p><bdi>{item.from} – {item.untilExclusive}</bdi> · {item.revoked?text.ended:text.active}</p>
    <p>{item.capabilities.map((cap)=>actionLabel[cap][locale==="ar"?0:1]).join(" · ")}</p>
    {item.substitutes.length>0&&<div><h4>{text.substitutes}</h4><ul>{item.substitutes.map((entry)=><li key={entry.id}>
      <bdi>{entry.staffName}</bdi> · <bdi>{entry.from} – {entry.untilExclusive}</bdi>{entry.revoked&&<> · {text.ended}</>}
    </li>)}</ul></div>}
    {!item.revoked&&<div className="header-actions">{(["replace","end","revoke","substitute"] as const).map((option)=>
      <button className="plain-button" key={option} disabled={operation.busy} onClick={()=>setMode(option)}>{text[option]}</button>)}</div>}
    {mode&&<form className="auth-form" key={mode} onSubmit={submit}>
      <h4>{text[mode]}</h4>
      {(mode==="replace"||mode==="substitute")&&<><StaffSelect locale={locale} people={people.filter((person)=>person.id!==item.staffId)}/>
        <label>{text.from}<input name="from" type="date" required/></label>
        <Capabilities locale={locale} options={mode==="substitute"?item.capabilities:item.kind==="subject"
          ?assignmentActions.filter((cap)=>!["attendance.mark","attendance.approve"].includes(cap)):assignmentActions}/></>}
      {mode!=="revoke"&&<label>{text.until}<input name="until" type="date" required defaultValue={item.untilExclusive}/></label>}
      <button className="primary-button" disabled={operation.busy}>{text.save}</button>
      <button type="button" className="plain-button" onClick={()=>setMode(undefined)}>{dictionary(locale).close}</button>
    </form>}
    <WorkNotice operation={operation}/>
  </section>;
}

export function TeachingSummary({locale,classId}:{locale:Locale;classId?:string}) {
  const text=words[locale];
  const [rows,setRows]=useState<z.infer<typeof teaching>>();
  const [error,setError]=useState<unknown>();
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();
    setRows(undefined);
    requestApi("/me/teaching",teaching,{signal:abort.signal}).then(({data})=>{if(!abort.signal.aborted)setRows(classId?data.filter((row)=>row.classId===classId):data);})
      .catch((error)=>{if(!abort.signal.aborted)setError(error);});
    return()=>abort.abort();
  },[version,classId]);
  return <section className="auth-card"><h2>{text.overview}</h2>
    <AsyncSurface locale={locale} state={error?{kind:"error",message:report(locale,error),retry:()=>{setError(undefined);setVersion(version+1);}}
      :!rows?{kind:"initialLoading"}:rows.length===0?{kind:"empty"}:{kind:"ready",content:<ul className="group-list">
        {rows.map((item)=><li key={item.id} className="group-row">
          <bdi dir="ltr">{item.classCode}</bdi><bdi>{locale==="ar"?item.classNameAr:item.classNameDe}</bdi>
          <span>{item.kind==="primary"?text.primary:(locale==="ar"?item.subjectNameAr:item.subjectNameDe)}</span>
          <bdi>{item.from} – {item.untilExclusive}</bdi>{item.substitute&&<span>{text.substitute}</span>}
        </li>)}
      </ul>}}/>
  </section>;
}
