import "server-only";
import type {z} from "zod";
import {cashbookReport,cashbookInput} from "@/features/finance/cashbook-schema";
import {withActor,type ActorContext} from "@/server/db/scoped";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {requireCapability} from "@/server/access/policies";
import {appendAudit} from "@/server/db/outbox";

export function readCashbook(actor:ActorContext,month?:string){
 return withActor(actor,async tx=>{
   const [row]=await tx`select app.cashbook_report(${month?month+"-01":null}::date) as report`;
   return cashbookReport.parse(row.report);
 });
}
export async function postCashbook(actor:ActorContext,key:string|null,input:z.infer<typeof cashbookInput>){
 const result=await commitCommand(actor,"finance.cashbook.post",key,hashCommand(input),{
  authorize:tx=>requireCapability(tx,actor,"finance.post"),
  mutate:async tx=>{
    const [row]=await tx<{id:string}[]>`select app.post_cashbook_entry(${input.kind},${input.date}::date,${input.amountMinor}::bigint,${input.description}) as id`;
    await appendAudit(tx,{action:"finance.cashbook_posted",aggregateId:row.id,metadata:{kind:input.kind,amountMinor:input.amountMinor,date:input.date}});
    return {id:row.id};
  }
 });
 return result.data;
}
