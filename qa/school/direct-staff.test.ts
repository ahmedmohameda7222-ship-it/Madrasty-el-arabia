import assert from "node:assert/strict";
import { test } from "node:test";
import { directStaffAccountInput,directStaffAccountSchema } from "../../packages/contracts/src/identity";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("only Hauptadmin can create an Admin; delegated staff manager can create a teacher directly",async()=>{
  const school=schoolFixtures();
  try {
    await school.seed();
    const office=await school.bearer("office","admin");
    const admin=await school.bearer("admin","admin");
    const finance=await school.bearer("finance","admin");
    // Staff provisioning is a narrow capability, not classroom/profile administration.
    await fixtureApi(school,"/school/staff",{token:office,status:403});
    await fixtureApi(school,"/school/subjects",{token:office,status:403});
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
    const profiles=(await fixtureApi(school,"/school/staff",{token:admin})).payload.data;
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

test("Hauptadmin provisions a teacher with full class responsibility and a subject atomically",async()=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const admin=await school.bearer("admin","admin");
    const {year,command}=await setUpCalendar(school,admin);
    const classroom=await command("/school/classes","staff-onboarding-class",{
      yearId:year.id,code:"QA_STAFF_ONBOARD",nameAr:"فصل مدرس جديد",nameDe:"Neue Lehrkraft",capacity:20,
    });
    const subjects=(await fixtureApi(school,"/school/subjects",{token:admin})).payload.data as {id:string;code:string}[];
    const fiqh=subjects.find(s=>s.code==="FIQH");
    assert.ok(fiqh);
    const teacher=directStaffAccountInput.parse({
      role:"teacher",displayName:"Test Teacher Full Class",email:`qa-${school.run}-class-teacher@madrasty.invalid`,
      password:"permanent-school-password-2026",workPhone:null,correspondenceLocale:"de",capabilities:[],
      assignment:{classId:classroom.id,kind:"primary",subjectId:fiqh.id},
    });
    const created=directStaffAccountSchema.parse((await fixtureApi(school,"/staff/provision",{
      method:"POST",token:admin,persona:"admin",body:teacher,status:201,
    })).payload.data);
    const linked=(await fixtureApi(school,`/school/classes/${classroom.id}/assignments`,{token:admin})).payload.data as {
      kind:string;staffId:string;subjectId:string|null;capabilities:string[];revoked:boolean
    }[];
    const primary=linked.find(a=>a.staffId===created.staffId&&a.kind==="primary");
    const subject=linked.find(a=>a.staffId===created.staffId&&a.kind==="subject");
    assert.ok(primary);assert.ok(subject);
    assert.equal(subject.subjectId,fiqh.id);
    assert.deepEqual(new Set(primary.capabilities),new Set([
      "attendance.read","attendance.mark","attendance.approve","academics.plan",
      "academics.log","academics.grade","academics.publish","comms.class",
    ]));
    assert.equal(subject.capabilities.includes("attendance.mark"),false);
    assert.equal(subject.capabilities.includes("academics.grade"),true);

    const staffOnly=await school.bearer("office","admin");
    await fixtureApi(school,"/staff/provision",{
      method:"POST",token:staffOnly,persona:"admin",
      body:{...teacher,email:`qa-${school.run}-denied-assignment@madrasty.invalid`},status:403,
    });
  }finally{await school.close();}
});
