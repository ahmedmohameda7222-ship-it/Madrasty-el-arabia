import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import {schoolFixtures} from "../fixtures/school";
import {fixtureApi} from "../support/api";
import {setUpCalendar} from "../fixtures/calendar";

test("first direct text is atomic, retry-safe and visible only to its participants",async()=>{
  const school=schoolFixtures();
  try{
    const admin=await school.bearer("admin","admin");
    await setUpCalendar(school,admin);
    const sender=await school.bearer("guardian-other","guardian");
    const people=(await fixtureApi(school,"/directory?view=all&limit=100",{token:sender,persona:"guardian"})).payload.data;
    const candidates=people.filter((p:{role:string})=>p.role==="guardian");
    assert.ok(candidates.length);
    const target=candidates.find((p:{displayName:string})=>p.displayName==="سلمى عبد الرحمن محمد");
    assert.ok(target);
    const detail=async()=>(await fixtureApi(school,"/directory/"+target.id,{token:sender,persona:"guardian"})).payload.data;
    const before=await detail();
    const firstMessage={clientMessageId:randomUUID(),body:"Atomic first message"};
    const request={target:target.target,firstMessage};
    const send={token:sender,persona:"guardian",method:"POST",key:randomUUID(),body:request} as const;
    const first=(await fixtureApi(school,"/threads",send)).payload.data;
    if(before.directThreadId)assert.equal(first.threadId,before.directThreadId);
    assert.equal((await detail()).directThreadId,first.threadId);
    assert.deepEqual((await fixtureApi(school,"/threads",send)).payload.data,first);
    assert.deepEqual((await fixtureApi(school,"/threads",{...send,key:randomUUID()})).payload.data,first);
    const messages=(await fixtureApi(school,"/threads/"+first.threadId+"/messages",{token:sender,persona:"guardian"})).payload.data;
    assert.equal(messages.filter((m:{clientMessageId:string;body:string})=>m.clientMessageId===firstMessage.clientMessageId&&m.body===firstMessage.body).length,1);
    await fixtureApi(school,"/threads/"+first.threadId+"/messages",{token:admin,persona:"admin",status:404});
    const peer=await school.bearer("guardian-ar","guardian");
    const received=(await fixtureApi(school,"/threads/"+first.threadId+"/messages",{token:peer,persona:"guardian"})).payload.data;
    assert.ok(received.some((m:{body:string})=>m.body===firstMessage.body));
  }finally{await school.close();}
});
