import assert from "node:assert/strict";
import {test} from "node:test";
import {readFinanceReportContext,writeFinanceReportContext} from "../../apps/web/src/features/finance/report-context";

test("staff financial report filters survive a return to the page without leaking stale cutoff",()=>{
  const context={period:"2026-11",classId:"d62b76b6-3c0d-45fd-8905-33cc20bc0c4e",status:"overdue" as const,
    asOf:"2026-11-22",receivedFrom:"2026-11-01",receivedThrough:"2026-11-22",cutoff:"2026-11-22T12:00:00Z"};
  const written=writeFinanceReportContext(new URLSearchParams("view=summary"),context);
  const restored=readFinanceReportContext(written);
  assert.equal(restored.period,context.period);
  assert.equal(restored.classId,context.classId);
  assert.equal(restored.status,context.status);
  assert.equal(restored.receivedFrom,context.receivedFrom);
  assert.equal(restored.receivedThrough,context.receivedThrough);
  assert.equal(restored.cutoff,undefined);
  assert.equal(written.get("view"),"summary");
  assert.equal(written.has("cutoff"),false);
});

test("clearing the student and status removes only their URL keys",()=>{
  const current=new URLSearchParams("student=bd31c520-d3e2-4d1d-ac3e-bc345ff7bb3b&status=paid&period=2026-10");
  const next=writeFinanceReportContext(current,{period:"2026-10"});
  assert.equal(next.toString(),"period=2026-10");
});

test("invalid or reversed finance date filters are never restored",()=>{
  const invalid=new URLSearchParams("receivedFrom=2026-¶»§q«^