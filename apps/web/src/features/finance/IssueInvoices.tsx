"use client";

import css from "./FinanceWorkspace.module.css";
import {FinanceDateField,financeDate} from "./FinanceDateField";
import Link from "next/link";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {billingMonth,billingOptions,billingPupil,invoiceBatch,invoicePreview,invoicePreviewInput,payerEdit,payerProfile,schoolDateSchema,type InvoicePreview,type Locale} from "@madrasty/contracts";
import {ApiResponseError,requestApi} from "@/api/client";
import {webHeaders} from "@/api/client-headers";
import {useSchoolCommand} from "@/api/commands";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {billingCopy,emptyFeeLine,FeeLinesEditor,financeAmount,formatFeeLines} from "./invoice-ui";

const pupils=billingPupil.array();
type Student=ReturnType<typeof billingPupil.parse>;
type Options=ReturnType<typeof billingOptions.parse>;
type Receipt=ReturnType<typeof invoiceBatch.parse>;
type Plan={key:string;preview?:InvoicePreview;error?:string};

export function IssueInvoices({locale,initialStudent,mayConfigureBank}:{locale:Locale;initialStudent?:string;mayConfigureBank:boolean}){
  const setup=useTimetableRead("/finance/billing-options",billingOptions);
  return <section className={`${css.workspace} ${css.narrowForm} auth-form`}>
    <h1>{locale==="ar"?"إنشاء فاتورة":"Rechnung erstellen"}</h1>
    <TimetableRead locale={locale} result={setup}>{options=><InvoiceIssuer locale={locale} initial={options} preferred={initialStudent} mayConfigureBank={mayConfigureBank}/>}</TimetableRead>
  </section>;
}

function InvoiceIssuer({locale,initial,preferred,mayConfigureBank}:{locale:Locale;initial:Options;preferred?:string;mayConfigureBank:boolean}){
  const ar=locale==="ar",t=billingCopy[locale],{persona}=useAccountScope(),command=useSchoolCommand(persona),root=`/${locale}/school/more`;
  const [scope,setScope]=useState<"student"|"class"|"school">("student");
  const [kind,setKind]=useState<"monthly"|"manual">("monthly");
  const [period,setPeriod]=useState(initial.period),[classId,setClass]=useState(""),[dueDate,setDueDate]=useState("");
  const [picked,setPicked]=useState<Student>(),[studentId,setStudentId]=useState(preferred??""),[query,setQuery]=useState(""),[choosing,setChoosing]=useState(!preferred);
  const [lines,setLines]=useState([emptyFeeLine()]),[manualKey,setManualKey]=useState(()=>crypto.randomUUID());
  const [plan,setPlan]=useState<Plan>(),[refresh,setRefresh]=useState(0),[fixing,setFixing]=useState<string>();
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[attempted,setAttempted]=useState(false);
  const [receipt,setReceipt]=useState<Receipt>();
  const locked=useRef(false);
  const month=billingMonth.safeParse(period);
  const options=useTimetableRead(month.success&&period!==initial.period?`/finance/billing-options?period=${period}`:null,billingOptions,refresh);
  const current=period===initial.period?initial:options.value?.data;
  const students=useAcademicPage(month.success&&scope==="student"&&choosing?`/finance/pupils?limit=30&period=${period}&missing=false&q=${encodeURIComponent(query.trim())}`:null,pupils,refresh);
  const dateOK=!dueDate||schoolDateSchema.safeParse(dueDate).success;
  const validTarget=scope==="student"?!!studentId:scope==="class"?!!classId:true;
  const dueOK=dateOK&&(!dueDate||dueDate.startsWith(period+"-"));
  const common={period,dueDate:dueDate||undefined,classId:scope==="class"?classId:undefined};
  const proposed=invoicePreviewInput.safeParse(kind==="monthly"?{...common,kind,studentIds:scope==="student"?[studentId]:undefined}:
    {...common,kind,studentIds:[studentId],chargeSourceId:manualKey,lineItems:formatFeeLines(lines,current?.currency??null)});
  const key=month.success&&dueOK&&validTarget&&proposed.success?JSON.stringify(proposed.data):"";
  useEffect(()=>{
    if(!key||receipt||fixing)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      void requestApi("/finance/invoice-previews",invoicePreview,{method:"POST",headers:webHeaders(persona),body:key,signal:controller.signal})
        .then(reply=>{if(!controller.signal.aborted)setPlan({key,preview:reply.data});})
        .catch(problem=>{if(!controller.signal.aborted)setPlan({key,error:timetableError(locale,problem)});});
    },250);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[key,persona,locale,refresh,receipt,fixing]);
  const preview=plan?.key===key?plan.preview:undefined;
  const readyRows=preview?.rows.filter(row=>row.outcome==="ready")??[];
  const blockers=preview?.rows.filter(row=>row.outcome!=="ready")??[];
  const total=readyRows.reduce((n,row)=>n+row.totalMinor,0);
  const currency=readyRows[0]?.currency??current?.currency;
  const missingPayer=scope==="student"?blockers.find(row=>row.outcome==="payer_missing"||row.outcome==="payer_inactive"):undefined;
  const title=scope==="student"?(ar?"إنشاء فاتورة":"Rechnung erstellen"):`${readyRows.length} ${ar?"فاتورة إصدار":"Rechnungen erstellen"}`;
  function invalidate(){setError("");setAttempted(false);}
  function reset(){setReceipt(undefined);setStudentId("");setPicked(undefined);setScope("student");setClass("");setChoosing(true);setLines([emptyFeeLine()]);setManualKey(crypto.randomUUID());invalidate();setRefresh(n=>n+1);}
  async function issue(event:FormEvent){
    event.preventDefault();setAttempted(true);setError("");
    if(locked.current||fixing)return;
    if(missingPayer){setFixing(missingPayer.studentId);return;}
    if(!key||!preview||!readyRows.length)return;
    locked.current=true;setBusy(true);
    try{
      const response=await command("/finance/invoice-batches","POST",{previewId:preview.previewId,revision:preview.revision},invoiceBatch);
      setReceipt(response);
    }catch(problem){
      if(problem instanceof ApiResponseError&&problem.status===409){setPlan(undefined);setRefresh(n=>n+1);setError(ar?"البيانات اتغيرت. راجع العدد الجديد واضغط إصدار مرة أخرى.":"Die Daten haben sich geändert. Prüfe die neue Anzahl und erstelle erneut.");}
      else setError(timetableError(locale,problem));
    }finally{locked.current=false;setBusy(false);}
  }
  if(receipt)return <div className={css.panel} role="status">
    <h2>{receipt.issuedIds.length?(ar?"تم إصدار الفواتير":"Rechnungen erstellt"):(ar?"لم تصدر فاتورة جديدة":"Keine neue Rechnung erstellt")}</h2>
    <p>{t.issued} · {receipt.issuedIds.length} · {t.existing} {receipt.existingIds.length} · {t.skipped} {receipt.skipped.length}</p>
    {receipt.skipped.map(item=><p key={item.studentId}>{preview?.rows.find(row=>row.studentId===item.studentId)?.studentName??""} · {t[item.reason]}</p>)}
    <Link className="primary-button" href={receipt.issuedIds.length===1?`${root}/invoices?invoice=${receipt.issuedIds[0]}&period=${period}`:`${root}/invoices?period=${period}`}>{receipt.issuedIds.length===1?t.open:t.invoices}</Link>
    <button className="plain-button" onClick={reset}>{ar?"إنشاء فاتورة أخرى":"Weitere Rechnung erstellen"}</button>
    <Link className="plain-button" href={`${root}/invoices?period=${period}`}>{ar?"تم":"Fertig"}</Link>
  </div>;
  return <div className="auth-form">
    <Link className="plain-button" href={`${root}/invoices?period=${period}`}>{ar?"رجوع للفواتير":"Zurück zu Rechnungen"}</Link>
    <form className="auth-form" noValidate onSubmit={issue}>
      <fieldset className="auth-form" disabled={busy||!!fixing}>
        <label>{ar?"نوع الفاتورة":"Rechnungsart"}<select value={kind} onChange={e=>{invalidate();const next=e.target.value==="manual"?"manual":"monthly";setKind(next);if(next==="manual")setScope("student");}}>
          <option value="monthly">{t.monthly}</option><option value="manual">{t.manual}</option>
        </select></label>
        {kind==="monthly"&&<label>{ar?"لمن؟":"Für wen?"}<select value={scope} onChange={e=>{invalidate();setScope(e.target.value as typeof scope);}}>
          <option value="student">{ar?"طالب":"Ein Schüler"}</option><option value="class">{ar?"فصل":"Eine Klasse"}</option><option value="school">{ar?"المدرسة كلها":"Alle Schüler"}</option>
        </select></label>}
        {scope==="class"&&<label>{t.classes}<select value={classId} onChange={e=>{invalidate();setClass(e.target.value);}} aria-invalid={attempted&&!classId}>
          <option value="">{ar?"اختر الفصل":"Klasse auswählen"}</option>{current?.classes.map(item=><option key={item.id} value={item.id}>{item.code} · {ar?item.nameAr:item.nameDe}</option>)}
        </select></label>}
        {scope==="student"&&<div className={css.panel}>
          {studentId&&!choosing?<><strong>{picked?.studentName??preview?.rows[0]?.studentName??t.student}</strong><button className="plain-button" type="button" onClick={()=>setChoosing(true)}>{ar?"تغيير الطالب":"Schüler ändern"}</button></>:<>
            <label>{t.search}<input type="search" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)}/></label>
            <AcademicPageItems locale={locale} page={students}>{choices=><ul className={css.recordList}>{choices.map(item=><li key={item.id}><button className="plain-button" type="button" onClick={()=>{invalidate();setPicked(item);setStudentId(item.id);setChoosing(false);}}>{item.studentName} · {item.studentNumber}</button></li>)}</ul>}</AcademicPageItems>
          </>}
        </div>}
        <FinanceDateField locale={locale} label={t.period} type="month" value={period} required onChange={e=>{invalidate();setPeriod(e.target.value);setDueDate("");}} aria-invalid={attempted&&!month.success}/>
        <details className={css.disclosure}><summary>{ar?"تاريخ الاستحقاق (اختياري)":"Fälligkeit ändern (optional)"}</summary><FinanceDateField locale={locale} label={t.due} type="date" value={dueDate} onChange={e=>{invalidate();setDueDate(e.target.value);}} aria-invalid={attempted&&!dueOK}/></details>
        {kind==="manual"&&<FeeLinesEditor locale={locale} lines={lines} update={next=>{invalidate();setLines(next);}} currency={current?.currency??null} busy={busy}/>}
      </fieldset>
      {!key&&<p role={attempted?"alert":"status"}>{!month.success?(ar?"اختر شهرًا صحيحًا.":"Wähle einen gültigen Monat."):!validTarget?(scope==="class"?(ar?"اختر الفصل.":"Wähle eine Klasse."):(ar?"اختر الطالب.":"Wähle einen Schüler.")):!dueOK?(ar?"اختر تاريخ استحقاق داخل الشهر المحدد.":"Wähle ein Fälligkeitsdatum im gewählten Monat."):(ar?"أكمل وصف الرسوم والمبلغ.":"Ergänze Beschreibung und gültigen Betrag.")}</p>}
      {key&&!preview&&!(plan?.key===key&&plan.error)&&<p role="status">{ar?"جاري حساب الفواتير…":"Rechnungen werden berechnet…"}</p>}
      {key&&plan?.key===key&&plan.error&&<div role="alert"><p>{plan.error}</p><button className="plain-button" type="button" onClick={()=>{setPlan(undefined);setRefresh(n=>n+1);}}>{ar?"إعادة المحاولة":"Erneut versuchen"}</button></div>}
      {preview&&<div className={css.panel}>
        <h2>{ar?"ملخص الإصدار":"Zusammenfassung"}</h2>
        <p>{financeDate(period,locale,"month")} · {readyRows.length} {ar?"جاهزة للإصدار":"bereit zur Ausstellung"}</p>
        {scope==="student"&&readyRows[0]?.payerName&&<p>{ar?"مسؤول السداد":"Zahler"} · {readyRows[0].payerName}</p>}
        {currency&&<strong className={css.issueTotal}>{financeAmount(total,currency,locale)}</strong>}
        {blockers.length>0&&<p>{blockers.length} {ar?"لن تصدر تلقائيًا":"werden nicht ausgestellt"}</p>}
        {!readyRows.length&&!blockers.length&&<p>{ar?"لا يوجد طلاب لهذا الاختيار.":"Keine Schüler für diese Auswahl."}</p>}
      </div>}
      {error&&<p role="alert">{error}</p>}
      <div className={css.formAction}><button type="submit" className="primary-button" disabled={busy||!!fixing||!!key&&(!preview||!readyRows.length&&!missingPayer)}>{busy?t.busy:missingPayer?(ar?"تحديد مسؤول السداد":"Zahler festlegen"):title}</button></div>
    </form>
    {blockers.map(row=><div key={row.studentId} className={css.panel}>
      <strong>{row.studentName}</strong><p>{t[row.outcome]}</p>
      {row.existingId&&<Link className="plain-button" href={`${root}/invoices?invoice=${row.existingId}&period=${period}`}>{t.open}</Link>}
      {(row.outcome==="payer_missing"||row.outcome==="payer_inactive")&&(fixing===row.studentId?<InlinePayerEditor locale={locale} studentId={row.studentId} schoolMonth={initial.schoolMonth} period={period} close={()=>setFixing(undefined)} saved={()=>{setFixing(undefined);setPlan(undefined);setRefresh(n=>n+1);}}/>:
        missingPayer?null:<button type="button" className="plain-button" disabled={busy||!!fixing} onClick={()=>setFixing(row.studentId)}>{ar?"تحديد مسؤول السداد":"Zahler festlegen"}</button>)}
      {row.outcome==="tariff_missing"&&<p>{ar?"حدد الاشتراك الشهري في إعدادات الحسابات قبل الإصدار.":"Lege zuerst den Monatsbeitrag in den Buchhaltungseinstellungen fest."}</p>}
      {row.outcome==="bank_missing"&&mayConfigureBank&&<p>{ar?"حدد حساب التحصيل في الإعدادات.":"Richte das Zahlungskonto in den Einstellungen ein."}</p>}
    </div>)}
  </div>;
}

function InlinePayerEditor({locale,studentId,schoolMonth,period,close,saved}:{locale:Locale;studentId:string;schoolMonth:string;period:string;close:()=>void;saved:()=>void}){
  const profile=useTimetableRead(`/finance/children/${studentId}/payer`,payerProfile);
  return <TimetableRead locale={locale} result={profile}>{value=><PayerFields locale={locale} profile={value} schoolMonth={schoolMonth} period={period} close={close} saved={saved}/>}</TimetableRead>;
}
function PayerFields({locale,profile,schoolMonth,period,close,saved}:{locale:Locale;profile:ReturnType<typeof payerProfile.parse>;schoolMonth:string;period:string;close:()=>void;saved:()=>void}){
  const ar=locale==="ar",command=useSchoolCommand(useAccountScope().persona);
  const active=profile.choices.filter(item=>item.activeAccount);
  const [guardian,setGuardian]=useState(active.length===1?active[0].id:""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const lock=useRef(false);
  async function save(e:FormEvent){e.preventDefault();if(lock.current)return;
    if(period<schoolMonth){setError(ar?"لا يمكن تعديل مسؤول السداد لشهر سابق.":"Der Zahler kann nicht rückwirkend geändert werden.");return;}
    const input=payerEdit.safeParse({guardianId:guardian,effectiveFromMonth:period,revision:profile.revision});
    if(!input.success||!active.some(item=>item.id===guardian)){setError(ar?"اختر ولي أمر حسابه مفعل.":"Wähle einen Elternteil mit aktivem Konto.");return;}
    lock.current=true;setBusy(true);setError("");
    try{await command(`/finance/children/${profile.studentId}/payer`,"PUT",input.data,payerProfile);saved();}
    catch(problem){setError(timetableError(locale,problem));}finally{lock.current=false;setBusy(false);}
  }
  return <form className="auth-form" onSubmit={save} noValidate>
    <h3>{ar?"مسؤول السداد":"Zahler"} · {financeDate(period,locale,"month")}</h3>
    {!active.length?<p role="status">{ar?"لا يوجد ولي أمر مرتبط بحساب مفعل. اربط ولي الأمر وفعّل حسابه من ملف الطالب.":"Kein verknüpfter Elternteil mit aktivem Konto. Verknüpfe und aktiviere das Konto im Schülerprofil."}</p>:
      <label>{ar?"ولي الأمر":"Elternteil"}<select value={guardian} disabled={busy} onChange={e=>setGuardian(e.target.value)}><option value="">{ar?"اختر":"Auswählen"}</option>{profile.choices.map(item=><option key={item.id} value={item.id} disabled={!item.activeAccount}>{item.displayName}{!item.activeAccount?(ar?" · غير مفعل":" · Konto inaktiv"):""}</option>)}</select></label>}
    {error&&<p role="alert">{error}</p>}
    {active.length>0&&<button type="submit" className="primary-button" disabled={busy}>{ar?"حفظ والعودة للإصدار":"Speichern und weiter"}</button>}
    <button type="button" className="plain-button" disabled={busy} onClick={close}>{ar?"إلغاء":"Abbrechen"}</button>
  </form>;
}
