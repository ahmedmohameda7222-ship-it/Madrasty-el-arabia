import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const source=(path:string)=>readFileSync(path,"utf8");
describe("simplified finance navigation",()=>{
 it("exposes four finance entry points, preserving legacy routes",()=>{
   const page=source("apps/web/src/app/[locale]/school/[tab]/page.tsx");
   const finance=page.split('group="finance"')[1].split("</MoreGroup>")[0];
   expect(finance.match(/className="more-row"/g)).toHaveLength(4);
   for(const label of ["Finanzübersicht","Rechnungen","Zahlungen","Einstellungen"]) expect(finance).toContain(label);
   expect(finance).not.toContain("enrollment-stops");
 });
 it("prefers cash when it is available",()=>{
   expect(source("apps/web/src/features/finance/RecordPayment.tsx")).toContain('options.cashEnabled?"cash":"bank"');
 });
});
