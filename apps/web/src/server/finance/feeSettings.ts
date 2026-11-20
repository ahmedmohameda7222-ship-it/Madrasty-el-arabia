import "server-only";
import {
  billingOptions,billingPupil,feeTariff,payerProfile,
  type billingPupilQuery,type feeTariffInput,type payerEdit,type tariffQuery,
} from "@madrasty/contracts";
import type {z} from "zod";
import {requireCapability} from "@/server/access/policies";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {appendAudit} from "@/server/db/outbox";
import {withActor,type ActorContext,type Transaction} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

const month=(value:string)=>value+"-01";
const fields=(tx:Transaction)=>tx`id,to_char(effective_month,'YYYY-MM') as "effectiveFromMonth",lines,
  currency::text as currency,due_day as "dueDay",
  to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt"`;
const financeIssue=(tx:Transaction,actor:ActorContext)=>requireCapability(tx,actor,"finance.issue");

export function readTariffs(actor:ActorContext,input:z.infer<typeof tariffQuery>){
  return withActor(actor,async(tx)=>{
    await financeIssue(tx,actor);
    const before=input.cursor?month(input.cursor):null;
    const rows=feeTariff.array().parse(await tx`select ${fields(tx)} from app.school_tariffs() t
      where (${before}::date is null or t.effective_month<${before}::date)
      order by t.effective_month desc limit ${input.limit+1}`);
    const items=rows.slice(0,input.limit);
    return {items,nextCursor:rows.length>input.limit?items.at(-1)?.effectiveFromMonth:undefined};
  });
}
export async function saveTariff(actor:ActorContext,key:string|null,input:z.infer<typeof feeTariffInput>){
  const result=await commitCommand(actor,"finance.tariff.create",key,hashCommand(input),{
    authorize:(tx)=>financeIssue(tx,actor),
    mutate:async(tx)=>{
      const [row]=await tx<{id:string}[]>`select app.add_school_tariff(${month(input.effectiveFromMonth)}::date,
        ${tx.json(input.lines)},${input.dueDay}::smallint) as id`;
      await appendAudit(tx,{action:"finance.tariff_created",aggregateId:row.id,metadata:{effectiveFromMonth:input.effectiveFromMonth}});
      return row;
    },
  });
  return withActor(actor,async(tx)=>{
    await financeIssue(tx,actor);
    const [row]=await tx`select ${fields(tx)} from app.school_tariffs() t where t.id=${result.data.id}`;
    return feeTariff.parse(row);
  });
}

async function payer(tx:Transaction,studentId:string){
  const [row]=await tx`select student_id as "studentId",student_number as "studentNumber",student_name as "studentName",
    revision,designations from app.billing_payer_profile(${studentId})`;
  if(!row)throw new ApiError("not_found");
  const choices=await tx`select id,display_name as "displayName",active_account as "activeAccount"
    from app.billing_guardian_choices(${studentId}) order by display_name,id`;
  return payerProfile.parse({...row,choices});
}
export function readPayer(actor:ActorContext,studentId:string){
  return withActor(actor,async(tx)=>{
    await financeIssue(tx,actor);
    return payer(tx,studentId);
  });
}
export async function setPayer(actor:ActorContext,studentId:string,key:string|null,input:z.infer<typeof payerEdit>){
  await commitCommand(actor,"finance.payer.designate",key,hashCommand({studentId,...input}),{
    authorize:async(tx)=>{await financeIssue(tx,actor);await payer(tx,studentId);},
    mutate:async(tx)=>{
      const [row]=await tx<{revision:number|null}[]>`select app.set_billing_payer(${studentId},${input.guardianId},
        ${month(input.effectiveFromMonth)}::date,${input.revision}) as revision`;
      if(row.revision===null)throw new ApiError("stale_revision");
      await appendAudit(tx,{action:"finance.payer_designated",aggregateId:studentId,
        metadata:{revision:row.revision,effectiveFromMonth:input.effectiveFromMonth}});
      return {revision:row.revision};
    },
  });
  return readPayer(actor,studentId);
}

export function financeBillingOptions(actor:ActorContext,requested?:string){
  return withActor(actor,async(tx)=>{
    await financeIssue(tx,actor);
    const [context]=await tx<{schoolMonth:string;currency:string|null;dueDay:number|null;bankReady:boolean}[]>`
      select to_char(school_month,'YYYY-MM') as "schoolMonth",currency,due_day as "dueDay",bank_ready as "bankReady"
      from app.billing_context()`;
    if(!context)throw new ApiError("unavailable");
    const period=requested??context.schoolMonth;
    const classes=await tx`select id,code,name_ar as "nameAr",name_de as "nameDe"
      from app.billing_class_choices(${month(period)}::date) order by code,id`;
    return billingOptions.parse({...context,period,classes});
  });
}
export function financePupilOptions(actor:ActorContext,input:z.infer<typeof billingPupilQuery>){
  return withActor(actor,async(tx)=>{
    await financeIssue(tx,actor);
    const after=input.cursor??null;
    const rows=billingPupil.array().parse(await tx`select id,student_number as "studentNumber",student_name as "studentName"
      from app.billing_pupil_choices(${month(input.period)}::date,${input.classId??null}::uuid,${input.q||null}::text,${input.missing==="true"})
      where (${after}::uuid is null or id>${after}::uuid) order by id limit ${input.limit+1}`);
    const items=rows.slice(0,input.limit);
    return {items,nextCursor:rows.length>input.limit?items.at(-1)?.id:undefined};
  });
}
