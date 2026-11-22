import assert from "node:assert/strict";
import {test} from "node:test";
import {readGradebookContext,writeGradebookContext} from "../../apps/web/src/features/academics/gradebook-context";

test("opening and closing a grading sheet keeps class selection and unrelated context",()=>{
  const base=new URLSearchParams("class=class-1&return=dashboard");
  const detail=writeGradebookContext(base,{workId:"task-1"});
  assert.deepEqual(readGradebookContext(detail),{classId:"class-1",workId:"task-1"});
  assert.equal(detail.get("return"),"dashboard");
  const back=writeGradebookContext(detail,{workId:""});
  assert.deepEqual(readGradebookContext(back),{classId:"class-1",workId:""});
  assert.equal(back.get("return"),"dashboard");
  assert.equal(base.get("work"),null);
});

test("clearing a grading class removes it while preserving deep-linked work",()=>{
  const updated=writeGradebookContext(new URLSearchParams("class=class-1&work=task-1"),{classId:""});
  assert.equal(updated.toString(),"work=task-1");
});
