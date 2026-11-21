import type { Locale } from "@madrasty/contracts";

export const examCopy={
  ar:{heading:"الامتحانات",written:"تحريري",oral:"شفهي",title:"عنوان الامتحان",newExam:"إضافة امتحان",edit:"تعديل الامتحان",
    date:"التاريخ",time:"الوقت",kind:"نوع الامتحان",maximum:"الدرجة القصوى",draft:"موعد غير معلن",announced:"الموعد المعلن",
    unannounced:"تعديلات الموعد بانتظار الإعلان",save:"حفظ",cancel:"إلغاء",back:"رجوع للامتحانات",
    announce:"إعلان الموعد",reschedule:"تعديل الموعد المعلن",reviewSchedule:"مراجعة الإعلان",confirmSchedule:"اعتماد الإعلان",
    marks:"درجات الطلاب",result:"النتيجة المنشورة",pending:"النتيجة لسه ما اتنشرتش",feedback:"ملاحظات التصحيح",
    saved:"اتحفظ الامتحان.",published:"اتعلن الموعد.",refresh:"تحديث",score:"الدرجة",notMarked:"الدرجة لسه ما اتسجلتش",
    mark:"رصد الدرجة",markSaved:"اتحفظ الرصد.",reviewed:"اختيار للنشر",batchReview:"مراجعة النتائج المختارة",
    batchConfirm:"انشر النتائج",batchDone:"اتنشرت النتائج المختارة.",correction:"تصحيح الدرجة المنشورة",
    reviewCorrection:"مراجعة التصحيح",confirmCorrection:"اعتماد التصحيح",corrected:"اتنشر التصحيح.",
    reason:"سبب التصحيح",history:"سجل النتيجة",rescheduleMark:"راجع الرصد للموعد المعلن قبل النشر",maximumReview:"الدرجة القصوى عند النشر"},
  de:{heading:"Prüfungen",written:"Schriftlich",oral:"Mündlich",title:"Prüfungstitel",newExam:"Prüfung anlegen",edit:"Prüfung bearbeiten",
    date:"Datum",time:"Uhrzeit",kind:"Prüfungsart",maximum:"Höchstpunktzahl",draft:"Termin noch nicht angekündigt",announced:"Angekündigter Termin",
    unannounced:"Unveröffentlichte Änderungen am Termin",save:"Speichern",cancel:"Abbrechen",back:"Zurück zu den Prüfungen",
    announce:"Termin ankündigen",reschedule:"Angekündigten Termin ändern",reviewSchedule:"Ankündigung prüfen",confirmSchedule:"Ankündigung bestätigen",
    marks:"Prüfungspunkte",result:"Veröffentlichtes Ergebnis",pending:"Ergebnis noch nicht veröffentlicht",feedback:"Rückmeldung",
    saved:"Prüfung gespeichert.",published:"Termin veröffentlicht.",refresh:"Aktualisieren",score:"Punkte",notMarked:"Noch keine Punktzahl erfasst",
    mark:"Punktzahl erfassen",markSaved:"Punktzahl gespeichert.",reviewed:"Für Veröffentlichung auswählen",batchReview:"Ausgewählte Ergebnisse prüfen",
    batchConfirm:"Ergebnisse veröffentlichen",batchDone:"Ausgewählte Ergebnisse veröffentlicht.",correction:"Veröffentlichte Punktzahl korrigieren",
    reviewCorrection:"Korrektur prüfen",confirmCorrection:"Korrektur bestätigen",corrected:"Korrektur veröffentlicht.",
    reason:"Begründung der Korrektur",history:"Ergebnisverlauf",rescheduleMark:"Punktzahl für den angekündigten Termin vor Veröffentlichung prüfen",
    maximumReview:"Höchstpunktzahl bei Veröffentlichung"},
} as const;

export function examPoints(locale:Locale,score:number|null,maximum:number){
  if(score===null)return examCopy[locale].notMarked;
  const number=new Intl.NumberFormat(locale,{maximumFractionDigits:4});
  return `${number.format(score)} / ${number.format(maximum)}`;
}
