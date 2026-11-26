"use client";
import type { ChatMessage, postMessageInput } from "@madrasty/contracts";
import type { AccountPartition } from "@/ui/AccountScope";

type Partition=Pick<AccountPartition,"accountId"|"sessionId"|"persona">;
export type ChatDraft={body:string;quote?:ChatMessage;retry?:ReturnType<typeof postMessageInput.parse>;requestId?:string;openMedia?:boolean};

// Private, document-memory only. Never write messages, credentials or uploads to
// localStorage, sessionStorage, URL state, cookies, or service-worker storage.
export function createChatDraftStore(){
  let active:string|undefined;
  const records=new Map<string,ChatDraft>();
  const key=(actor:Partition)=>JSON.stringify([actor.accountId,actor.sessionId,actor.persona]);
  const owns=(actor:Partition)=>active===key(actor);
  return {
    activate(actor:Partition){const next=key(actor);if(next!==active){records.clear();active=next;}},
    clear(){records.clear();active=undefined;},
    read(actor:Partition,thread:string){return owns(actor)?records.get(thread):undefined;},
    write(actor:Partition,thread:string,draft:ChatDraft){
      if(!owns(actor))return;
      if(draft.body||draft.quote||draft.retry||draft.requestId||draft.openMedia)records.set(thread,draft);
      else records.delete(thread);
    },
    remove(actor:Partition,thread:string){if(owns(actor))records.delete(thread);},
    acknowledge(actor:Partition,thread:string,requestId:string){
      if(owns(actor)&&records.get(thread)?.requestId===requestId)records.delete(thread);
    },
  };
}
export const chatDrafts=createChatDraftStore();
