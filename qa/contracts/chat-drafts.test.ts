import assert from "node:assert/strict";
import {test} from "node:test";
import {createChatDraftStore} from "../../apps/web/src/features/comms/chat-drafts";

test("chat drafts are isolated by account session and role; old requests cannot erase newer drafts",()=>{
  const drafts=createChatDraftStore();
  const a={accountId:"a",sessionId:"s",persona:"guardian"} as const;
  const b={...a,persona:"teacher"} as const;
  drafts.activate(a);
  drafts.write(a,"thread-a",{body:"Private text",requestId:"old",openMedia:true});
  drafts.write(a,"thread-b",{body:"Other message"});
  assert.equal(drafts.read(a,"thread-a")?.body,"Private text");
  assert.equal(drafts.read(a,"thread-b")?.body,"Other message");
  drafts.write(a,"thread-a",{body:"Edited"});
  drafts.acknowledge(a,"thread-a","old");
  assert.equal(drafts.read(a,"thread-a")?.body,"Edited");
  drafts.write(a,"thread-a",{body:"Sent",requestId:"new"});
  drafts.acknowledge(a,"thread-a","new");
  assert.equal(drafts.read(a,"thread-a"),undefined);
  drafts.activate(b);
  assert.equal(drafts.read(a,"thread-b"),undefined);
  drafts.write(a,"thread-b",{body:"Late old request"});
  assert.equal(drafts.read(b,"thread-b"),undefined);
  drafts.write(b,"thread-b",{body:"Teacher only"});
  drafts.clear();
  assert.equal(drafts.read(b,"thread-b"),undefined);
});
