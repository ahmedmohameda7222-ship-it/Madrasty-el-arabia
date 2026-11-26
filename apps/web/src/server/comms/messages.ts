import "server-only";
import {
  chatMessage,messageReaction,threadReaderState,
  type chatMessagesQuery,type postMessageInput,type reactionInput,type threadReaderInput,
} from "@madrasty/contracts";
import type { z } from "zod";
import { commitCommand,hashCommand } from "@/server/db/commands";
import { appendEvent } from "@/server/db/outbox";
import { withActor,type ActorContext,type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";

const fields=(tx:Transaction)=>tx`id,thread_id as "threadId",sequence::text as sequence,source,author_name as "authorName",body,
  is_own as own,client_id as "clientMessageId",to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",
  replyable,reply,attachments,reactions,counterpart_read as "counterpartRead"`;
async function requireThread(tx:Transaction,id:string,reply=false){
  const [row]=await tx<{allowed:boolean;canReply:boolean}[]>`select app.thread_can_access(${id}) as allowed,
    ${reply} and app.thread_can_reply(${id}) as "canReply"`;
  if(!row.allowed)throw new ApiError("not_found");
  if(reply&&!row.canReply)throw new ApiError("conflict");
}
async function messageRecord(tx:Transaction,thread:string,id:string){
  const [row]=await tx`select ${fields(tx)} from app.chat_message_projection(${thread},${id},null)`;
  if(!row)throw new ApiError("not_found");
  return chatMessage.parse(row);
}
export function listMessages(actor:ActorContext,thread:string,input:z.infer<typeof chatMessagesQuery>){
  return withActor(actor,async(tx)=>{
    await requireThread(tx,thread);
    const direction=input.after!==undefined?tx`asc`:tx`desc`;
    const rows=chatMessage.array().parse(await tx`select ${fields(tx)} from app.chat_message_projection(${thread},null,${input.q||null}::text) m
      where (${input.before??null}::bigint is null or sequence<${input.before??null}::bigint)
        and (${input.after??null}::bigint is null or sequence>${input.after??null}::bigint)
      order by m.sequence ${direction} limit ${input.limit+1}`);
    const items=rows.slice(0,input.limit);
    return {items,nextCursor:rows.length>input.limit?items.at(-1)?.sequence:undefined};
  });
}

export async function sendMessage(actor:ActorContext,thread:string,key:string|null,input:z.infer<typeof postMessageInput>){
  const requestHash=hashCommand({thread,...input});
  const {data:receipt}=await commitCommand(actor,"comms.message.send",key,requestHash,{
    authorize:(tx)=>requireThread(tx,thread,true),
    mutate:async(tx)=>{
      const [row]=await tx<{id:string;sequence:string;inserted:boolean}[]>`
        select message_id as id,sequence::text as sequence,inserted
        from app.post_thread_message(${thread},${input.clientMessageId},${requestHash},${input.body??null}::text,
          ${tx.array(input.attachmentIds??[])}::uuid[],${input.replyToId??null}::uuid)`;
      if(row.inserted)await appendEvent(tx,{type:"chat.message_created",aggregateId:thread,actorId:actor.accountId,
        payload:{threadId:thread,messageId:row.id,sequence:row.sequence,source:"human"}});
      return {id:row.id,sequence:row.sequence};
    },
  });
  return withActor(actor,(tx)=>messageRecord(tx,thread,receipt.id));
}
export function updateThreadState(actor:ActorContext,thread:string,input:z.infer<typeof threadReaderInput>){
  return withActor(actor,async(tx)=>{
    await requireThread(tx,thread);
    const [row]=await tx`select read_through::text as "readThroughSeq",last_sequence::text as "lastSequence",archived
      from app.change_thread_reader(${thread},${input.readThroughSeq??null}::bigint,${input.archived??null}::boolean)`;
    const [prefs]=input.pinned!==undefined||input.muted!==undefined
      ? await tx`select * from app.change_thread_preferences(${thread},${input.pinned??null}::boolean,${input.muted??null}::boolean)`
      : await tx`select * from app.thread_preferences(${thread})`;
    return threadReaderState.parse({...row,...prefs});
  });
}
export function reactToMessage(actor:ActorContext,thread:string,id:string,input:z.infer<typeof reactionInput>){
  return withActor(actor,async(tx)=>{
    await requireThread(tx,thread);
    const [row]=await tx`select app.put_chat_reaction(${thread},${id},${input.emoji}::text) as reactions`;
    return messageReaction.array().parse(row.reactions);
  });
}
