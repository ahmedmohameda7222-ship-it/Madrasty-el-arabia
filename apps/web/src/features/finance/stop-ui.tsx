"use client";

import {type EnrollmentStop,type Locale} from "@madrasty/contracts";
import {ConfirmedAt} from "@/ui/RecordValues";

export const stopCopy={
  ar:{
    title:"وقف القيد",staffTitle:"طلبات وقف القيد",newRequest:"طلب وقف القيد",child:"الطالب",last:"آخر شهر حضور",
    start:"يبدأ الوقف من",end:"القيد يستأنف من",indefinite:"لأجل غير محدد",one_month:"شهر واحد",duration:"مدة الوقف",
    reason:"سبب الطلب",note:"ملاحظة القرار",preview:"مراجعة",edit:"تعديل",submit:"إرسال الطلب",withdraw:"سحب الطلب",
    confirm:"تأكيد",all:"كل الحالات",pending:"بانتظار القرار",withdrawn:"اتسحب",approved:"اتوافق عليه",rejected:"اترَفض",
    approve:"الموافقة على الطلب",reject:"رفض الطلب",back:"رجوع",choose:"اختار طالب",review:"المراجعة المالية",
    open:"مفتوحة",waived:"اتسوت الرسوم",retained:"الرسوم مستمرة",reviewTitle:"تسويات وقف القيد",
    original:"الرسوم وقت الإصدار",collectible:"الرسوم المستحقة",originalPaid:"المخصص وقت الموافقة",activePaid:"المخصص الآن",
    waiver:"تسوية الرسوم بالكامل",keep:"استمرار الرسوم الإضافية",reasonFinance:"سبب التسوية",confirmResolution:"اعتماد التسوية",
    refund:"تسجيل مبلغ مرتجع بالفعل",refundDate:"تاريخ رد المبلغ",refundRef:"مرجع إثبات رد المبلغ",refundAmount:"المبلغ المرتجع",
    verifyRefund:"أكدت رد المبلغ خارج التطبيق",refundHint:"سجّل رد المبلغ بعد تنفيذه وتأكيده خارج التطبيق.",
    originalReceipt:"الإيصال الأصلي",funds:"المبالغ المستلمة",unapplyFirst:"افتح الإيصال لفك التخصيص الأصلي قبل التسوية.",
    unallocated:"المتاح للتسوية",evidence:"إثبات التصرف في المبلغ",reallocation:"إعادة تخصيص مثبتة",refundProof:"إثبات رد المبلغ",
    saved:"تم الحفظ",stale:"الطلب أو الرصيد اتغير. راجع البيانات المحدّثة.",adjustment:"تم تسجيل تسوية مرتبطة بالفاتورة",
    refundSaved:"تم تسجيل رد المبلغ خارجيًا",dismiss:"إغلاق",missingEvidence:"راجع كل إيصال وأضف إثبات للمبلغ المخصص منه بالكامل.",
  },
  de:{
    title:"Teilnahmepause",staffTitle:"Anträge auf Teilnahmepause",newRequest:"Teilnahmepause beantragen",child:"Schüler",
    last:"Letzter Teilnahmemonat",start:"Beginn der Pause",end:"Wiederaufnahme ab",indefinite:"Unbefristet",one_month:"Ein Monat",
    duration:"Dauer der Pause",reason:"Begründung",note:"Vermerk zur Entscheidung",preview:"Prüfen",edit:"Bearbeiten",
    submit:"Antrag stellen",withdraw:"Antrag zurückziehen",confirm:"Bestätigen",all:"Alle Status",pending:"Entscheidung ausstehend",
    withdrawn:"Zurückgezogen",approved:"Genehmigt",rejected:"Abgelehnt",approve:"Antrag genehmigen",reject:"Antrag ablehnen",
    back:"Zurück",choose:"Schüler auswählen",review:"Finanzielle Klärung",open:"Offen",waived:"Gebühren aufgehoben",
    retained:"Gebühren bleiben bestehen",reviewTitle:"Gebühren bei Teilnahmepausen",original:"Gebühren bei Ausstellung",
    collectible:"Einziehbare Gebühren",originalPaid:"Zuordnung bei Genehmigung",activePaid:"Aktuelle Zuordnung",
    waiver:"Gebühren vollständig aufheben",keep:"Zusatzgebühren beibehalten",reasonFinance:"Begründung der Klärung",
    confirmResolution:"Klärung bestätigen",refund:"Bereits erfolgte Erstattung erfassen",refundDate:"Erstattungsdatum",
    refundRef:"Referenz des Erstattungsnachweises",refundAmount:"Erstatteter Betrag",verifyRefund:"Externe Erstattung bestätigt",
    refundHint:"Erfassen Sie die Erstattung nach dem extern bestätigten Geldeingang beim Empfänger.",
    originalReceipt:"Ursprünglicher Beleg",funds:"Erhaltene Beträge",unapplyFirst:"Öffnen Sie den Beleg und lösen Sie die ursprüngliche Zuordnung.",
    unallocated:"Verfügbarer Betrag",evidence:"Nachweis der Mittelverwendung",reallocation:"Belegte Neuzuordnung",
    refundProof:"Erstattungsnachweis",saved:"Gespeichert",stale:"Antrag oder Saldo hat sich geändert. Bitte erneut prüfen.",
    adjustment:"Gebührenkorrektur zur Rechnung erfasst",refundSaved:"Externe Erstattung erfasst",dismiss:"Schließen",
    missingEvidence:"Für jeden Beleg den gesamten zugeordneten Betrag nachweisen.",
  },
};

export function nextBillingMonth(month:string){
  const [year,part]=month.split("-").map(Number);
  if(part===12)return year<9999?String(year+1).padStart(4,"0")+"-01":undefined;
  return String(year).padStart(4,"0")+"-"+String(part+1).padStart(2,"0");
}

export function StopMonths({locale,last,start,end}:{locale:Locale;last:string;start:string;end:string|null}){
  const text=stopCopy[locale];
  return <dl className="account-values">
    <dt>{text.last}</dt><dd><bdi>{last}</bdi></dd>
    <dt>{text.start}</dt><dd><bdi>{start}</bdi></dd>
    <dt>{text.duration}</dt><dd>{end?text.one_month:text.indefinite}</dd>
    {end&&<><dt>{text.end}</dt><dd><bdi>{end}</bdi></dd></>}
  </dl>;
}

export function StopFacts({locale,item}:{locale:Locale;item:EnrollmentStop}){
  const text=stopCopy[locale];
  return <>
    <h2><bdi>{item.studentName}</bdi> · <bdi>{item.studentNumber}</bdi></h2>
    <p>{text[item.state]}</p>
    <StopMonths locale={locale} last={item.lastAttendanceMonth} start={item.startMonth} end={item.endMonthExclusive}/>
    <p>{text.reason} · <bdi>{item.reason}</bdi></p>
    {item.note&&<p>{text.note} · <bdi>{item.note}</bdi></p>}
    <ConfirmedAt locale={locale} value={item.resolvedAt??item.createdAt}/>
  </>;
}
