"use client";

import {useState,type FormEvent} from "react";
import {billingMonth,invoiceSummary,type Locale} from "@madrasty/contracts";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {billingCopy,financeAmount} from "./invoice-ui";
import {FinanceDateField,financeDate} from "./FinanceDateField";

export const receiptCopy={
  ar:{
    title:"الإيصالات",record:"تسجيل سداد",queue:"مطابقة الإيصالات",needs_matching:"يحتاج مطابقة",allocated:"مخصص بالكامل",voided:"ملغى محاسبيًا",
    all:"كل الإيصالات",bank:"تحويل بنكي",cash:"نقدي",reference:"مرجع كشف البنك أو رقم سند القبض",received:"تاريخ استلام المبلغ",
    verification:"أكدت استلام المبلغ خارج التطبيق",preview:"مراجعة",confirm:"تأكيد",edit:"تعديل",optionalInvoice:"اختيار فاتورة (اختياري)",
    invoice:"الفاتورة",noInvoice:"من غير فاتورة",forInvoice:"الفاتورة المقترحة",search:"اسم ولي الأمر أو الطالب أو رقم الفاتورة",
    total:"المبلغ الأصلي",applied:"المبلغ المخصص",remainder:"المبلغ المتاح للمطابقة",active:"المبلغ المثبت",allocations:"تخصيصات الفواتير",
    allocate:"تخصيص دفعة",amount:"مبلغ التخصيص",current:"الرصيد قبل",after:"الرصيد بعد",remove:"حذف",due:"الاستحقاق",
    reason:"السبب",unapply:"إلغاء تخصيص",void_receipt:"إلغاء الإيصال",reverseHint:"الإلغاء المحاسبي ما بيرجعش فلوس للبنك.",
    correction:"تم تصحيح التخصيص",recorded:"تم تسجيل الإيصال",allocateEvent:"تم تخصيص السداد",reversed:"تم فك التخصيص",
    refund:"تم تسجيل رد مبلغ",voidEvent:"تم إلغاء الإيصال",history:"سجل العمليات",open:"فتح الإيصال",use:"اختيار الفاتورة",back:"رجوع",
    exact:"هيتخصص المبلغ فورًا لو لسه مساوي للرصيد المستحق على الفاتورة وقت الحفظ.",unmatched:"هيتسجل المبلغ ويحتاج مطابقة يدوية.",
    stale:"الإيصال أو الفاتورة اتغيّروا. حدّث البيانات وراجعها من جديد.",corrected:"تم تصحيح الإيصال",
  },
  de:{
    title:"Belege",record:"Zahlung erfassen",queue:"Zahlungen abgleichen",needs_matching:"Abgleich erforderlich",allocated:"Vollständig zugeordnet",voided:"Buchhalterisch storniert",
    all:"Alle Belege",bank:"Banküberweisung",cash:"Barzahlung",reference:"Buchungsreferenz des Kontoauszugs oder Quittungsnummer",
    received:"Eingangsdatum",verification:"Ich habe den externen Geldeingang bestätigt",preview:"Prüfen",confirm:"Bestätigen",edit:"Bearbeiten",
    optionalInvoice:"Rechnung auswählen (optional)",invoice:"Rechnung",noInvoice:"Ohne Rechnung",forInvoice:"Vorgeschlagene Rechnung",
    search:"Name des Zahlers, Schülers oder Rechnungsnummer",total:"Ursprünglicher Betrag",applied:"Zugeordneter Betrag",remainder:"Verfügbar für Zuordnung",
    active:"Erfasster Betrag",allocations:"Rechnungszuordnungen",allocate:"Zahlung zuordnen",amount:"Zuordnungsbetrag",current:"Offen vorher",
    after:"Offen nachher",remove:"Entfernen",due:"Fälligkeit",reason:"Begründung",unapply:"Zuordnung aufheben",
    void_receipt:"Beleg stornieren",reverseHint:"Die Buchungskorrektur löst keine Rückzahlung aus.",correction:"Zuordnung korrigiert",
    recorded:"Beleg erfasst",allocateEvent:"Zahlung zugeordnet",reversed:"Zuordnung aufgehoben",voidEvent:"Beleg storniert",refund:"Erstattung erfasst",
    history:"Buchungsverlauf",open:"Beleg öffnen",use:"Rechnung auswählen",back:"Zurück",
    exact:"Der Betrag wird sofort zugeordnet, wenn er beim Speichern dem offenen Saldo entspricht.",
    unmatched:"Der Zahlungseingang wird erfasst und muss manuell zugeordnet werden.",
    stale:"Beleg oder Rechnung wurden geändert. Daten aktualisieren und erneut prüfen.",corrected:"Beleg korrigiert",
  },
};
export type InvoiceCandidate=ReturnType<typeof invoiceSummary.parse>;
const choices=invoiceSummary.array();
export function InvoicePicker({locale,currency,exclude=[],refresh=0,onPick}:{
  locale:Locale;currency:string;exclude?:string[];refresh?:number;onPick:(invoice:InvoiceCandidate)=>void;
}){
  const text=receiptCopy[locale];
  const [month,setMonth]=useState(""),[search,setSearch]=useState(""),[query,setQuery]=useState("");
  const period=billingMonth.safeParse(month);
  const page=useAcademicPage(`/finance/invoices?limit=20&q=${encodeURIComponent(query)}&state=open${period.success?"&period="+month:""}`,choices,refresh);
  function searchInvoices(event:FormEvent){event.preventDefault();setQuery(search.trim());}
  return <div className="auth-form">
    <form className="auth-form" onSubmit={searchInvoices}>
      <label>{text.search}<input type="search" value={search} maxLength={100} onChange={(event)=>setSearch(event.target.value)}/></label>
      <FinanceDateField locale={locale} label={billingCopy[locale].period} type="month" value={month} onChange={(event)=>setMonth(event.target.value)}/>
      <p>{locale==="ar"?"الفواتير المفتوحة":"Offene Rechnungen"}</p>
      <button type="submit" className="plain-button">{billingCopy[locale].find}</button>
    </form>
    <AcademicPageItems locale={locale} page={page}>{(items)=><ul className="group-list">{items
      .filter((item)=>item.currency===currency&&item.balanceMinor>0&&!exclude.includes(item.id))
      .map((item)=><li className="timetable-day" key={item.id}>
        <p><bdi>{item.studentName}</bdi> · <bdi>{item.studentNumber}</bdi> · <bdi>{item.invoiceNumber}</bdi></p>
        <p><bdi>{item.payerName}</bdi> · <bdi>{financeDate(item.period,locale,"month")}</bdi> · <bdi dir="ltr">{financeAmount(item.balanceMinor,currency,locale)}</bdi></p>
        <button type="button" className="plain-button" onClick={()=>onPick(item)}>{text.use}</button>
      </li>)}</ul>}</AcademicPageItems>
  </div>;
}
