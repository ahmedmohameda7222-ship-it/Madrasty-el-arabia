import "server-only";
import {autoBillingSettings,autoBillingUpdate} from "@madrasty/contracts";
import type {z} from "zod";
import {withActor,type ActorContext} from "@/server/db/scoped";
import {requireCapability} from "@/server/access/policies";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {appendAudit} from "@/server/db/outbox";
import {ApiError} from "@/server/http";
export function readAutoBilling(actor:ActorContext){
  return withActor(actor,async(tx)=>{
    await requireCapability(tx,actor,"finance.issue");
    const [row]=await tx`select enabled,to_char(start_month,'YYYY-MM') as "startMonth",to_char(school_month,'YYYY-MM') as "schoolMonth",revision,missing_payers::float8 as "missingPayers" from app.automatic_billing_settings()`;
    if(!row||!row.schoolMonth)throw new ApiError("unavailable");
    return autoBillingSettings.parse(row);
  });
}
export async function updateAutoBilling(actor:ActorContext,key:string|null,input:z.infer<typeof autoBillingUpdate>){
  await commitCommand(actor,"finance.auto_billing.update",key,hashCommand(input),{
    authorize:tx=>requireCapability(tx,actor,"finance.issue"),
    mutate:async(tx)=>{
      const [row]=await tx<{revision:number|null}[]>`select app.set_automatic_billing(${input.enabled},${input.startMonth+"-01"}::date,${input.revision}) as revision`;
      if(row.revision===null)throw new ApiError("stale_revision");
      await appendAudit(tx,{action:"finance.automatic_billing_updated",aggregateId:actor.accountId,metadata:{enabled:input.enabled,startMonth:input.startMonth,revision:row.revision}});
      return row;
    },
  });
  return readAutoBilling(actor);
}
