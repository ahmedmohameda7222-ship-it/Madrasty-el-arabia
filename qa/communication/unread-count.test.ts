import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import {setUpCalendar} from "../fixtures/calendar";
import {schoolFixtures} from "../fixtures/school";
import {fixtureApi} from "../support/api";
test("unread chat badge is account-scoped and reflects read and archive changes",async()=>{
  const school=schoolFixtures();
  try{
    const admin=await school.bearer("admin","admin");
    await setUpCalendar(school,admin);
    const guardian=await school.bearer("guardian-ar","guardian"),teacher=await school.bearer("teacher","teacher");
    const directory=(await fixtureApi(school,"/directory",{token:guardian})).payload.data;
    const target=directory.find((c:{displayName:string})=>c.displayName==="يوسف عبد الرحمن محمود").target;
    const count=async(token:string)=>(await fixtureApi(school,"/threads/count",{token})).payload.data.unread as number;
    const baseline=await count(teacher),adminBase=await count(admin);
    const id=randomUUID(),thread=(await fixtureApi(school,"/threads",{token:guardian,persona:"guardian",method:"POST",key:id,body:{target,firstMessage:{clientMessageId:id,body:"Badge test"}}})).payload.data.threadId;
    const path="/threads/"+thread;
    assert.equal(await count(teacher),baseline+1);
    assert.equal(await count(admin),adminBase);
    const patch=async(body:unknown)=>fixtureApi(school,path+"/state",{token:teacher,persona:"teacher",method:"PATCH",body});
    await patch({archived:true});assert.equal(await count(teacher),baseline);
    await patch({archived:false});assert.equal(await count(teacher),baseline+1);
    const first=(await fixtureApi(school,path+"/messages",{token:teacher})).payload.data[0];
    await patch({readThroughSeq:first.sequence});assert.equal(await count(teacher),baseline);
    await fixtureApi(school,"/threads/count",{status:401});
  }finally{await school.close();}
});
