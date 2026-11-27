"use client";

import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {useState,type FormEvent} from "react";
import {billingMonth,financeReportQuery,financeReportStatus,financeReportSummary,financeStatementEntry,type FinanceReportQuery,type FinanceStatementEntry,type Locale} from "@madrasty/contracts";
import {webHeaders} from "@/api/client-headers";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {TimetableRead,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {ConfirmedAt} from "@/ui/RecordValues";
import {billingCopy,financeAmount} from "./invoice-ui";
import {receiptCopy} from "./receipt-ui";
import css from "./FinanceWorkspace.module.css";
import {FinanceDateField,financeDate} from "./FinanceDateField";
import {FinanceOverview} from "./FinanceOverview";
import {readFinanceReportContext,writeFinanceReportContext} from "./report-context";

const copy={
  ar:{
    title:"نظرة مالية",period:"شهر إصدار الرسوم",asOf:"الأرصدة في تاريخ",from:"السداد المستلم من",through:"السداد المستلم حتى",
    apply:"عرض التقرير",classes:"الفصل في فترة الفاتورة",allClasses:"كل الفصول",allPupils:"كل الطلبة في الكشف",
    filteredPupil:"كشف الطالب المحدد",allStates:"كل الحالات",overdue:"متأخر",billed:"الرسوم الصادرة",collectible:"الرسوم المستحقة للتحصيل",
    applied:"المخصص على الفواتير",outstanding:"إجمالي المتبقي",late:"المتأخر",received:"المدفوعات المسجلة",net:"صافي المقبوض",
    matched:"المخصص من المقبوض للفواتير المعروضة",reversed:"تخصيصات تم عكسها",voided:"مدفوعات ملغاة",refunded:"مدفوعات مرتجعة",
    unmatched:"المبالغ المتاحة للمطابقة",invoiceCount:"عدد الفواتير",receiptCount:"عدد الإيصالات",lateQueue:"الفواتير المتأخرة",
    matchQueue:"قائمة المطابقة الحالية",matchingScope:"إجمالي المقبوض والمطابقة على مستوى المدرسة حسب تاريخ استلام السداد.",
    statement:"حركات كشف الحساب",invoice:"فاتورة",record:"إيصال",allocation:"تخصيص",reversal:"عكس تخصيص",void_receipt:"إلغاء إيصال",
    adjustment:"تسوية رسوم",refund:"رد مبلغ مسجل",balance:"الرصيد في تاريخ الكشف",export:"تنزيل CSV",exportFailed:"تعذّر تنزيل التقرير. راجع الصلاحية أو ضيّق نطاق التواريخ.",
  },
  de:{
    title:"Finanzübersicht",period:"Abrechnungsmonat",asOf:"Stand am",from:"Zahlungseingang ab",through:"Zahlungseingang bis",
    apply:"Bericht anzeigen",classes:"Klasse im Abrechnungsmonat",allClasses:"Alle Klassen",allPupils:"Alle Schüler im Bericht",
    filteredPupil:"Ausgewählter Schüler",allStates:"Alle Status",overdue:"Überfällig",billed:"In Rechnung gestellt",collectible:"Sollbetrag",
    applied:"Bezahlt",outstanding:"Offen",late:"Überfällig",received:"Erfasste Zahlungen",net:"Nettoeingang",
    matched:"Zahlungseingänge für angezeigte Rechnungen",reversed:"Aufgehobene Zuordnungen",voided:"Stornierte Zahlungen",refunded:"Erstattete Zahlungen",
    unmatched:"Für den Abgleich verfügbar",invoiceCount:"Anzahl Rechnungen",receiptCount:"Anzahl Belege",lateQueue:"Überfällige Rechnungen",
    matchQueue:"Aktueller Zahlungsabgleich",matchingScope:"Zahlungseingänge und verfügbare Beträge gelten schulweit nach Eingangsdatum.",
    statement:"Buchungsvorgänge",invoice:"Rechnung",record:"Beleg",allocation:"Zuordnung",reversal:"Aufhebung einer Zuordnung",
    void_receipt:"Belegstornierung",adjustment:"Gebührenkorrektur",refund:"Erfasste Erstattung",balance:"Saldo zum Berichtszeitpunkt",
    export:"CSV herunterladen",exportFailed:"Download fehlgeschlagen. Berechtigung oder Zeitraum prüfen.",
  },
};
const entries=financeStatementEntry.array();
type Summary=ReturnType<typeof financeReportSummary.parse>;
function queryString(filters:FinanceReportQuery){
  const search=new URLSearchParams();
  for(const [key,value] of Object.entries(filters)){if(value)search.set(key,value);}
  return search.toString();
}

export function FinanceReports({locale,staff,initial,canPost=false,canIssue=false}:{locale:Locale;staff:boolean;initial:FinanceReportQuery;canPost?:boolean;canIssue?:boolean}){
  const text=copy[locale];
  const routeParams=useSearchParams();
  const [filters,setFilters]=useState(()=>({...initial,...readFinanceReportContext(routeParams)}));
  const [draft,edit]=useState(()=>({...initial,...readFinanceReportContext(routeParams)}));
  function persist(next:FinanceReportQuery){
    const params=writeFinanceReportContext(new URLSearchParams(routeParams.toString()),next);
    window.history.replaceState(null,"",window.location.pathname+(params.size?`?${params}`:"")+window.location.hash);
  }
  const [refresh,update]=useState(0);
  const summary=useTimetableRead(`/finance/reports/summary?${queryString(filters)}`,financeReportSummary,refresh);
  function patch<Key extends keyof FinanceReportQuery>(field:Key,value:FinanceReportQuery[Key]){
    edit((old)=>({...old,[field]:value}));
  }
  function apply(event:FormEvent){
    event.preventDefault();
    const checked=financeReportQuery.safeParse({...draft,cutoff:undefined});
    if(checked.success){setFilters(checked.data);persist(checked.data);update((n)=>n+1);}
  }
  function focus(values:Partial<FinanceReportQuery>){
    const next={...filters,...values};
    setFilters(next);edit(next);persist(next);update((n)=>n+1);
  }
  const classChoices=summary.value?.data?.classes??[];
  return <section className={`${css.workspace} auth-form`}>
    <h1>{staff?text.title:locale==="ar"?"مدفوعاتي":"Meine Zahlungen"}</h1>
    {staff&&<FinanceOverview locale={locale} month={filters.period} refresh={refresh} canPost={canPost} canIssue={canIssue}/>}
    {staff&&<details className={css.disclosure}><summary>{locale==="ar"?"تصفية التقرير":"Bericht filtern"}</summary>
    <form className="auth-form" onSubmit={apply}>
      <div className="header-actions">
        <FinanceDateField locale={locale} label={text.period} type="month" value={draft.period??""} onChange={(event)=>patch("period",billingMonth.safeParse(event.target.value).data)}/>
        {staff&&classChoices.length>0&&<label>{text.classes}<select value={draft.classId??""} onChange={(event)=>patch("classId",event.target.value||undefined)}>
          <option value="">{text.allClasses}</option>
          {classChoices.map((item)=><option key={item.id} value={item.id}>{item.code} · {locale==="ar"?item.nameAr:item.nameDe} · {item.yearStart.slice(0,4)}</option>)}
        </select></label>}
        <label>{billingCopy[locale].status}<select value={draft.status??""} onChange={(event)=>patch("status",financeReportStatus.safeParse(event.target.value).data)}>
          <option value="">{text.allStates}</option>
          {financeReportStatus.options.map((key)=><option key={key} value={key}>{key==="overdue"?text.overdue:billingCopy[locale][key]}</option>)}
        </select></label>
        <FinanceDateField locale={locale} label={text.asOf} type="date" value={draft.asOf??""} max={summary.value?.data?.schoolDate} onChange={(event)=>patch("asOf",event.target.value||undefined)}/>
      </div>
      <div className="header-actions">
        <FinanceDateField locale={locale} label={text.from} type="date" value={draft.receivedFrom??""} max={draft.receivedThrough} onChange={(event)=>patch("receivedFrom",event.target.value||undefined)}/>
        <FinanceDateField locale={locale} label={text.through} type="date" min={draft.receivedFrom} value={draft.receivedThrough??""} onChange={(event)=>patch("receivedThrough",event.target.value||undefined)}/>
        {filters.studentId&&<button type="button" className="plain-button" onClick={()=>focus({studentId:undefined})}>{text.allPupils}</button>}
        <button type="submit" className="primary-button" disabled={!financeReportQuery.safeParse(draft).success}>{text.apply}</button>
      </div>
    </form></details>}
    <TimetableRead locale={locale} result={summary}>{(data)=><ReportBody locale={locale} data={data} filters={filters}
      refresh={refresh} focus={focus}/>}</TimetableRead>
    {!staff&&<details className={css.disclosure}><summary>{locale==="ar"?"اختيار الشهر":"Monat auswählen"}</summary><form className="auth-form" onSubmit={apply}><FinanceDateField locale={locale} label={billingCopy[locale].period} type="month" value={draft.period??""} onChange={event=>patch("period",billingMonth.safeParse(event.target.value).data)}/>{filters.studentId&&<button type="button" className="plain-button" onClick={()=>focus({studentId:undefined})}>{locale==="ar"?"كل أطفالي":"Alle meine Kinder"}</button>}<button className="primary-button" type="submit">{text.apply}</button></form></details>}
  </section>;
}

function ReportBody({locale,data,filters,refresh,focus}:{
  locale:Locale;data:Summary;filters:FinanceReportQuery;refresh:number;focus:(updates:Partial<FinanceReportQuery>)=>void;
}){
  const text=copy[locale],root=`/${locale}/school/more`,isSchool=data.scope==="staff"&&!filters.studentId&&!filters.classId;
  const query=queryString({...filters,asOf:data.asOf,cutoff:data.cutoff});
  const page=useAcademicPage(`/finance/reports/statement?limit=25&${query}`,entries,refresh);
  const {persona}=useAccountScope();
  const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  async function download(){
    setBusy(true);setFailed(false);
    try{
      const response=await fetch(`/api/v1/finance/reports/export?${query}`,{headers:webHeaders(persona),cache:"no-store"});
      if(!response.ok||!response.headers.get("content-type")?.startsWith("text/csv"))throw new Error("Report unavailable");
      const url=URL.createObjectURL(await response.blob());
      const link=document.createElement("a");
      link.href=url;link.download=`madrasty-finance-${data.asOf}.csv`;
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{setFailed(true);}
    finally{setBusy(false);}
  }
  const invoiceParams=new URLSearchParams();
  if(filters.studentId)invoiceParams.set("student",filters.studentId);
  if(filters.period)invoiceParams.set("period",filters.period);
  if(data.scope==="payer")return <>
    {data.totals.length===0&&<div className={css.panel}><h2>{locale==="ar"?"لا توجد فواتير بعد":"Noch keine Rechnungen"}</h2><p className={css.secondary}>{locale==="ar"?"هنا هتلاقي رسوم أطفالك ومدفوعاتك بعد إصدار الفواتير.":"Hier sehen Sie die Gebühren und Zahlungen Ihrer Kinder, sobald Rechnungen ausgestellt wurden."}</p></div>}
    {data.totals.map(value=><div key={value.currency} className={css.summaryGroup}>
      <div className={css.balance}><small>{locale==="ar"?"المبلغ المتبقي":"Offener Betrag"}</small><strong><bdi dir="ltr">{financeAmount(value.outstandingMinor,value.currency,locale)}</bdi></strong></div>
      <div className={css.metrics}>{([[locale==="ar"?"المطلوب":"Gebühren",value.collectibleMinor],[locale==="ar"?"المدفوع":"Bezahlt",value.appliedMinor]] as const).map(([label,amount])=><div key={label}><small>{label}</small><strong><bdi dir="ltr">{financeAmount(amount,value.currency,locale)}</bdi></strong></div>)}</div>
    </div>)}
    <Link className="primary-button" href={`${root}/invoices${invoiceParams.size?"?"+invoiceParams.toString():""}`}>{locale==="ar"?"فواتيري":"Meine Rechnungen"}</Link>
    {data.totals.length>0&&<details className={css.disclosure}><summary>{locale==="ar"?"الفواتير والإيصالات":"Rechnungen und Belege"}</summary><AcademicPageItems locale={locale} page={page} emptyMessage={locale==="ar"?"لا توجد حركات مالية.":"Keine Buchungen."}>{rows=><ul className="group-list">{rows.map(item=><StatementLine key={item.kind+":"+item.id} locale={locale} item={item}/>)}</ul>}</AcademicPageItems></details>}
    {data.canExport&&<button type="button" className="plain-button" disabled={busy} onClick={()=>void download()}>{text.export}</button>}
    {failed&&<p role="alert">{text.exportFailed}</p>}
    <p className={css.secondary}>{locale==="ar"?"حتى":"Stand"} · <bdi>{financeDate(data.asOf,locale)}</bdi></p>
  </>;
  return <>
    <p>{text.asOf} · <bdi>{financeDate(data.asOf,locale)}</bdi>{filters.studentId&&" · "+text.filteredPupil}</p>
    <ConfirmedAt locale={locale} value={data.cutoff}/>
    {data.totals.map((value)=>{
      const money=(label:string,amount:number|null)=>amount===null?null:<div><dt>{label}</dt><dd><bdi dir="ltr">{financeAmount(amount,value.currency,locale)}</bdi></dd></div>;
      return <div className={css.summaryGroup} key={value.currency}>
        <h2><bdi>{value.currency}</bdi></h2>
        <div className={css.metrics}>{([[text.collectible,value.collectibleMinor],[text.applied,value.appliedMinor],[text.outstanding,value.outstandingMinor],[text.late,value.overdueMinor]] as const).map(([label,amount])=><div key={label}><small>{label}</small><strong><bdi>{financeAmount(amount,value.currency,locale)}</bdi></strong></div>)}</div>
        <div className={css.panel}><small>{locale==="ar"?"نسبة تحصيل الفواتير":"Zahlungsquote"}</small><strong>{value.collectibleMinor>0?Math.round(value.appliedMinor/value.collectibleMinor*100):0}%</strong><progress max={100} value={value.collectibleMinor>0?Math.min(100,value.appliedMinor/value.collectibleMinor*100):0}/></div>
        <details className={css.disclosure}><summary>{locale==="ar"?"تفاصيل الحساب":"Weitere Kennzahlen"}</summary><dl className={css.valueRows}>
          <div><dt>{text.invoiceCount}</dt><dd>{value.invoiceCount}</dd></div>
          {money(text.billed,value.billedMinor)}
          <div><dt>{text.receiptCount}</dt><dd>{value.receiptCount}</dd></div>
          {money(text.received,value.receivedMinor)}{money(text.net,value.netReceivedMinor)}{money(text.matched,value.matchedReceivedMinor)}
          {money(text.reversed,value.reversedMinor)}{money(text.voided,value.voidedMinor)}{money(text.refunded,value.refundedMinor)}
          {money(text.unmatched,value.unmatchedMinor)}
        </dl></details>
        <div className="header-actions">
          {value.overdueCount>0&&<button type="button" className="plain-button" onClick={()=>focus({status:"overdue",asOf:data.asOf,cutoff:data.cutoff})}>{text.lateQueue} · {value.overdueCount}</button>}
          {value.matchingCount!==null&&value.matchingCount>0&&<Link className="plain-button" href={`${root}/receipts?state=needs_matching`}>{text.matchQueue} · {value.matchingCount}</Link>}
        </div>
      </div>;
    })}
    {isSchool&&data.totals.length>0&&<details className={css.disclosure}><summary>{locale==="ar"?"طريقة الحساب":"Berechnung"}</summary><p>{text.matchingScope}</p></details>}
    <div className={css.sectionHeading}>
      <h2>{text.statement}</h2>
      {data.canExport&&<button type="button" className="plain-button" disabled={busy} onClick={()=>void download()}>{text.export}</button>}
    </div>
    {failed&&<p role="alert">{text.exportFailed}</p>}
    <AcademicPageItems locale={locale} page={page}>{(rows)=><ul className="group-list">{rows.map((item)=>
      <StatementLine key={item.kind+":"+item.id} locale={locale} item={item} focus={!filters.studentId?(update)=>focus({...update,asOf:data.asOf,cutoff:data.cutoff}):undefined}/>)}</ul>}</AcademicPageItems>
  </>;
}

function StatementLine({locale,item,focus}:{locale:Locale;item:FinanceStatementEntry;focus?:(values:Partial<FinanceReportQuery>)=>void}){
  const text=copy[locale],root=`/${locale}/school/more`,number=(amount:number)=><bdi dir="ltr">{financeAmount(amount,item.currency,locale)}</bdi>;
  const status=item.state==="overdue"?text.overdue:item.state in receiptCopy[locale]
    ?receiptCopy[locale][item.state as "allocated"|"needs_matching"|"voided"]:billingCopy[locale][item.state as "unpaid"|"partial"|"paid"|"cancelled"];
  return <li className="timetable-day auth-form">
    <h3>{text[item.kind]} · {number(item.amountMinor)}</h3>
    {item.studentId&&<p>
      {focus?<button type="button" className="plain-button" onClick={()=>focus({studentId:item.studentId??undefined})}><bdi>{item.studentName}</bdi></button>:<bdi>{item.studentName}</bdi>}
      {" · "}<bdi>{item.studentNumber}</bdi>{item.classCode&&<> · <bdi>{item.classCode}</bdi></>}
    </p>}
    <p>{status} · {text.balance} {number(item.balanceMinor)}</p>
    <div className="header-actions">
      {item.invoiceId&&<Link href={`${root}/invoices?invoice=${item.invoiceId}`}><bdi>{item.invoiceNumber}</bdi></Link>}
      {item.receiptId&&<Link href={`${root}/receipts?receipt=${item.receiptId}`}><bdi>{item.receiptNumber}</bdi></Link>}
      {item.period&&<bdi>{financeDate(item.period,locale,"month")}</bdi>}
    </div>
    <ConfirmedAt locale={locale} value={item.occurredAt}/>
    {item.receivedDate&&<p>{receiptCopy[locale].received} · <bdi>{financeDate(item.receivedDate,locale)}</bdi></p>}
  </li>;
}
