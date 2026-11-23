import assert from "node:assert/strict";
import { test } from "node:test";
import { directStaffAccountInput } from "../../packages/contracts/src/identity";

const base = {
  role: "teacher",displayName: "Sara",email: "sara@example.com",
  password: "real-password-2026",workPhone: null,correspondenceLocale: "de",capabilities: [],
};

test("a new teacher may be assigned a class and subject in the same operation", () => {
  const classId = "2d71a427-2ffa-4740-bfa4-308f34973fd0";
  const subjectId = "07f9999d-5dc2-479d-9c18-bf524b0fd11e";
  assert.equal(directStaffAccountInput.safeParse({...base,assignment:{classId,kind:"primary",subjectId}}).success,true);
  assert.equal(directStaffAccountInput.safeParse({...base,assignment:{classId,kind:"subject",subjectId}}).success,true);
  assert.equal(directStaffAccountInput.safeParse({...base,assignment:undefined}).success,true);
});

test("teacher assignment rejects incomplete subject and non-teacher roles",()=>{
  const classId = "2d71a427-2ffa-4740-bfa4-308f34973fd0";
  assert.equal(directStaffAccountInput.safeParse({...base,assignment:{classId,kind:"subject",subjectId:null}}).success,false);
  assert.equal(directStaffAccountInput.safeParse({...base,assignment:{classId,kind:"subject"}}).success,false);
  assert.equal(directStaffAccountInput.safeParse({...base,role:"admin",assignment:{classId,kind:"primary"}}).success,false);
  assert.equal(directStaffAccountInput.safeParse({...base,assignment:{classId:"invalid",kind:"primary"}}).success,false);
});
