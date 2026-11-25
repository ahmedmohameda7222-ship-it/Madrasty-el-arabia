import assert from "node:assert/strict";
import {test} from "node:test";
import {schoolFixtures} from "../fixtures/school";
import {fixtureApi} from "../support/api";
test("separated family membership never grants unselected child access",async()=>{
 const school=schoolFixtures();
 try{
 await school.seed();const token=await school.bearer("admin","admin");
 const body={displayName:"QA Independent Family "+school.run,situation:"divorced",guardians:[{displayName:"QA Father",contactEmail:null,contactPhone:null,correspondenceLocale:"de"},{displayName:"QA Mother",contactEmail:null,contactPhone:null,correspondenceLocale:"ar"}],children:[{displayName:"QA Child One",guardianLinks:[{guardianIndex:0,relationship:"father",approved:true},{guardianIndex:1,relationship:"mother",approved:false}]},{displayName:"QA Child Two",guardianLinks:[{guardianIndex:1,relationship:"mother",approved:true}]}]};
 const root={method:"POST",token,persona:"admin",status:[200,201],key:school.run+".separated-family",body} as const;
 const result=(await fixtureApi(school,"/school/families",root)).payload.data;
 assert.ok(result.familyId);
 assert.deepEqual((await fixtureApi(school,"/school/families",root)).payload.data,result);
 const family=(await fixtureApi(school,"/school/families/"+result.familyId,{token})).payload.data;
 assert.equal(family.situation,"divorced");assert.equal(family.guardianCount,2);assert.equal(family.childCount,2);assert.equal(family.links.length,3);
 assert.equal(family.links.filter((l:{state:string})=>l.state==="approved").length,2);
 assert.equal(family.links.some((l:{guardianId:string;studentId:string})=>l.guardianId===result.guardianIds[0]&&l.studentId===result.children[1].id),false);
 const teacher=await school.bearer("teacher","teacher");
 await fixtureApi(school,"/school/families/"+result.familyId,{token:teacher,persona:"teacher",status:403});
 const guardian=await school.bearer("guardian-de","guardian");
 await fixtureApi(school,"/school/families/"+result.familyId,{token:guardian,persona:"guardian",status:403});
 }finally{await school.close();}
});
