import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { setUpCalendar } from "../fixtures/calendar";
import { fixtureApi } from "../support/api";

test("measure protected API paths with synthetic admin, teacher and guardian sessions", {timeout:300_000}, async()=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const admin=await school.bearer("admin","admin");
    await setUpCalendar(school,admin);
    const teacher=await school.bearer("teacher","teacher");
    const guardian=await school.bearer("guardian-ar","guardian");
    const cases=[
      {persona:"admin",token:admin,paths:["/school/work-queues","/school/families?limit=20","/finance/invoices?limit=20","/finance/reports/summary","/finance/automatic-billing","/directory?limit=20","/threads/count","/notifications/count"]},
      {persona:"teacher",token:teacher,paths:["/me/teaching","/school/timetable","/attendance/classes","/threads/count","/notifications/count"]},
      {persona:"guardian",token:guardian,paths:["/me/children?limit=20","/school/work-queues","/finance/invoices?limit=20","/threads/count","/notifications/count"]},
    ] as const;
    const samples=[];
    for(const entry of cases)for(const path of entry.paths)for(let iteration=0;iteration<3;iteration++){
      const started=performance.now();
      const {response}=await fixtureApi(school,path,{token:entry.token,persona:entry.persona});
      const timing=response.headers.get("server-timing")??"";
      assert.match(timing,/app;dur=\d+(\.\d+)?/);
      assert.match(timing,/auth;dur=\d+(\.\d+)?/);
      assert.match(timing,/db_calls;desc="[1-9]\d*"/);
      assert.match(response.headers.get("cache-control")??"",/private, no-store/);
      samples.push({persona:entry.persona,path,iteration,wallMs:Math.round(performance.now()-started),timing});
    }
    mkdirSync("qa-artifacts/performance",{recursive:true});
    writeFileSync("qa-artifacts/performance/api-samples.json",JSON.stringify({
      head:process.env.GITHUB_SHA??"local",environment:"isolated synthetic QA (Next dev)",samples
    },null,2)+"\n");
    console.log("Collected",samples.length,"protected API samples. Timing is diagnostic, not a production SLA.");
  }finally{await school.close();}
});
