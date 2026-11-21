"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@madrasty/contracts";
import type { ZodType } from "zod";
import { ApiResponseError, requestApi } from "@/api/client";
import { dictionary, localizedError } from "@/i18n";
import { useAccountScope } from "@/ui/AccountScope";
import { AsyncSurface } from "@/ui/AsyncSurface";

export const timetableWords = {
  ar: {
    title:"الجدول الأسبوعي", previous:"الأسبوع السابق", next:"الأسبوع التالي", date:"الأسبوع الذي يتضمن", today:"هذا الأسبوع",
    canceled:"عطلة أو يوم بدون تدريس", substitute:"مدرس بديل", noLessons:"ما فيش دروس مجدولة في الأسبوع ده.",
    selectChild:"اختر طالب", allClasses:"كل الفصول", choose:"اختر", back:"رجوع", edit:"تعديل موعد", build:"إعداد الجدول",
    classroom:"الفصل", teacher:"المدرس", room:"القاعة", rooms:"القاعات", createRoom:"إضافة قاعة", roomCode:"رمز القاعة",
    nameAr:"الاسم بالعربية", nameDe:"الاسم بالألمانية", year:"السنة الدراسية", assignment:"تكليف المادة",
    weekday:"اليوم", start:"بداية الحصة (HH:MM)", end:"نهاية الحصة (HH:MM)", from:"أول يوم في الفترة",
    until:"آخر الفترة (غير مشمول)", add:"أضف الموعد للمراجعة", remove:"حذف من المسودة", preview:"مراجعة التعارضات",
    save:"حفظ الجدول", saveRoom:"حفظ القاعة", pending:"المواعيد للمراجعة", clear:"إلغاء التعديل",
    cancelSlot:"إلغاء الموعد المتكرر", confirmCancel:"اعتماد الإلغاء", available:"المواعيد جاهزة للحفظ.",
    interval:"راجع الوقت أو فترة سريان التكليف.", unavailable:"القيمة المختارة لم تعد متاحة.",
    clash:"الموعد يتعارض مع موعد آخر.", adjust:"تعديل من القائمة وإعادة المراجعة",
  },
  de: {
    title:"Wochenplan", previous:"Vorige Woche", next:"Nächste Woche", date:"Woche mit Datum", today:"Diese Woche",
    canceled:"Ferien oder unterrichtsfrei", substitute:"Vertretung", noLessons:"Für diese Woche sind keine Stunden geplant.",
    selectChild:"Kind auswählen", allClasses:"Alle Klassen", choose:"Auswählen", back:"Zurück", edit:"Termin bearbeiten", build:"Stundenplan erstellen",
    classroom:"Klasse",teacher:"Lehrkraft",room:"Raum",rooms:"Räume",createRoom:"Raum hinzufügen",roomCode:"Raumcode",
    nameAr:"Name auf Arabisch",nameDe:"Name auf Deutsch",year:"Schuljahr",assignment:"Fachzuordnung",
    weekday:"Wochentag",start:"Beginn (HH:MM)",end:"Ende (HH:MM)",from:"Gültig ab",
    until:"Gültig bis (ausschließlich)",add:"Termin zur Prüfung hinzufügen",remove:"Aus Entwurf entfernen",preview:"Überschneidungen prüfen",
    save:"Stundenplan speichern",saveRoom:"Raum speichern",pending:"Zu prüfende Termine",clear:"Bearbeitung beenden",
    cancelSlot:"Wiederkehrenden Termin absagen",confirmCancel:"Absage bestätigen",available:"Die Termine können gespeichert werden.",
    interval:"Uhrzeit oder Gültigkeitszeitraum prüfen.",unavailable:"Die Auswahl ist nicht mehr verfügbar.",
    clash:"Der Termin überschneidet sich mit einem anderen.",adjust:"In der Liste ändern und erneut prüfen",
  },
} as const;

export function timetableError(locale: Locale, error: unknown) {
  return error instanceof ApiResponseError ? localizedError(locale,error.messageKey) : dictionary(locale)["error.unavailable"];
}

export function useTimetableRead<T>(path: `/${string}` | null, schema: ZodType<T>, refresh=0) {
  const { accountId,sessionId,persona }=useAccountScope();
  const scope=JSON.stringify([accountId,sessionId,persona,path]);
  const [value,setValue]=useState<{ scope: string; data?:T; confirmedAt?:string; error?:unknown }>();
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!path)return;
    const abort=new AbortController();
    requestApi(path,schema,{signal:abort.signal,headers:{"X-School-Persona":persona}}).then(
      (reply)=>{if(!abort.signal.aborted)setValue({scope,data:reply.data,confirmedAt:new Date().toISOString()});},
      (error)=>{
        if(abort.signal.aborted)return;
        const transient = !(error instanceof ApiResponseError) || error.status >= 500;
        setValue(previous=>transient && previous?.scope===scope ? {...previous,error} : {scope,error});
      },
    );
    return ()=>abort.abort();
  },[attempt,path,persona,refresh,schema,scope]);
  return {value:value?.scope===scope?value:undefined,retry:()=>setAttempt((count)=>count+1)};
}

export function TimetableRead<T>({locale,result,children}:{
  locale:Locale;result:ReturnType<typeof useTimetableRead<T>>;children:(data:T)=>ReactNode;
}) {
  const resultError=result.value?.error;
  const data=result.value?.data;
  return <AsyncSurface locale={locale} state={resultError
    ? resultError instanceof ApiResponseError && [401,403,404].includes(resultError.status)
      ? {kind:"forbidden"} : data!==undefined && result.value?.confirmedAt
        ? {kind:"stale",content:children(data),lastConfirmed:result.value.confirmedAt,retry:result.retry}
        : {kind:"error",message:timetableError(locale,resultError),retry:result.retry}
    : data === undefined ? {kind:"initialLoading"} : {kind:"ready",content:children(data)} }/>;
}

export function minutes(value: number) {
  return `${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;
}
export function weekdayLabel(weekday: number, locale:Locale) {
  return new Intl.DateTimeFormat(locale==="de"?"de-DE":"ar",{weekday:"long",timeZone:"UTC"})
    .format(new Date(Date.UTC(2024,0,weekday)));
}
