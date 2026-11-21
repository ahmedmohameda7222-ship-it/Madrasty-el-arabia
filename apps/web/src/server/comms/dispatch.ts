import "server-only";
import {localeSchema,notificationTemplate,type Locale} from "@madrasty/contracts";
import {z} from "zod";
import {withDeliveryWorker,withInviteWorker} from "@/server/db/scoped";
import {allowAuthMail} from "@/server/identity/authMail";
import {prepareInvitationMail,type InvitationDispatchStore} from "@/server/identity/inviteDispatch";
import {emailProviderConfigured,sendEmail,verifyEmailEvent,type MailEnvelope} from "./providers/email";
import {fcmConfigured,sendAndroidPush} from "./providers/fcm";
import {sendWebPush,webPushConfigured} from "./providers/webPush";
import type {TransportResult} from "./providers/result";
import {genericPushEnvelope,invitationEnvelope,schoolMailEnvelope} from "./templates";
import {projectSchoolNotifications} from "./rules";

const jobSchema=z.object({
  id:z.uuid(),scope_id:z.uuid(),lease_id:z.uuid(),channel:z.enum(["email","push"]),kind:z.string(),
  source_revision:z.int().positive().nullable(),notice_id:z.uuid().nullable(),context:z.record(z.string(),z.json()),
});
type Job=z.infer<typeof jobSchema>;
type Device={
  installation_id:string;guard:string;platform:"web"|"android";subscription:unknown;locale:Locale;notice_id:string;email:string|null;
};
type Finished=TransportResult|{state:"suppressed";failure:"scope_changed"|"destination_unapproved"};
const isInvite=(job:Job)=>job.kind==="invite_guardian"||job.kind==="invite_teacher";
const uncertain:Finished={state:"uncertain",failure:"confirmation_lost"};

const invitationStore:InvitationDispatchStore={
  load:(inviteId,generation)=>withInviteWorker(async(tx)=>{
    const [row]=await tx<{email:string;locale:Locale;sealedToken:string;sealedProof:string|null;existingIdentity:boolean}[]>`
      select email,locale,sealed_token as "sealedToken",sealed_proof as "sealedProof",existing_identity as "existingIdentity"
      from app.invitation_delivery_input(${inviteId},${generation})`;
    return row&&allowAuthMail(row.email)?row:null;
  }),
  saveProof:(inviteId,generation,encoded,hash)=>withInviteWorker(async(tx)=>{
    const [row]=await tx<{ok:boolean}[]>`select app.save_invitation_proof(${inviteId},${generation},${encoded},${hash}) as ok`;
    return row.ok;
  }),
};

async function complete(job:Job,result:Finished){
  return withDeliveryWorker(async(tx)=>{
    const [row]=await tx<{ok:boolean}[]>`
      select app.finish_delivery_job(${job.id},${job.lease_id},${result.state},
        ${result.state==="accepted"?result.providerId??null:null},${"failure" in result?result.failure:null},
        ${result.state==="retry"?result.after??null:null},
        ${result.state==="failed"?result.retryable??false:false}) as ok`;
    return row.ok;
  });
}

async function mailEnvelope(job:Job){
  if(isInvite(job)){
    const prepared=await prepareInvitationMail(invitationStore,job.scope_id,z.int().positive().parse(job.source_revision));
    return prepared?{envelope:invitationEnvelope(prepared.to,prepared.locale,prepared.link),locale:prepared.locale}:null;
  }
  const target=await withDeliveryWorker(async(tx)=>{
    const [row]=await tx<{email:string;locale:Locale;copy:unknown}[]>`
      select * from app.delivery_mail_target(${job.id},${job.lease_id})`;
    return row;
  });
  if(!target||!allowAuthMail(target.email))return null;
  const template=job.kind==="broadcast"?"broadcast":job.kind==="chat_reminder"?"human_message":
    notificationTemplate.parse(job.context.template);
  const locale=localeSchema.parse(target.locale);
  return {envelope:schoolMailEnvelope(target.email,locale,job.notice_id,template,target.copy),locale};
}

async function dispatchEmail(job:Job):Promise<Finished>{
  if(!emailProviderConfigured())return {state:"retry",failure:"provider_unavailable"};
  let prepared:{envelope:MailEnvelope;locale:Locale}|null;
  try{prepared=await mailEnvelope(job);}
  catch{return {state:"retry",failure:"provider_unavailable"};}
  if(!prepared)return {state:"suppressed",failure:"scope_changed"};
  const {envelope,locale}=prepared;
  if(!allowAuthMail(envelope.to))return {state:"suppressed",failure:"destination_unapproved"};
  const started=await withDeliveryWorker(async(tx)=>{
    const [row]=await tx<{started:boolean}[]>`select app.start_mail_submission(${job.id},${job.lease_id},${envelope.to},${locale}) as started`;
    return row.started;
  });
  if(!started)return {state:"suppressed",failure:"scope_changed"};
  const key=isInvite(job)?`invite/${job.scope_id}/${job.source_revision}`:`school/${job.id}`;
  return sendEmail(job.id,envelope,key);
}

async function deliverPush(job:Job,device:Device){
  const {guard,installation_id:id}=device;
  function finish(result:Finished){
    return withDeliveryWorker(async(tx)=>{
      await tx`select app.finish_push_submission(${job.id},${job.lease_id},${id},${guard},${result.state},
        ${result.state==="accepted"?result.providerId??null:null},${"failure" in result?result.failure:null},
        ${result.state==="failed"&&result.invalidInstallation===true})`;
    });
  }
  if(!device.email||!allowAuthMail(device.email)){
    await finish({state:"suppressed",failure:"destination_unapproved"});
    return undefined;
  }
  if(!(device.platform==="web"?webPushConfigured():fcmConfigured()))return 60;
  const started=await withDeliveryWorker(async(tx)=>{
    const [row]=await tx<{started:boolean}[]>`select app.start_push_submission(${job.id},${job.lease_id},${id},${guard},${device.email}) as started`;
    return row.started;
  });
  if(!started){
    await finish({state:"suppressed",failure:"scope_changed"});
    return undefined;
  }
  const payload=genericPushEnvelope(localeSchema.parse(device.locale),device.notice_id,guard);
  const result=await (device.platform==="web"?sendWebPush(device.subscription,payload):sendAndroidPush(device.subscription,payload))
    .catch(()=>uncertain);
  await finish(result);
  return result.state==="retry"?result.after??0:undefined;
}

async function dispatchPush(job:Job){
  const devices=await withDeliveryWorker((tx)=>tx<Device[]>`
    select * from app.delivery_push_devices(${job.id},${job.lease_id}) limit 12`);
  let wait=0;
  for(let index=0;index<devices.length;index+=4){
    const outcomes=await Promise.allSettled(devices.slice(index,index+4).map((device)=>deliverPush(job,device)));
    for(const outcome of outcomes)if(outcome.status==="fulfilled"&&outcome.value!==undefined)wait=Math.max(wait,outcome.value);
  }
  return withDeliveryWorker(async(tx)=>{
    const [row]=await tx<{state:string|null}[]>`
      select app.complete_push_delivery_job(${job.id},${job.lease_id},${wait}) as state`;
    return row.state;
  });
}

export async function dispatchSchoolDelivery(){
  const projection=await projectSchoolNotifications().catch(()=>{
    console.warn("School notification projection unavailable");
    return {state:"unavailable"} as const;
  });
  const jobs=await withDeliveryWorker(async(tx)=>{
    await tx`select app.queue_invitation_delivery_jobs(40)`;
    await tx`select app.expire_school_broadcast_previews(40),app.expire_push_installations(40)`;
    return jobSchema.array().parse(await tx`select * from app.claim_delivery_jobs(6)`);
  });
  let accepted=0,suppressed=0,pending=0;
  for(let index=0;index<jobs.length;index+=3){
    const outcomes=await Promise.allSettled(jobs.slice(index,index+3).map(async(job)=>{
      if(job.channel==="push")return dispatchPush(job);
      const result=await dispatchEmail(job);
      return await complete(job,result)?result.state:null;
    }));
    for(const outcome of outcomes){
      if(outcome.status==="fulfilled"&&outcome.value==="accepted")accepted++;
      else if(outcome.status==="fulfilled"&&outcome.value==="suppressed")suppressed++;
      else pending++;
    }
  }
  return {claimed:jobs.length,accepted,suppressed,pending,projection};
}

export async function applyProviderEmailEvent(request:Request){
  const event=await verifyEmailEvent(request);
  if(!event)return {recorded:false};
  return withDeliveryWorker(async(tx)=>{
    const [row]=await tx<{recorded:boolean}[]>`
      select app.apply_mail_delivery_event(${event.key},${event.providerId},${event.hintedJob},
        ${event.state},${event.occurredAt}::timestamptz) as recorded`;
    return row;
  });
}
