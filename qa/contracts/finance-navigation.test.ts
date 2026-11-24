import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {describe,it} from "node:test";
const source=(path:string)=>readFileSync(path,"utf8");
describe("simplified finance navigation",()=>{
 it("exposes four finance entry points, preserving legacy routes",()=>{
   const page=source("apps/web/src/app/[locale]/school/[tab]/page.tsx");
   const finance=page.split('group="finance"')[1].split("</MoreGroup>")[0];
   assert.equal(finance.match(/className="more-row"/g)?.length,4);
   for(const label of ["Finanzübersicht","Rechnungen","Zahlungen","Einstellungen"]) assert.ok(finance.includes(label));
   assert.ok(!finance.includes("enrollment-stops"));
 });
 it("prefers cash when it is available",()=>{
   assert.ok(source("apps/web/src/features/finance/RecordPayment.tsx").includes('options.cashEnabled?"cash":"bank"'));
 });
});
