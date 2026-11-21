import "server-only";
import {
  noticeDestination,noticeRecord,noticeTargets,notificationTemplate,
  type Locale,type NoticeTarget,type NotificationTemplate,type noticeQuery,
} from "@madrasty/contracts";
import {z} from "zod";
import {withActor,type ActorContext,type Transaction} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

const labels:Record<NotificationTemplate,Record<Locale,string>>={
  broadcast:{ar:"إعلان من المدرسة",de:"Mitteilung der Schule"},
  human_message:{ar:"رسالة جديدة",de:"Neue Nachricht"},
  child_linked:{ar:"اتأكد ربط حسابك بملف طالب",de:"Verknüpfung mit einem Schülerprofil bestätigt"},
  arrival_confirmed:{ar:"اتأكد وصول الطالب",de:"Ankunft bestätigt"},
  attendance_unexcused:{ar:"إشعار حضور",de:"Anwesenheitshinweis"},
  attendance_corrected:{ar:"اتحدّث سجل الحضور",de:"Anwesenheit aktualisiert"},
  exam_scheduled:{ar:"تحديث موعد امتحان",de:"Prüfungstermin aktualisiert"},
  result_published:{ar:"اتنشرت نتيجة جديدة",de:"Ein neues Ergebnis wurde veröffentlicht"},
  result_corrected:{ar:"اتحدّثت نتيجة",de:"Ein Ergebnis wurde aktualisiert"},
  invoice_issued:{ar:"فاتورة مدرسية جديدة",de:"Neue Schulrechnung"},
  invoice_reminder:{ar:"تذكير بفاتورة مدرسية",de:"Erinnerung an eine Schulrechnung"},
  payment_recorded:{ar:"اتسجّل السداد",de:"Zahlung erfasst"},
  payment_reversed:{ar:"اتحدّث سجل السداد",de:"Zahlung aktualisiert"},
  fee_stop_changed:{ar:"تحديث طلب عدم الاستمرار",de:"Antrag zur Abmeldung aktualisiert"},
  application_decided:{ar:"تحديث طلب التدريس",de:"Bewerbung als Lehrkraft aktualisiert"},
  school_update:{ar:"تحديث من المدرسة",de:"Neuigkeiten von der Schule"},
};
const cursorSchema=z.object({id:z.uuid(),createdAt:z.iso.datetime()});
const timestamp="YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";

function decodeCursor(cursor?:string){
  if(!cursor)return null;
  try{return cursorSchema.parse(JSON.parse(Buffer.from(cursor,"base64url").toString("utf8")));}
  catch{throw new ApiError("validation",{cursor:"error.validation"});}
}
export function unreadNoticeCount(actor:ActorContext){
  return withActor(actor,async(tx)=>{
    const [row]=await tx<{unread:number}[]>`select app.notice_unread_count() as unread`;
    return row;
  });
}

export function listNotices(actor:ActorContext,input:z.infer<typeof noticeQuery>){
  const start=decodeCursor(input.cursor),unread=input.unread==="true"||input.unread==="1";
  return withActor(actor,async(tx)=>{
    const rows=await tx<{id:string;template:string;createdAt:string;readAt:string|null;superseded:boolean}[]>`
      select id,template_key as template,to_char(created_at at time zone 'UTC',${timestamp}) as "createdAt",
        to_char(read_at at time zone 'UTC',${timestamp}) as "readAt",superseded
      from app.notice_inbox() n where (not ${unread} or (n.read_at is null and not n.superseded))
        and (${start?.id??null}::uuid is null or (n.created_at,n.id)<(${start?.createdAt??null}::timestamptz,${start?.id??null}::uuid))
      order by created_at desc,id desc limit ${input.limit+1}`;
    const items=rows.slice(0,input.limit).map((row)=>{
      const template=notificationTemplate.safeParse(row.template);
      const key=template.success?template.data:"school_update";
      return noticeRecord.parse({...row,template:key,title:labels[key][input.locale]});
    });
    const end=items.at(-1);
    return {items,nextCursor:rows.length>input.limit&&end?Buffer.from(JSON.stringify(cursorSchema.parse(end))).toString("base64url"):undefined};
  });
}

export function markNoticeRead(actor:ActorContext,id:string){
  return withActor(actor,async(tx)=>{
    const [row]=await tx<{readAt:string|null}[]>`select to_char(app.read_school_notice(${id}) at time zone 'UTC',${timestamp}) as "readAt"`;
    if(!row.readAt)throw new ApiError("not_found");
    return {id,readAt:row.readAt};
  });
}

export function openNotice(actor:ActorContext,id:string){
  return withActor(actor,async(tx)=>{
    const [row]=await tx<{targets:unknown}[]>`select targets from app.open_school_notice(${id})`;
    const targets=row?noticeTargets.parse(row.targets):[];
    return noticeDestination.parse(targets.length?{state:"open",targets}:{state:"unavailable"});
  });
}

export async function upsertNotice(tx:Transaction,recipientId:string,input:{
  persona:ActorContext["persona"]|"applicant";eventId:string;logicalKey:string;template:NotificationTemplate;targets:NoticeTarget[];
}){
  const targets=noticeTargets.min(1).parse(input.targets);
  const [row]=await tx<{id:string}[]>`
    select app.upsert_school_notice(${recipientId},${input.persona},${input.eventId},${input.logicalKey},
      ${input.template},${tx.json(targets)}) as id`;
  return row.id;
}
