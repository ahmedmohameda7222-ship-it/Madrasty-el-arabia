"use client";

import Link from "next/link";
import {useState,type FormEvent} from "react";
import {billingMonth,financeReportQuery,financeReportStatus,financeReportSummary,financeStatementEntry,type FinanceReportQuery,type FinanceStatementEntry,type Locale} from "@madrasty/contracts";
import {webHeaders} from "@/api/client-headers";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {TimetableRead,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {ConfirmedAt} from "@/ui/RecordValues";
import {billingCopy,financeAmount} from "./invoice-ui";
import {receiptCopy} from "./receipt-ui";

const copy={
  ar:{
    title:"كشف الحساب",period:"شهر إصدار الرسوم",asOf:"الأرصدة في تاريخ",from:"السداد المستلم من",through:"السداد المستلم حتى",
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
    title:"Gebührenübersicht",period:"Abrechnungsmonat",asOf:"Stand am",from:"Zahlungseingang ab",through:"Zahlungseingang bis",
    apply:"Bericht anzeigen",classes:"Klasse im Abrechnungsmonat",allClasses:"Alle Klassen",allPupils:"Alle Schüler im Bericht",
    filteredPupil:"Ausgewählter Schüler",allStates:"Alle Status",overdue:"Überfällig",billed:"In Rechnung gestellt",collectible:"Einziehbare Gebühren",
    applied:"Rechnungen zugeordnet",outstanding:"Offene Summe",late:"Überfällige Summe",received:"Erfasste Zahlungen",net:"Nettoeingang",
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

export function FinanceReports({locale,staff,initial}:{locale:Locale;staff:boolean;initial:FinanceReportQuery}){
  const text=copy[locale];
  const [filters,setFilters]=useState(initial);
  const [draft,edit]=useState(initial);
  const [refresh,update]=useState(0);
  const summary=useTimetableRead(`/finance/reports/summary?${queryString(filters)}`,financeReportSummary,refresh);
  function patch<Key extends keyof FinanceReportQuery>(field:Key,value:FinanceReportQuery[Key]){
    edit((old)=>({...old,[field]:value}));
  }
  function apply(event:FormEvent){
    event.preventDefault();
    const checked=financeReportQuery.safeParse({...draft,cutoff:undefined});
    if(checked.success){setFilters(checked.data);update((n)=>n+1);}
  }
  function focus(values:Partial<FinanceReportQuery>){
    const next={...filters,...values};
    setFilters(next);edit(next);update((n)=>n+1);
  }
  const classChoices=summary.value?.data?.classes??[];
  return <section className="auth-card auth-form">
    <h1>{text.title}</h1>
    <form className="auth-form" onSubmit={apply}>
      <div className="header-actions">
        <label>{text.period}<input type="month" dir="ltr" aria-describedby="date-format-finance-month" value={draft.period??""} onChange={(event)=>patch("period",billingMonth.safeParse(event.target.value).data)}/></label>
        {staff&&classChoices.length>0&&<label>{text.classes}<select value={draft.classId??""} onChange={(event)=>patch("classId",event.target.value||undefined)}>
          <option value="">{text.allClasses}</option>
          {classChoices.map((item)=><option key={item.id} value={item.id}>{item.code} · {locale==="ar"?item.nameAr:item.nameDe} · {item.yearStart.slice(0,4)}</option>)}
        </select></label>}
        <label>{billingCopy[locale].status}<select value={draft.status??""} onChange={(event)=>patch("status",financeReportStatus.safeParse(event.target.value).data)}>
          <option value="">{text.allStates}</option>
          {financeReportStatus.options.map((key)=><option key={key} value={key}>{key==="overdue"?text.overdue:billingCopy[locale][key]}</option>)}
        </select></label>
        <label>{text.asOf}<input type="date" dir="ltr" aria-describedby="date-format-finance-day" value={draft.asOf??""} max={summary.value?.data?.schoolDate}
          onChange={(event)=>patch("asOf",event.target.value||undefined)}/></label>
      </div>
      <div className="header-actions">
        <label>{text.from}<input type="date" dir="ltr" aria-describedby="date-format-finance-day" value={draft.receivedFrom??""} max={draft.receivedThrough}
          onChange={(event)=>patch("receivedFrom",event.target.value||undefined)}/></label>
        <label>{text.through}<input type="date" dir="ltr" aria-describedby="date-format-finance-day" min={draft.receivedFrom} value={draft.receivedThrough??""}
          onChange={(event)=>patch("receivedThrough",event.target.value||undefined)}/></label>
        {filters.studentId&&<button type="button" className="plain-button" onClick={()=>focus({studentId:undefined})}>{text.allPupils}</button>}
        <button type="submit" className="primary-button" disabled={!financeReportQuery.safeParse(draft).success}>{text.apply}</button>
      </div>
      <small className="date-format-hint" id="date-format-finance-day">{locale==="ar"
        ?"تنسيق التاريخ المعروض يعتمد على المتصفح. مثال: ٣١/١٢/٢٠٢٦؛ يمكنك الاختيار من التقويم."
        :"Das angezeigte Datumsformat hängt vom Browser ab. Beispiel: 31.12.2026; Datum im Kalender wählen."}</small>
      <small className="date-format-hint" id="date-format-finance-month">{locale==="ar"
        ?"تنسيق الشهر المعروض يعتمد على المتصفح. مثال: ١٢/٢٠٢٦؛ اختر الشهر والسنة."
        :"Das angezeigte Monatsformat hängt vom Browser ab. Beispiel: 12.2026; Monat und Jahr auswählen."}</small>
    </form>
    <TimetableRead locale={locale} result={summary}>{(data)=><ReportBody locale={locale} data={data} filters={filters}
      refresh={refresh} focus={focus}/>}</TimetableRead>
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
  return <>
    <p>{text.asOf} · <bdi>{data.asOf}</bdi>{filters.studentId&&" · "+text.filteredPupil}</p>
    <ConfirmedAt locale={locale} value={data.cutoff}/>
    {data.totals.map((value)=>{
      const money=(label:string,amount:number|null)=>amount===null?null:<><dt>{label}</dt><dd><bdi dir="ltr">{financeAmount(amount,value.currency)}</bdi></dd></>;
      return <div className="timetable-day auth-form" key={value.currency}>
        <h2><bdi>{value.currency}</bdi></h2>
        <dl className="account-values">
          <dt>{text.invoiceCount}</dt><dd>{value.invoiceCount}</dd>
          {money(text.billed,value.billedMinor)}{money(text.collectible,value.collectibleMinor)}
          {money(text.applied,value.appliedMinor)}{money(text.outstanding,value.outstandingMinor)}{money(text.late,value.overdueMinor)}
          <dt>{text.receiptCount}</dt><dd>{value.receiptCount}</dd>
          {money(text.received,value.receivedMinor)}{money(text.net,value.netReceivedMinor)}{money(text.matched,value.matchedReceivedMinor)}
          {money(text.reversed,value.reversedMinor)}{money(text.voided,value.voidedMinor)}{money(text.refunded,value.refundedMinor)}
          {money(text.unmatched,value.unmatchedMinor)}
        </dl>
        <div className="header-actions">
          {value.overdueCount>0&&<button type="button" className="plain-button" onClick={()=>focus({status:"overdue",asOf:data.asOf,cutoff:data.cutoff})}>{text.lateQueue} · {value.overdueCount}</button>}
          {value.matchingCount!==null&&value.matchingCount>0&&<Link className="plain-button" href={`${root}/receipts?state=needs_matching`}>{text.matchQueue} · {value.matchingCount}</Link>}
        </div>
      </div>;
    })}
    {isSchool&&data.totals.length>0&&<p>{text.matchingScope}</p>}
    <div className="header-actions">
      <h2>{text.statement}</h2>
      {data.canExport&&<button type="button" className="plain-button" disabled={busy} onClick={()=>void download()}>{text.export}</button>}
    </div>
    {failed&&<p role="alert">{text.exportFailed}</p>}
    <AcademicPageItems locale={locale} page={page}>{(rows)=><ul className="group-list">{rows.map((item)=>
      <StatementLine key={item.kind+":"+item.id} locale={locale} item={item} focus={!filters.studentId?(update)=>focus({...update,asOf:data.asOf,cutoff:data.cutoff}):undefined}/>)}</ul>}</AcademicPageItems>
  </>;
}

function StatementLine({locale,item,focus}:{locale:Locale;item:FinanceStatementEntry;focus?:(values:Partial<FinanceReportQuery>)=>void}){
  const text=copy[locale],root=`/${locale}/school/more`,number=(amount:number)=><bdi dir="ltr">{financeAmount(amount,item.currency)}</bdi>;
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
      {item.period&&<bdi>{item.period}</bdi>}
    </div>
    <ConfirmedAt locale={locale} value={item.occurredAt}/>
    {item.receivedDate&&<p>{receiptCopy[locale].received} · <bdi>{item.receivedDate}</bdi></p>}
  </li>;
}
