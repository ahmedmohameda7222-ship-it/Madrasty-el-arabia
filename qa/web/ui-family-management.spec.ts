import {expect,test} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {schoolFixtures} from "../fixtures/school";
import {localOrigin} from "../support/target";
import {fixtureApi} from "../support/api";
for(const locale of ["de","ar"] as const)for(const width of [320,390,430])for(const colorScheme of ["light","dark"] as const){
 test(`family mobile ${locale} ${width} ${colorScheme}`,async({page,context})=>{
  const school=schoolFixtures();try{
   await school.seed();const token=await school.bearer("admin","admin");
   const name="QA Family "+locale+" "+width+" "+colorScheme+" "+crypto.randomUUID().slice(0,6);
   const {payload}=await fixtureApi(school,"/school/families",{token,persona:"admin",method:"POST",status:201,key:crypto.randomUUID(),body:{displayName:name,situation:"separated",guardians:[{displayName:"QA Parent",contactEmail:null,contactPhone:null,correspondenceLocale:locale}],children:[{displayName:"QA Child",guardianLinks:[{guardianIndex:0,relationship:"mother",approved:true}]}]}});
   await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"},{name:"madrasty-csrf",value:"a".repeat(64),url:localOrigin,sameSite:"Lax"}]);await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme});
   await page.goto(`/${locale}/school/students?view=guardians`);
   // The initial API-backed list proves hydration is complete before typing into the controlled input.
   await expect(page.getByText(name,{exact:true})).toBeVisible({timeout:30000});
   const searchResponse=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname.endsWith("/school/families")&&url.searchParams.get("query")===name&&response.ok();});
   await page.getByRole("searchbox").fill(name);
   await searchResponse;
   await expect(page.locator(".family-directory-list .family-list li")).toHaveCount(1);await expect(page.getByText(name,{exact:true})).toBeVisible();
   mkdirSync("qa-artifacts/family",{recursive:true});const prefix=`qa-artifacts/family/${locale}-${width}-${colorScheme}`;
   const noOverflow=async()=>expect(await page.locator(".family-workspace").evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBeTruthy();
   await noOverflow();await page.screenshot({path:prefix+"-list.png",animations:"disabled"});
   await page.getByText(name,{exact:true}).click();await expect(page).toHaveURL(new RegExp("family="+payload.data.familyId));
   await expect(page.getByText("QA Child",{exact:true}).first()).toBeVisible();await noOverflow();await expect(page.locator(".family-profile-header h1")).toBeVisible();
   expect(await page.locator(".family-profile-header h1").evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(width-130);
   await page.screenshot({path:prefix+"-profile.png",animations:"disabled"});
   await page.locator(".school-content").evaluate(el=>el.scrollTop=el.scrollHeight);await page.screenshot({path:prefix+"-profile-bottom.png",animations:"disabled"});
   await page.goto(`/${locale}/school/students?add=family`);await expect(page.locator(".family-wizard")).toBeVisible();await noOverflow();await page.screenshot({path:prefix+"-wizard.png",animations:"disabled"});
   const next=page.getByRole("button",{name:locale==="ar"?"التالي":"Weiter",exact:true});
   await page.getByRole("textbox",{name:locale==="ar"?"اسم الأسرة":"Familienname",exact:true}).fill(name+" New");await next.click();
   await page.locator('input[name="guardian1Name"]').fill("QA Adult");await noOverflow();await page.screenshot({path:prefix+"-guardian.png",animations:"disabled"});await next.click();
   await page.getByRole("textbox",{name:locale==="ar"?"الاسم":"Name",exact:true}).last().fill("QA Student");await noOverflow();await page.screenshot({path:prefix+"-child.png",animations:"disabled"});await next.click();
   await page.getByRole("combobox",{name:locale==="ar"?"الوصول إلى بيانات الطفل":"Zugang zum Kind",exact:true}).selectOption("approved");
   await page.getByRole("combobox",{name:locale==="ar"?"العلاقة بالطفل":"Beziehung zum Kind",exact:true}).selectOption("father");await noOverflow();await page.screenshot({path:prefix+"-links.png",animations:"disabled"});await next.click();await noOverflow();await page.screenshot({path:prefix+"-review.png",animations:"disabled"});
   await expect(page.locator(".family-step-track li[aria-current=step] span")).toHaveText("5");
   await expect(page.locator(".family-review-card")).toContainText("QA Student");
   await expect(page.locator(".family-wizard .family-wizard-actions .primary-button")).toBeDisabled();
   // Registration review above and import below are independent admin workflows.
   // Do not force a hard navigation away from an unsaved form while WebKit is
   // completing its final form event. The guided-workflows test exercises save.
   const importPage=await context.newPage();
   try{
   await importPage.setViewportSize({width,height:844});await importPage.emulateMedia({colorScheme});
   const importNoOverflow=async()=>expect(await importPage.locator(".family-workspace").evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBeTruthy();
   await importPage.goto(`/${locale}/school/students/import`);await expect(importPage.locator(".family-import")).toBeVisible();await importNoOverflow();await importPage.screenshot({path:prefix+"-import.png",animations:"disabled"});
   const id=crypto.randomUUID();
   const csv="familyKey,familyName,childKey,childName,guardianKey,guardianName,email,communicationLocale\n"+[id,"QA Import "+id.slice(0,6),id+"-c","QA Imported Child",id+"-g","QA Imported Parent",id+"@madrasty.invalid",locale].join(",");
   await importPage.locator('input[type="file"]').setInputFiles({name:"family.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
   await importPage.getByRole("button",{name:locale==="ar"?"رفع الملف":"Datei hochladen",exact:true}).click();
   await expect(importPage.locator(".family-import h2")).toHaveText(locale==="ar"?"مطابقة الأعمدة":"Spalten zuordnen",{timeout:30000});await importNoOverflow();await importPage.screenshot({path:prefix+"-import-mapping.png",animations:"disabled"});
   await importPage.getByRole("button",{name:locale==="ar"?"معاينة البيانات":"Vorschau anzeigen",exact:true}).click();
   await expect(importPage.locator(".family-import h2")).toHaveText(locale==="ar"?"مراجعة الصفوف":"Zeilen prüfen",{timeout:30000});await importNoOverflow();await expect(importPage.locator(".family-import-counts dd")).toHaveCount(6);
   expect(await importPage.locator(".family-import-confirm").evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
   await importPage.screenshot({path:prefix+"-import-review.png",animations:"disabled"});
   await importPage.reload();await expect(importPage.locator(".family-import h2")).toHaveText(locale==="ar"?"مراجعة الصفوف":"Zeilen prüfen",{timeout:30000});
   await importPage.getByRole("checkbox",{name:locale==="ar"?"راجعت روابط الطلاب وأولياء الأمور.":"Ich habe die Verknüpfungen geprüft."}).check();
   await importPage.getByRole("button",{name:locale==="ar"?"اعتماد الصفوف":"Zeilen übernehmen",exact:true}).click();
   await expect(importPage.locator(".family-import h2")).toHaveText(locale==="ar"?"نتيجة الاستيراد":"Importergebnis",{timeout:30000});await importNoOverflow();await expect(importPage.locator(".family-import-receipt dd")).toHaveText(["1","1","1"]);await importPage.screenshot({path:prefix+"-import-receipt.png",animations:"disabled"});
   await importPage.reload();await expect(importPage.locator(".family-import h2")).toHaveText(locale==="ar"?"نتيجة الاستيراد":"Importergebnis",{timeout:30000});
   }finally{await importPage.close();}
  }finally{await school.close();}
 });
}
