import assert from "node:assert/strict";
import { test } from "node:test";
import { directStaffAccountInput,directStaffAccountSchema } from "../../packages/contracts/src/identity";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("only Hauptadmin can create an Admin; delegated staff manager can create a teacher directly",async()=>{
  const school=schoolFixtures();
  try {
    const office=await school.bearer("office","admin");
    const admin=await school.bearer("admin","admin");
    const finance=await school.bearer("finance","admin");
    const base={displayName:"QA Provisioned Staff",password:"QA-direct-secret-2026",workPhone:null,correspondenceLocale:"de",capabilities:[]};
    const roleAdmin={...base,role:"admin",email:`qa-${school.run}-denied-admin@madrasty.invalid`};
    await fixtureApi(school,"/staff/provision",{
      method:"POST",token:office,persona:"admin",body:roleAdmin,status:403,
    });
    await fixtureApi(school,"/staff/provision",{
      method:"POST",token:finance,persona:"admin",
      body:{...base,role:"teacher",email:`qa-${school.run}-denied-teacher@madrasty.invalid`},status:403,
    });
    const teacher=directStaffAccountInput.parse({
      ...base,role:"teacher",email:`qa-${school.run}-new-teacher@madrasty.invalid`,
    });
    const result=await fixtureApi(school,"/staff/provision",{
      method:"POST",token:office,persona:"admin",body:teacher,status:201,
    });
    const created=directStaffAccountSchema.parse(result.payload.data);
    assert.equal(created.role,"teacher");
    const profiles=(await fixtureApi(school,"/school/staff",{token:office})).payload.data;
    assert.equal(profiles.some((p:{id:string;accountId:string})=>p.id===created.staffId&&p.accountId===created.accountId),true);

    const nextAdmin=directStaffAccountInput.parse({
      ...base,role:"admin",email:`qa-${school.run}-created-admin@madrasty.invalid`,
      capabilities:["students.manage"],
    });
    const root=await fixtureApi(school,"/staff/provision",{
      method:"POST",token:admin,persona:"admin",body:nextAdmin,status:201,
    });
    assert.equal(directStaffAccountSchema.parse(root.payload.data).role,"admin");
  } finally {await school.close();}
});
