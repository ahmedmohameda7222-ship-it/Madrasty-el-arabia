import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { chatMessage } from "../../packages/contracts/src/comms/messages";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("a guardian and teacher exchange one private message, read and react without leaking to school administration", async () => {
  const school = schoolFixtures();
  try {
    const admin = await school.bearer("admin", "admin");
    await setUpCalendar(school, admin);
    const [guardian, teacher, finance] = await Promise.all([
      school.bearer("guardian-ar", "guardian"), school.bearer("teacher", "teacher"), school.bearer("finance", "admin"),
    ]);
    const directory = (await fixtureApi(school, "/directory", { token: guardian })).payload.data;
    const staff = directory.find((contact: { displayName: string }) => contact.displayName === "يوسف عبد الرحمن محمود");
    assert.ok(staff?.target);
    const thread = await fixtureApi(school, "/threads", {
      token: guardian, persona: "guardian", method: "POST", key: `${school.run}.teacher-chat`, body: { target: staff.target },
    });
    assert.equal(thread.payload.data.kind, "direct");
    const contactBefore=(await fixtureApi(school,`/threads/${thread.payload.data.threadId}`,{token:guardian})).payload.data.contact;
    assert.equal(contactBefore.displayName,staff.displayName);
    assert.equal(contactBefore.workEmail,staff.workEmail);
    assert.deepEqual(contactBefore.contexts,staff.contexts);
    await fixtureApi(school,`/threads/${thread.payload.data.threadId}`,{token:admin,status:404});
    const path = `/threads/${thread.payload.data.threadId}`;
    const id = randomUUID();
    const body = `رسالة اختبار ${id}`;
    const send = { token: guardian, persona: "guardian", method: "POST", key: id,
      body: { clientMessageId: id, body }, status: 201 } as const;
    const first = chatMessage.parse((await fixtureApi(school, `${path}/messages`, send)).payload.data);
    const replay = chatMessage.parse((await fixtureApi(school, `${path}/messages`, send)).payload.data);
    assert.equal(first.id, replay.id);
    const unreadList = (await fixtureApi(school, "/threads?unread=true&includeEmpty=false&limit=100", {token: teacher})).payload.data;
    assert.ok(unreadList.some((row: {id:string;unread:number}) => row.id === thread.payload.data.threadId && row.unread > 0));
    assert.ok(unreadList.every((row: {unread:number}) => row.unread > 0));
    const teacherInbox = await fixtureApi(school, `${path}/messages?q=${encodeURIComponent(id)}`, { token: teacher });
    assert.deepEqual(teacherInbox.payload.data.map((message: { body: string }) => message.body), [body]);
    const sharedMedia=await fixtureApi(school,`${path}/messages?mediaOnly=true&limit=1`,{token:teacher});
    assert.deepEqual(sharedMedia.payload.data,[],"text-only chat messages must not appear in shared media");
    await fixtureApi(school,`${path}/messages?mediaOnly=true`,{token:admin,status:404});

    for (const outsider of [admin, finance]) {
      await fixtureApi(school, `${path}/messages`, { token: outsider, status: 404 });
    }
    await fixtureApi(school, `${path}/state`, { method: "PATCH", token: teacher, persona: "teacher",
      body: { readThroughSeq: first.sequence } });
    const readList = (await fixtureApi(school, "/threads?unread=true&includeEmpty=false&limit=100", {token: teacher})).payload.data;
    assert.ok(!readList.some((row: {id:string}) => row.id === thread.payload.data.threadId));
    await fixtureApi(school, `${path}/messages/${first.id}/reaction`, { method: "PUT", token: teacher, persona: "teacher",
      body: { emoji: "👍" } });
    const read = chatMessage.parse((await fixtureApi(school, `${path}/messages?limit=1`, { token: guardian })).payload.data[0]);
    assert.equal(read.counterpartRead, true);
    assert.deepEqual(read.reactions, [{ emoji: "👍", count: 1, mine: false }]);
  } finally {
    await school.close();
  }
});

test("first message opens a direct conversation atomically and retries do not duplicate it",async()=>{
  const school=schoolFixtures();
  try{
    const token=await school.bearer("guardian-de","guardian");
    const contacts=(await fixtureApi(school,"/directory?view=all&limit=100",{token})).payload.data;
    const otherContact=contacts.find((entry:{role:string;target:{kind:string}})=>entry.role==="guardian"&&entry.target.kind==="person");
    assert.ok(otherContact);
    const lookup=async()=> (await fixtureApi(school,`/directory/${otherContact.id}`,{token})).payload.data;
    const before=await lookup();
    const clientMessageId=randomUUID(),key=randomUUID(),body="QA atomic first message "+clientMessageId;
    const input={target:otherContact.target,firstMessage:{clientMessageId,body}};
    const send={token,persona:"guardian",method:"POST",key,body:input} as const;
    const first=(await fixtureApi(school,"/threads",send)).payload.data;
    if(before.directThreadId)assert.equal(first.threadId,before.directThreadId);
    assert.equal((await lookup()).directThreadId,first.threadId);
    assert.deepEqual((await fixtureApi(school,"/threads",send)).payload.data,first);
    const repeat=(await fixtureApi(school,"/threads",{...send,key:randomUUID()})).payload.data;
    assert.equal(repeat.threadId,first.threadId);
    const messages=(await fixtureApi(school,`/threads/${first.threadId}/messages?q=${encodeURIComponent(clientMessageId)}`,{token})).payload.data;
    assert.equal(messages.length,1);
    assert.equal(messages[0].body,body);
    assert.equal(messages[0].clientMessageId,clientMessageId);
  }finally{await school.close();}
});


test("chat pin and mute are private to the actor and pinned ordering survives pagination",async()=>{
  const school=schoolFixtures();
  try{
    const admin=await school.bearer("admin","admin");
    await setUpCalendar(school,admin);
    const token=await school.bearer("guardian-de","guardian");
    const teacher=await school.bearer("teacher","teacher");
    const contacts=(await fixtureApi(school,"/directory?view=all&limit=100",{token})).payload.data;
    const target=contacts.find((c:{displayName:string})=>c.displayName==="يوسف عبد الرحمن محمود").target;
    const other=contacts.find((c:{role:string;target:{kind:string}})=>c.role==="guardian"&&c.target.kind==="person").target;
    const open=async(target:unknown)=>{const id=randomUUID();return (await fixtureApi(school,"/threads",{token,persona:"guardian",method:"POST",key:id,body:{target,firstMessage:{clientMessageId:id,body:"QA pin "+id}}})).payload.data.threadId as string;};
    const pinned=await open(target),recent=await open(other),path="/threads/"+pinned;
    const patch=async(body:unknown)=>(await fixtureApi(school,path+"/state",{token,persona:"guardian",method:"PATCH",body})).payload.data;
    const saved=await patch({pinned:true,muted:true});
    assert.equal(saved.pinned,true);assert.equal(saved.muted,true);
    const mine=(await fixtureApi(school,path,{token})).payload.data;
    assert.equal(mine.pinned,true);assert.equal(mine.muted,true);
    const theirs=(await fixtureApi(school,path,{token:teacher})).payload.data;
    assert.equal(theirs.pinned,false);assert.equal(theirs.muted,false);
    await fixtureApi(school,path+"/state",{token:admin,persona:"admin",method:"PATCH",body:{pinned:true,muted:false},status:404});
    const all:string[]=[];let cursor:string|undefined;
    do{const result=(await fixtureApi(school,"/threads?limit=1&includeEmpty=false"+(cursor?"&cursor="+encodeURIComponent(cursor):""),{token})).payload;all.push(...result.data.map((r:{id:string})=>r.id));cursor=result.meta?.nextCursor;assert.ok(all.length<100,"pagination terminates");}while(cursor);
    assert.equal(all[0],pinned);assert.ok(all.includes(recent));assert.equal(new Set(all).size,all.length);
    const archived=await patch({archived:true});assert.equal(archived.pinned,true);assert.equal(archived.muted,true);
    await patch({archived:false});
    const unpinned=await patch({pinned:false});assert.equal(unpinned.pinned,false);assert.equal(unpinned.muted,true);
    const unmuted=await patch({muted:false});assert.equal(unmuted.muted,false);
  }finally{await school.close();}
});
