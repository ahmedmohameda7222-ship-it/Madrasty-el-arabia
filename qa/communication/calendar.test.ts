import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import {schoolFixtures} from "../fixtures/school";
import {setUpCalendar} from "../fixtures/calendar";
import {schoolClock as clock} from "../fixtures/clock";
import {fixtureApi} from "../support/api";

test("communication calendar is complete, scoped and does not change teaching days when events are published",async()=>{
  const school=schoolFixtures();
  try{
    const admin=await school.bearer("admin","admin");
    const {year,apple,berry}=await setUpCalendar(school,admin);
    const guardian=await school.bearer("guardian-ar","guardian");
    const base="/comms/calendar?month="+clock.month;
    const days=async(token:string,query=base)=>(await fixtureApi(school,query,{token})).payload.data;
    const initial=await days(guardian,base+"&classId="+apple.id);
    assert.equal(initial.length,new Date(Date.UTC(Number(clock.month.slice(0,4)),Number(clock.month.slice(5)),0)).getUTCDate());
    assert.equal(initial.find((d:{date:string})=>d.date===clock.day).teaching,true);
    await fixtureApi(school,base+"&classId="+berry.id,{token:guardian,status:404});
    const key=randomUUID();
    const saved=(await fixtureApi(school,"/events",{token:admin,persona:"admin",method:"POST",key,status:[200,201],body:{
      audience:{kind:"class",classId:apple.id},sourceLocale:"de",copy:{de:{title:"QA calendar event",body:"Test"}},
      timing:{start:{date:clock.day,time:null},end:null,allDay:true}
    }})).payload.data;
    assert.equal((await days(guardian,base+"&classId="+apple.id)).find((d:{date:string})=>d.date===clock.day).events,0);
    await fixtureApi(school,"/events/"+saved.id,{token:admin,persona:"admin",method:"PATCH",key:randomUUID(),body:{action:"publish",revision:saved.revision}});
    const visible=(await days(guardian,base+"&classId="+apple.id)).find((d:{date:string})=>d.date===clock.day);
    assert.equal(visible.events,1);
    assert.equal(visible.teaching,true);
    const dayEvents=(await fixtureApi(school,"/events?month="+clock.month+"&day="+clock.day+"&classId="+apple.id,{token:guardian})).payload.data;
    assert.ok(dayEvents.some((item:{id:string})=>item.id===saved.id));
    await fixtureApi(school,"/school/years/"+year.id+"/days/"+clock.day,{token:admin,persona:"admin",method:"PUT",key:randomUUID(),body:{classId:apple.id,teaching:false,reason:"QA holiday",revision:0},status:[200,201]});
    const off=(await days(guardian,base+"&classId="+apple.id)).find((d:{date:string})=>d.date===clock.day);
    assert.equal(off.teaching,false);
    assert.equal(off.events,1);
  }finally{await school.close();}
});
