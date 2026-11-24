import "server-only";
import type {z} from "zod";
import {monthlyBillingSettings,monthlyBillingInput} from "@/features/finance/monthly-billing-schema";
import {withActor,type ActorContext} from "@/server/db/scoped";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {requireCapability} from "@/server/access/policies";
import {appendAudit} from "@/server/db/outbox";
import {ApiError} from "@/server/http";
export function readMonthlyBilling(actor:ActorContext){
 return withActor(actor,async tx=>{await requireCapability(tx,actor,"finance.issue");const [row]=await tx`select app.monthly_billing_settings() as settings`;return monthlyBillingSettings.parse(row.settings);});
}
export async function configureMonthlyBilling(actor:ActorContext,key:string|null,input:z.infer<typeof monthlyBillingInput>){
 const result=await commitCommand(actor,"finance.monthly_billing.configure",key,hashCommand(input),{
  authorize:tx=>requireCapability(tx,actor,"finance.issue"),
  mutate:async tx=>{
    const [row]=await tx`select app.configure_monthly_billing(${input.enabled},${input.revision}) as settings`;
    if(!row.settings)throw new ApiError("stale_revision");
    const settings=monthlyBillingSettings.parse(row.settings);
    await appendAudit(tx,{action:"finance.monthly_billing_configured",aggregateId:actor.accountId,metadata:{enabled:settings.enabled,revision:settings.revision}});
    return settings;
  }
 });
 return result.data;
}
