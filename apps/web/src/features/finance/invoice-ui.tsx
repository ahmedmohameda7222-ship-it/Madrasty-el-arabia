"use client";

import type {FeeLine,Locale} from "@madrasty/contracts";

export const billingCopy={
 ar:{
  invoices:"الفواتير",issue:"إصدار الفواتير",settings:"إعدادات الرسوم",tariffs:"التعريفات",payer:"مسؤول السداد",
  period:"الشهر",due:"تاريخ الاستحقاق",dueDay:"يوم الاستحقاق",effective:"بداية السريان",currency:"العملة",
  student:"الطالب",allPupils:"كل الطلبة المؤهلين",classes:"الفصل",allClasses:"كل الفصول",pupils:"اختيار الطلبة",
  search:"ابحث بالاسم أو رقم الطالب",find:"بحث",missing:"من غير فاتورة شهرية",selectPupil:"اختار الطالب",guardian:"ولي الأمر",
  activeLater:"الحساب في انتظار التفعيل",selected:"الطلبة المختارون",preview:"معاينة",confirm:"تأكيد الإصدار",edit:"تعديل",
  save:"حفظ",busy:"جارٍ التنفيذ",saved:"اتحفظ.",back:"رجوع",open:"فتح الفاتورة",total:"إجمالي الفاتورة",allocated:"المبلغ المسجّل",balance:"المبلغ المتبقي",
  monthly:"فاتورة شهرية",manual:"رسوم إضافية",additional:"بند إضافي مستقل",lineAr:"البند بالعربي",lineDe:"البند بالألماني",
  remove:"حذف البند",amount:"المبلغ",add:"إضافة بند",lineItems:"بنود الفاتورة",issued:"اتصدرت",skipped:"تعذّر الإصدار",existing:"فاتورة صادرة بالفعل",
  paid:"مسددة",partial:"مسددة جزئيًا",unpaid:"مستحقة",cancelled:"ملغاة",allStates:"كل الحالات",status:"الحالة",
  issueSnapshot:"بيانات التحويل وقت الإصدار",ask:"استفسار للحسابات",reference:"مرجع التحويل",bank:"حساب التحصيل",clear:"مسح الاختيار",
  stale:"بيانات الإصدار اتغيّرت أو المعاينة انتهت. اعمل معاينة جديدة.",emptyPayer:"مفيش ولي أمر مرتبط ومعتمد لهذا الطالب.",
  ready:"جاهزة للإصدار",stopped:"توقف معتمد",not_enrolled:"مفيش قيد ساري في الشهر المحدّد",
  payer_missing:"يحتاج تحديد مسؤول السداد",payer_inactive:"حساب مسؤول السداد في انتظار التفعيل",
  bank_missing:"حساب التحصيل غير مهيأ",tariff_missing:"لا توجد تعريفة سارية",currency_mismatch:"عملة التعريفة تختلف عن عملة المدرسة",
  monthly_charge:"البند موجود ضمن التعريفات الشهرية",
 },
 de:{
  invoices:"Rechnungen",issue:"Rechnungen ausstellen",settings:"Gebühreneinstellungen",tariffs:"Gebührentarife",payer:"Zahlungspflichtige Person",
  period:"Monat",due:"Fälligkeitsdatum",dueDay:"Fälligkeitstag",effective:"Gültig ab",currency:"Währung",
  student:"Schülerprofil",allPupils:"Alle berechtigten Schülerprofile",classes:"Klasse",allClasses:"Alle Klassen",pupils:"Schülerprofile auswählen",
  search:"Nach Name oder Schülernummer suchen",find:"Suchen",missing:"Ohne Monatsrechnung",selectPupil:"Schülerprofil auswählen",guardian:"Sorgeberechtigte Person",
  activeLater:"Konto wartet auf Aktivierung",selected:"Ausgewählte Schülerprofile",preview:"Vorschau",confirm:"Rechnungen ausstellen",edit:"Bearbeiten",
  save:"Speichern",busy:"Wird verarbeitet",saved:"Gespeichert.",back:"Zurück",open:"Rechnung öffnen",total:"Rechnungsbetrag",
  allocated:"Zugeordnete Zahlung",balance:"Offener Betrag",monthly:"Monatsrechnung",manual:"Zusatzgebühr",additional:"Eigenständige Zusatzposition",
  lineAr:"Position auf Arabisch",lineDe:"Position auf Deutsch",remove:"Position entfernen",amount:"Betrag",add:"Position hinzufügen",
  lineItems:"Rechnungspositionen",issued:"Ausgestellt",skipped:"Nicht ausgestellt",existing:"Rechnung bereits ausgestellt",
  paid:"Bezahlt",partial:"Teilweise bezahlt",unpaid:"Offen",cancelled:"Storniert",allStates:"Alle Status",status:"Status",
  issueSnapshot:"Überweisungsdaten bei Ausstellung",ask:"Buchhaltung kontaktieren",reference:"Verwendungszweck",bank:"Zahlungskonto",clear:"Auswahl löschen",
  stale:"Die Rechnungsdaten haben sich geändert oder die Vorschau ist abgelaufen. Erstelle eine neue Vorschau.",
  emptyPayer:"Für dieses Schülerprofil gibt es noch keine bestätigte Verknüpfung.",ready:"Bereit zur Ausstellung",stopped:"Abmeldung genehmigt",
  not_enrolled:"Keine gültige Einschreibung in diesem Monat",payer_missing:"Zahlungspflichtige Person fehlt",
  payer_inactive:"Zahlungspflichtiges Konto wartet auf Aktivierung",bank_missing:"Zahlungskonto fehlt",tariff_missing:"Gültiger Gebührentarif fehlt",
  currency_mismatch:"Tarifwährung weicht von der Schulwährung ab",monthly_charge:"Die Position ist bereits einem Monatstarif zugeordnet",
 },
} as const;

type DraftLine={titleAr:string;titleDe:string;amount:string};
export const emptyFeeLine=():DraftLine=>({titleAr:"",titleDe:"",amount:""});
const digits=(value:string)=>value.replace(/[٠-٩۰-۹]/g,(digit)=>String(
  (digit.charCodeAt(0)>=0x6f0?digit.charCodeAt(0)-0x6f0:digit.charCodeAt(0)-0x660),
));
function currencyDigits(currency:string){
  return new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits??2;
}
export function financeAmount(amount:number,currency:string){
  const places=currencyDigits(currency),denominator=10n**BigInt(places),value=BigInt(amount);
  return (value/denominator).toString()+(places?"."+(value%denominator).toString().padStart(places,"0"):"")+" "+currency;
}
export function formatFeeLines(input:DraftLine[],currency:string|null):FeeLine[]|null{
  if(!currency)return null;
  const places=currencyDigits(currency);
  const parsed=input.map((line)=>{
    const amount=digits(line.amount.trim()).replace(/[,٫]/g,".");
    if(!/^\d{1,13}(?:\.\d{1,4})?$/.test(amount))return null;
    const [whole,fraction=""]=amount.split(".");
    if(fraction.length>places)return null;
    const integer=BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,"0")||"0");
    if(integer<1n||integer>1000000000000n||!line.titleAr.trim()||!line.titleDe.trim())return null;
    return {titleAr:line.titleAr.trim(),titleDe:line.titleDe.trim(),amountMinor:Number(integer)};
  });
  return parsed.every((item)=>item!==null)?parsed:null;
}
export function FeeLinesEditor({locale,lines,update,currency,busy=false}:{
  locale:Locale;lines:DraftLine[];update:(items:DraftLine[])=>void;currency:string|null;busy?:boolean;
}){
  const text=billingCopy[locale];
  const patch=(index:number,value:Partial<DraftLine>)=>update(lines.map((line,i)=>i===index?{...line,...value}:line));
  return <fieldset className="auth-form" disabled={busy}>
    <legend>{text.lineItems}</legend>
    {lines.map((line,index)=><div className="timetable-day auth-form" key={index}>
      <label>{text.lineAr}<input dir="rtl" value={line.titleAr} maxLength={120} onChange={(event)=>patch(index,{titleAr:event.target.value})}/></label>
      <label>{text.lineDe}<input dir="ltr" value={line.titleDe} maxLength={120} onChange={(event)=>patch(index,{titleDe:event.target.value})}/></label>
      <label>{text.amount} {currency&&<bdi>{currency}</bdi>}<input dir="ltr" value={line.amount} inputMode="decimal" maxLength={18}
        onChange={(event)=>patch(index,{amount:event.target.value})}/></label>
      {lines.length>1&&<button type="button" className="plain-button" onClick={()=>update(lines.filter((_,i)=>i!==index))}>{text.remove}</button>}
    </div>)}
    <button type="button" className="plain-button" disabled={lines.length>=20} onClick={()=>update([...lines,emptyFeeLine()])}>{text.add}</button>
  </fieldset>;
}

export function FeeLines({locale,lines,currency}:{locale:Locale;lines:FeeLine[];currency:string}){
  return <ul className="group-list">{lines.map((line,index)=><li className="group-row" key={index}>
    <bdi>{locale==="ar"?line.titleAr:line.titleDe}</bdi><bdi dir="ltr">{financeAmount(line.amountMinor,currency)}</bdi>
  </li>)}</ul>;
}
