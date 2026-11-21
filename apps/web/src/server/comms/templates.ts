import "server-only";
import {broadcastCopy,type Locale,type NotificationTemplate} from "@madrasty/contracts";
import {ApiError} from "@/server/http";
import type {MailEnvelope} from "./providers/email";
import type {PushEnvelope} from "./providers/webPush";

const copy={
  ar:{
    school:"مدرستي العربية",generic:"في تحديث جديد في حسابك. سجّل الدخول عشان تشوف التفاصيل.",open:"افتح الإشعار",
    inviteTitle:"دعوة لتفعيل حساب مدرستي العربية",inviteBody:"مدرستي العربية أرسلت لك دعوة. استخدم الرابط الخاص عشان تفعّل حسابك أو تربط الدعوة بحسابك الحالي.",
    broadcast:"إعلان من المدرسة",human_message:"عندك رسالة غير مقروءة",attendance_unexcused:"إشعار حضور مدرسي",
    attendance_corrected:"تحديث سجل الحضور",exam_scheduled:"تحديث موعد امتحان",result_published:"اتنشرت نتيجة جديدة",
    result_corrected:"تحديث نتيجة",invoice_issued:"فاتورة مدرسية جديدة",invoice_reminder:"تذكير بفاتورة مدرسية",
    payment_recorded:"اتسجّل السداد",payment_reversed:"تحديث سجل السداد",school_update:"إشعار من المدرسة",
  },
  de:{
    school:"Madrasty El Arabia",generic:"In deinem Konto gibt es eine neue Mitteilung. Melde dich an, um die Details zu lesen.",open:"Mitteilung öffnen",
    inviteTitle:"Einladung zu Madrasty El Arabia",inviteBody:"Die Schule hat dich eingeladen. Über den persönlichen Link kannst du dein Konto aktivieren oder die Einladung mit deinem bestehenden Konto verbinden.",
    broadcast:"Mitteilung der Schule",human_message:"Du hast eine ungelesene Nachricht",attendance_unexcused:"Hinweis zur Anwesenheit",
    attendance_corrected:"Anwesenheit aktualisiert",exam_scheduled:"Prüfungstermin aktualisiert",result_published:"Neues Ergebnis veröffentlicht",
    result_corrected:"Ergebnis aktualisiert",invoice_issued:"Neue Schulrechnung",invoice_reminder:"Erinnerung an eine Schulrechnung",
    payment_recorded:"Zahlung erfasst",payment_reversed:"Zahlung aktualisiert",school_update:"Mitteilung der Schule",
  },
} as const;
type MailTemplate=keyof Omit<typeof copy["ar"],"school"|"generic"|"open"|"inviteTitle"|"inviteBody">;

export function invitationEnvelope(to:string,locale:Locale,link:string):MailEnvelope{
  const text=copy[locale];
  return {to,subject:text.inviteTitle,text:`${text.inviteBody}\n\n${link}\n\n${text.school}`};
}

export function schoolMailEnvelope(to:string,locale:Locale,notice:string|null,template:NotificationTemplate,contents:unknown):MailEnvelope{
  const text=copy[locale],origin=process.env.APP_ORIGIN;
  if(!origin)throw new ApiError("unavailable");
  const base=new URL(origin);
  if(base.protocol!=="https:"||base.username||base.password)throw new ApiError("unavailable");
  const link=new URL(notice?`/${locale}/open-notice/${notice}`:`/${locale}/school/home`,base).toString();
  if(template==="broadcast"){
    const message=broadcastCopy.parse(contents)[locale];
    return {to,subject:message.title.replace(/[\r\n]+/g," "),text:`${message.body}\n\n${text.open}\n${link}`};
  }
  const title=Object.hasOwn(text,template)?text[template as MailTemplate]:text.school_update;
  return {to,subject:title,text:`${text.generic}\n\n${text.open}\n${link}`};
}

export function genericPushEnvelope(locale:Locale,noticeId:string,deviceGuard:string):PushEnvelope{
  const text=copy[locale];
  return {locale,noticeId,deviceGuard,title:text.school,body:text.school_update};
}
