import assert from "node:assert/strict";
import { test } from "node:test";
import { createFamilyInput, createdFamilySchema, createFamilyChildInput, studentSchema } from "../../packages/contracts/src/school/families";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("family onboarding creates approved guardian links and optional classroom enrollments atomically",async()=>{
  const school=schoolFixtures();
  try {
    const token=await school.bearer("admin","admin");
    const {apple,berry}=await setUpCalendar(school,token);
    const root={method:"POST",token,persona:"admin",status:[200,201]} as const;
    const body=createFamilyInput.parse({
      guardians:[
        {displayName:"QA Family Father",contactEmail:`qa-${school.run}-father@madrasty.invalid`,contactPhone:null,correspondenceLocale:"ar"},
        {displayName:"QA Family Mother",contactEmail:`qa-${school.run}-mother@madrasty.invalid`,contactPhone:null,correspondenceLocale:"de"},
      ],
      children:[{displayName:"QA Family Child One",classId:apple.id},{displayName:"QA Family Child Two",classId:null}],
    });
    const key=`${school.run}.family-create`;
    const {payload}=await fixtureApi(school,"/school/families",{...root,key,body});
    const output=createdFamilySchema.parse(payload.data);
    assert.equal(output.guardianIds.length,2);
    assert.equal(output.children.length,2);
    const replay=(await fixtureApi(school,"/school/families",{...root,key,body})).payload.data;
    assert.deepEqual(replay,output);
    for(const guardianId of output.guardianIds){
      const {payload:record}=await fixtureApi(school,`/school/guardians/${guardianId}`,{token});
      assert.equal(record.data.links.length,2);
      assert.ok(record.data.links.every((link:{state:string})=>link.state==="approved"));
    }
    const first=output.children[0],second=output.children[1];
    const getClasses=async(studentId:string)=>(await fixtureApi(school,`/school/students/${studentId}/enrollments`,{token})).payload.data;
    assert.equal((await getClasses(first.id)).some((entry:{classId:string})=>entry.classId===apple.id),true);
    assert.equal((await getClasses(second.id)).length,0);
    const created=(await fixtureApi(school,`/school/families/${output.guardianIds[0]}/children`,{
      ...root,key:`${school.run}.family-child`,
      body:createFamilyChildInput.parse({displayName:"QA Family Third",classId:berry.id}),
    })).payload.data;
    const third=studentSchema.parse(created);
    assert.equal((await getClasses(third.id)).some((entry:{classId:string})=>entry.classId===berry.id),true);
    const {payload:primary}=await fixtureApi(school,`/school/guardians/${output.guardianIds[0]}`,{token});
    const {payload:secondary}=await fixtureApi(school,`/school/guardians/${output.guardianIds[1]}`,{token});
    assert.equal(primary.data.links.length,3);
    // Co-guardian selection for a blended family must be explicit; do not infer from siblings.
    assert.equal(secondary.data.links.length,2);
    const teacher=await school.bearer("teacher","teacher");
    await fixtureApi(school,"/school/families",{
      method:"POST",token:teacher,persona:"teacher",key:`${school.run}.teacher-forbidden`,body,status:403,
    });
  } finally {await school.close();}
});

test("family admission rejects absent children and does not persist partial guardian records",async()=>{
  const school=schoolFixtures();
  try {
    const token=await school.bearer("admin","admin");
    const guard={displayName:"Invalid Family",contactEmail:`qa-${school.run}-invalid@madrasty.invalid`,contactPhone:null,correspondenceLocale:"de"};
    await fixtureApi(school,"/school/families",{
      method:"POST",token,persona:"admin",key:`${school.run}.missing-child`,
      body:{guardians:[guard],children:[]},status:422,
    });
    const {payload}=await fixtureApi(school,"/school/guardians?query=Invalid%20Family",{token});
    assert.equal(payload.data.some((entry:{displayName:string})=>entry.displayName==="Invalid Family"),false);
  } finally {await school.close();}
});
