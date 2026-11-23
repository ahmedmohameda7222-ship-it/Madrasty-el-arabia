import assert from "node:assert/strict";
import { test } from "node:test";
import { directoryEntrySchema } from "../../packages/contracts/src/account";
import { createFamilyInput, createFamilyChildInput } from "../../packages/contracts/src/school/families";
import { directStaffAccountInput } from "../../packages/contracts/src/identity";

const guardian={displayName:"Ahmed",contactEmail:"parent@example.com",contactPhone:null,correspondenceLocale:"de"};
test("family onboarding requires a guardian and child but permits a child without a class",()=>{
  const accepted=createFamilyInput.safeParse({guardians:[guardian],children:[{displayName:"Omar",classId:null}]});
  assert.equal(accepted.success,true);
  assert.equal(createFamilyInput.safeParse({guardians:[guardian],children:[]}).success,false);
  assert.equal(createFamilyInput.safeParse({guardians:[],children:[{displayName:"Omar",classId:null}]}).success,false);
  assert.equal(createFamilyInput.safeParse({guardians:[guardian],children:[{displayName:"Omar",classId:null},{displayName:"Mariam",classId:null}]}).success,true);
  assert.equal(createFamilyInput.safeParse({guardians:[guardian,guardian,guardian],children:[{displayName:"Omar"}]}).success,false);
});
test("existing family child creation allows optional class",()=>{
  assert.equal(createFamilyChildInput.safeParse({displayName:"Mariam",classId:null}).success,true);
  assert.equal(createFamilyChildInput.safeParse({displayName:"Mariam"}).success,true);
  assert.equal(createFamilyChildInput.safeParse({displayName:""}).success,false);
});
test("staff provisioning validates teacher/admin accounts and strong passwords",()=>{
  const staff={role:"teacher",displayName:"Sara",email:"sara@example.com",password:"strong-secret-123456",workPhone:null};
  assert.equal(directStaffAccountInput.safeParse(staff).success,true);
  assert.equal(directStaffAccountInput.safeParse({...staff,role:"admin"}).success,true);
  assert.equal(directStaffAccountInput.safeParse({...staff,role:"office"}).success,false);
  assert.equal(directStaffAccountInput.safeParse({...staff,password:"123"}).success,false);
});

test("directory accepts the direct Admin staff role returned by PostgreSQL",()=>{
  const id="07f9999d-5dc2-479d-9c18-bf524b0fd11e";
  const row={
    id, displayName:"QA Administrator",role:"admin",titleAr:"إدارة",titleDe:"Administration",
    workEmail:"admin@example.com",workPhone:null,contexts:[],target:{kind:"person",id},
  };
  assert.equal(directoryEntrySchema.safeParse(row).success,true);
});
