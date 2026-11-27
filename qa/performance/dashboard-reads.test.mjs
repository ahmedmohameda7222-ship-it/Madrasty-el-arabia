import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = path => readFileSync(new URL("../../apps/web/src/" + path, import.meta.url), "utf8");

test("dashboard counts use a batched fast path and retain individual savepoint recovery", () => {
  const service = source("server/school/work-queues.ts");
  assert.match(service, /async function countWorkQueues/);
  assert.match(service, /unnest\(\$\{scoped\.array\(\[\.\.\.eligible\]\)\}/);
  assert.match(service, /await countWorkQueues\(tx,eligible,date\.asOf\)/);
  assert.match(service, /catch[\s\S]*?for\(const key of eligible\)/);
  assert.match(service, /state:"unavailable"/);
});

test("shared read hooks opt into in-flight deduplication only for initial reads", () => {
  for (const [file, counter] of [["features/school/timetable/shared.tsx","attempt"],["features/academics/shared.tsx","retry"]]) {
    const code = source(file);
    assert.match(code, new RegExp("refresh===0&&"+counter+"===0"));
    assert.match(code, /requestInitialRead\(scope,path,schema,persona,abort\.signal\)/);
  }
  assert.match(source("api/client.ts"), /readFlights\.invalidate\(\)/);
});

test("identical reads share one network operation and completed results are never cached", async () => {
  const { createReadFlights } = await import("../../apps/web/src/api/read-flight.ts");
  const reads = createReadFlights();
  const schema = {};
  let calls = 0;
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const work = async () => { calls++; await gate; return calls; };
  const a = reads.read(schema,"one",new AbortController().signal,work);
  const b = reads.read(schema,"one",new AbortController().signal,work);
  await Promise.resolve();
  assert.equal(calls,1);
  finish();
  assert.deepEqual(await Promise.all([a,b]),[1,1]);
  assert.equal(await reads.read(schema,"one",new AbortController().signal,work),2);
});

test("read flights isolate account scopes and schemas and allow fresh requests after a write", async () => {
  const { createReadFlights } = await import("../../apps/web/src/api/read-flight.ts");
  const reads = createReadFlights();
  const schema = {};
  let calls = 0;
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const work = async () => { const value=++calls; await gate; return value; };
  const a=reads.read(schema,"account-a",new AbortController().signal,work);
  const b=reads.read(schema,"account-b",new AbortController().signal,work);
  const c=reads.read({},"account-a",new AbortController().signal,work);
  reads.invalidate();
  const d=reads.read(schema,"account-a",new AbortController().signal,work);
  await Promise.resolve();
  assert.equal(calls,4);
  finish();
  assert.deepEqual(await Promise.all([a,b,c,d]),[1,2,3,4]);
});

test("canceling one subscriber does not abort another; final cancellation aborts the request", async () => {
  const { createReadFlights } = await import("../../apps/web/src/api/read-flight.ts");
  const reads=createReadFlights();
  const schema={};
  const first=new AbortController(), second=new AbortController();
  let underlying;
  let finish;
  const work=signal=>{ underlying=signal; return new Promise((resolve,reject)=>{
    finish=resolve;
    signal.addEventListener("abort",()=>reject(signal.reason),{once:true});
  }); };
  const a=reads.read(schema,"same",first.signal,work);
  const b=reads.read(schema,"same",second.signal,work);
  await Promise.resolve();
  first.abort();
  await assert.rejects(a);
  assert.equal(underlying.aborted,false);
  finish("ok");
  assert.equal(await b,"ok");

  const third=new AbortController();
  const c=reads.read(schema,"same",third.signal,work);
  await Promise.resolve();
  third.abort();
  await assert.rejects(c);
  assert.equal(underlying.aborted,true);
});

test("pre-aborted requests do not start a flight", async () => {
  const { createReadFlights }=await import("../../apps/web/src/api/read-flight.ts");
  const controller=new AbortController();
  controller.abort();
  let called=false;
  await assert.rejects(createReadFlights().read({},"one",controller.signal,async()=>{called=true;}));
  assert.equal(called,false);
});
