import {expect,test} from "@playwright/test";
import {schoolFixtures} from "../fixtures/school";
import {fixtureApi} from "../support/api";
import {setUpCalendar} from "../fixtures/calendar";
import {localOrigin} from "../support/target";
import {randomUUID} from "node:crypto";

test("switching UI language preserves family wizard, values, route and session",async({page,context})=>{
 const school=schoolFixtures();try{
 await school.seed();const token=await school.bearer("admin","admin");
 await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
 await page.goto("/de/school/students?add=family");await expect(page.locator(".family-wizard")).toBeVisible();
 await page.getByRole("textbox",{name:"Familienname",exact:true}).fill("QA أسرة Müller");
 await page.getByRole("button",{name:"Weiter",exact:true}).click();
 await page.locator('input[name="guardian1Name"]').fill("QA ولي أمر");
 await page.locator('input[name="guardian1Email"]').fill("draft@example.invalid");
 await page.evaluate(()=>{(window as Window & {qaDocument?:string}).qaDocument="same";});
 const before=page.url();
 await page.locator(".school-header [lang=ar]").click();
 await expect(page.locator("html")).toHaveAttribute("lang","ar");
 await expect(page.locator(".family-step-track [aria-current=step] span")).toHaveText("2");
 await expect(page.locator('input[name="guardian1Name"]')).toHaveValue("QA ولي أمر");
 await expect(page.locator('input[name="guardian1Email"]')).toHaveValue("draft@example.invalid");
 expect(page.url()).toBe(before);
 expect(await page.evaluate(()=>(window as Window & {qaDocument?:string}).qaDocument)).toBe("same");
 await page.locator(".school-header [lang=de]").click();
 await expect(page.locator("html")).toHaveAttribute("lang","de");
 await expect(page.locator('input[name="guardian1Name"]')).toHaveValue("QA ولي أمر");
 await page.getByRole("button",{name:"Zurück",exact:true}).last().click();
 await expect(page.getByRole("textbox",{name:"Familienname",exact:true})).toHaveValue("QA أسرة Müller");
 expect((await context.cookies()).find(c=>c.name==="madrasty-session")?.value).toBe(token);
 }finally{await school.close();}
});

test("unsent chat stays in the same conversation after switching the interface",async({page,context})=>{
 const school=schoolFixtures();try{
 await school.seed();const admin=await school.bearer("admin","admin");await setUpCalendar(school,admin);
 const token=await school.bearer("guardian-de","guardian");
 const contacts=(await fixtureApi(school,"/directory",{token})).payload.data;
 const target=contacts.find((c:{displayName:string})=>c.displayName==="يوسف عبد الرحمن محمود").target;
 const thread=(await fixtureApi(school,"/threads",{token,persona:"guardian",method:"POST",key:randomUUID(),body:{target}})).payload.data.threadId;
 await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
 await page.goto("/de/school/messages?thread="+thread);
 const field=page.locator(".comms-composer textarea");await expect(field).toBeVisible();await field.fill("Nicht gesendet — رسالة غير مرسلة");
 const before=page.url();
 await page.locator(".school-header [lang=ar]").click();
 await expect(page.locator("html")).toHaveAttribute("dir","rtl");
 await expect(field).toHaveValue("Nicht gesendet — رسالة غير مرسلة");expect(page.url()).toBe(before);
 await page.locator(".school-header [lang=de]").click();await expect(page.locator("html")).toHaveAttribute("dir","ltr");
 await expect(field).toHaveValue("Nicht gesendet — رسالة غير مرسلة");
 }finally{await school.close();}
});
