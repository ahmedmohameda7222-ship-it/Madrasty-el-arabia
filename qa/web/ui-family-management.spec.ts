import {expect,test} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {schoolFixtures} from "../fixtures/school";
import {localOrigin} from "../support/target";
import {fixtureApi} from "../support/api";
for(const locale of ["de","ar"] as const)for(const width of [320,390,430])for(const colorScheme of ["light","dark"] as const){
 test(`family mobile ${locale} ${width} ${colorScheme}`,async({page,context})=>{
  const school=schoolFixtures();try{
   await school.seed();const token=await school.bearer("admin","admin");
   const name="QA Family "+locale+" "+width+" "+colorScheme;
   const {payload}=await fixtureApi(school,"/school/families",{token,persona:"admin",method:"POST",status:201,key:crypto.randomUUID(),body:{displayName:name,situation:"separated",guardians:[{displayName:"QA Parent",contactEmail:null,contactPhone:null,correspondenceLocale:locale}],children:[{displayName:"QA Child",guardianLinks:[{guardianIndex:0,relationship:"mother",approved:true}]}]}});
   await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme});
   await page.goto(`/${locale}/school/students?view=guardians`);
   await expect(page.getByText(name,{exact:true})).toBeVisible();
   mkdirSync("qa-artifacts/family",{recursive:true});const prefix=`qa-artifacts/family/${locale}-${width}-${colorScheme}`;
   const noOverflow=async()=>expect(await page.locator(".family-workspace").evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBeTruthy();
   await noOverflow();await page.screenshot({path:prefix+"-list.png",animations:"disabled"});
   await page.getByText(name,{exact:true}).click();await expect(page).toHaveURL(new RegExp("family="+payload.data.familyId));
   await expect(page.getByText("QA Child",{exact:true}).first()).toBeVisible();await noOverflow();await page.screenshot({path:prefix+"-profile.png",animations:"disabled"});
   await page.goto(`/${locale}/school/students?add=family`);await expect(page.locator(".family-wizard")).toBeVisible();await noOverflow();await page.screenshot({path:prefix+"-wizard.png",animations:"disabled"});
  }finally{await school.close();}
 });
}
