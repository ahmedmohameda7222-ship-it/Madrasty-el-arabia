import "server-only";
import type {receiptAllocationInput,receiptReversalInput} from "@madrasty/contracts";
import type {z} from "zod";
import {commitCommand,hashCommand} from "@/server/db/commands";
import type {ActorContext} from "@/server/db/scoped";
import {finalizeReceiptPosting,receiptMutationFields,requireReceiptPosting,type MutationRow} from "./receipts";

export async function allocateReceipt(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof receiptAllocationInput>){
  const result=await commitCommand(actor,"finance.receipt.allocate",key,hashCommand({id,...input}),{
    authorize:(tx)=>requireReceiptPosting(tx,actor,id,input.lines.map((line)=>line.invoiceId)),
    mutate:async(tx)=>{
      const [row]=await tx<MutationRow[]>`select ${receiptMutationFields(tx)}
        from app.allocate_finance_receipt(${id},${input.revision},${tx.json(input.lines)})`;
      return finalizeReceiptPosting(tx,actor,row);
    },
  });
  return result.data;
}

export async function reverseReceipt(actor:ActorContext,id:string,key:string|null,input:z.infer<typeof receiptReversalInput>){
  const result=await commitCommand(actor,"finance.receipt.reverse",key,hashCommand({id,...input}),{
    authorize:(tx)=>requireReceiptPosting(tx,actor,id),
    mutate:async(tx)=>{
      const selected=input.kind==="unapply"?input.allocationIds:null;
      const [row]=await tx<MutationRow[]>`select ${receiptMutationFields(tx)}
        from app.reverse_finance_receipt(${id},${input.revision},${input.kind},${selected}::uuid[],${input.reason})`;
      return finalizeReceiptPosting(tx,actor,row);
    },
  });
  return result.data;
}
