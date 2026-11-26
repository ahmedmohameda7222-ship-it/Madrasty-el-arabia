import { expect,test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { fixtureEmail } from "../support/target";

test("language switch keeps an unsaved family wizard and signed-in session",async({page,context})=>{
 test.setTimeout(90000);
 const school=schoolFixtures();
 try{
  await school.seed();
  await page.goto("/de/account/sign-in");
  await page.locator('input[name="email"]').fill(fixtureEmail(school.run,"admin"));
  await page.locator('input[name="password"]').fill(school.password);
  await page.getByRole("button",{name:"Anmelden",exact:true}).click();
  await expect(page).toHaveURL(/\/de\/account\/security$/,{timeout:20000});
  const enrolled=await school.localMfa("admin");
  await page.locator('input[name="code"]').fill(enrolled.code());
  await page.getByRole("button",{name:"Bestätigen",exact:true}).click();
  await expect(page.locator(".admin-start-actions a[href$='/students?add=family']")).toBeVisible({timeout:20000});
  await page.locator(".admin-start-actions a[href$='/students?add=family']").click();
  await expect(page.locator(".family-wizard")).toBeVisible();
  await page.getByRole("textbox",{name:"Familienname",exact:true}).fill("QA Unsent Family");
  await page.getByRole("combobox",{name:"Familiensituation (optional)"}).selectOption("divorced");
  await page.getByRole("button",{name:"Weiter",exact:true}).click();
  const field=page.locator('input[name="guardian1Name"]');
  await field.fill("QA Unsaved Parent");
  await page.locator('input[name="guardian1Email"]').fill("unsent@example.invalid");
  const url=page.url();
  await page.evaluate(()=>{(window as Window & {languageTestSentinel?:boolean}).languageTestSentinel=true;});
  await page.locator(".school-header").getByText("العربية",{exact:true}).click();
  await expect(page.locator("html")).toHaveAttribute("lang","ar");
  await expect(page.locator("html")).toHaveAttribute("dir","rtl");
  await expect(page.locator(".family-step-caption")).toContainText("2 / 5");
  await expect(field).toHaveValue("QA Unsaved Parent");
  await expect(page.locator('input[name="guardian1Email"]')).toHaveValue("unsent@example.invalid");
  expect(page.url()).toBe(url);
  expect(await page.evaluate(()=>(window as Window & {languageTestSentinel?:boolean}).languageTestSentinel)).toBe(true);
  await page.locator(".school-header").getByText("Deutsch",{exact:true}).click();
  await expect(page.locator("html")).toHaveAttribute("lang","de");
  await expect(field).toHaveValue("QA Unsaved Parent");
  await page.getByRole("button",{name:"Zurück",exact:true}).last().click();
  await expect(page.getByRole("textbox",{name:"Familienname",exact:true})).toHaveValue("QA Unsent Family");
  await expect(page.getByRole("combobox",{name:"Familiensituation (optional)"})).toHaveValue("divorced");
  await expect(page.locator(".school-nav")).toBeVisible();
 }finally{await school.close();}
});
