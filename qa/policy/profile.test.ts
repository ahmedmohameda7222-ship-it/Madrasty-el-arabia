import assert from "node:assert/strict";
import { test } from "node:test";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("guardian edits own emergency contact and approved child's birth date, never another child", async () => {
  const school = schoolFixtures();
  try {
    const ids = await school.references();
    const guardian = await school.bearer("guardian-ar", "guardian");
    const other = await school.bearer("guardian-other", "guardian");
    const teacher = await school.bearer("teacher", "teacher");
    const path = "/account/profile";
    const {payload:{data:profile}} = await fixtureApi(school,path,{token:guardian});
    assert.ok(profile.displayName);
    const child = profile.children.find((row: {id:string})=>row.id===ids.ahmed);
    assert.ok(child);
    const patch = (body:unknown, key:string, token=guardian, persona:"guardian"|"teacher"="guardian", status=200) =>
      fixtureApi(school,path,{token,persona,method:"PATCH",key:school.run+"."+key,body,status});
    const personal = {kind:"guardian",revision:profile.guardian.revision,birthDate:"1988-02-04",phone:"+4912345678",emergencyAddress:"Synthetic Street 1"};
    await patch(personal,"profile-own");
    const childInput = {kind:"child",id:child.id,revision:child.revision,birthDate:"2015-05-12",displayName:child.displayName};
    await patch(childInput,"profile-child");
    await patch(childInput,"profile-stale",guardian,"guardian",409);
    await patch(childInput,"profile-other",other,"guardian",404);
    await patch(childInput,"profile-teacher",teacher,"teacher",403);
    const {payload:{data:saved}} = await fixtureApi(school,path,{token:guardian});
    assert.equal(saved.guardian.birthDate,personal.birthDate);
    assert.equal(saved.guardian.phone,personal.phone);
    assert.equal(saved.guardian.emergencyAddress,personal.emergencyAddress);
    assert.equal(saved.children.find((row: {id:string})=>row.id===child.id).birthDate,childInput.birthDate);
    assert.ok(saved.children.find((row: {id:string})=>row.id===child.id).age>=0);
    const {payload:{data:otherProfile}} = await fixtureApi(school,path,{token:other});
    assert.ok(!otherProfile.children.some((row: {id:string})=>row.id===child.id));
    const {payload:{data:teacherProfile}}=await fixtureApi(school,path,{token:teacher});
    assert.ok(teacherProfile.displayName);
    assert.equal(teacherProfile.guardian,null);
    assert.deepEqual(teacherProfile.children,[]);
  } finally { await school.close(); }
});
