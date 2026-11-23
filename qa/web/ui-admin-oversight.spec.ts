import {expect,test} from "@playwright/test";
import {localOrigin} from "../support/target";
import {schoolFixtures} from "../fixtures/school";
import {setUpCalendar} from "../fixtures/calendar";

test("Admin gets read-only oversight, not teacher grading actions",async({page,context})=>{
 const school=schoolFixtures();
 try{
  await school.seed();
  const admin=await school.bearer("admin","admin");
  await setUpCalendar(school,admin);
  await context.addCookies([
    {name:"madrasty-session",value:admin,url:localOrigin,httpOnly:true,sameSite:"Lax"},
    {name:"madrasty-csrf",value:"a".repeat(64),url:localOrigin,sameSite:"Lax"},
  ]);
  await page.goto("/de/school/more");
  await page.getByText("Unterricht und Anwesenheit",{exact:true}).click();
  await expect(page.getByRole("link",{name:"Unterricht im Blick"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Hausaufgaben korrigieren"})).toHaveCount(0);
  await page.getByRole("link",{name:"Unterricht im Blick"}).click();
  await expect(page.getByRole("heading",{name:"Unterricht im Blick"})).toBeVisible();
  await expect(page.getByText("Nur ansehen")).toBeVisible();
  await expect(page.getByRole("heading",{name:"Klassenübersicht"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Prüfung hinzufügen"})).toHaveCount(0);
  // The Admin must still reach an actual read-only exam list.
  await page.getByRole("link",{name:"Prüfungen ansehen"}).click();
  await expect(page.getByLabel("Fach, Klasse und Schuljahr")).toBeVisible();
  await expect(page.getByRole("button",{name:"Prüfung hinzufügen"})).toHaveCount(0);
 }finally{await school.close();}
});
