import { expect, test } from "@playwright/test";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

test("the admin dashboard opens real workflows and a new pupil remains selected during enrollment", async ({ page, context }) => {
  test.setTimeout(75_000);
  const school = schoolFixtures();
  try {
    const token = await school.bearer("admin","admin");
    const {year,apple} = await setUpCalendar(school, token);
    await context.addCookies([
      {name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"},
      {name:"madrasty-csrf",value:"a".repeat(64),url:localOrigin,sameSite:"Lax"},
    ]);
    await page.goto("/de/school/home");
    await expect(page.locator(".school-overview-metrics dt")).toHaveText(["Schüler","Klassen","Lehrkräfte"]);
    await page.getByRole("link",{name:"Sorgeberechtigte hinzufügen",exact:true}).click();
    await expect(page).toHaveURL(/\/de\/school\/students\?add=guardian$/);
    await expect(page.getByRole("textbox",{name:"E-Mail-Adresse",exact:true})).toBeVisible();
    await page.goto("/de/school/students?add=student");
    const name = "QA Guided Pupil " + Date.now();
    await page.getByRole("textbox",{name:"Name",exact:true}).fill(name);
    await page.getByRole("button",{name:"Speichern",exact:true}).click();
    const enrollment = page.getByRole("link",{name:"In eine Klasse einschreiben",exact:true});
    await expect(enrollment).toBeVisible();
    const studentUrl = new URL(page.url());
    expect(studentUrl.searchParams.get("student")).toMatch(/^[0-9a-f-]{36}$/);
    await enrollment.click();
    await page.getByRole("combobox",{name:"Schuljahr",exact:true}).selectOption(year.id);
    await page.getByRole("combobox",{name:"Klassen",exact:true}).selectOption(apple.id);
    await expect(page.getByRole("checkbox",{name:new RegExp(name)})).toBeChecked();
    await page.getByRole("link",{name:"Nachrichten",exact:true}).click();
    await expect(page).toHaveURL("/de/school/messages");
    await page.goBack();
    await expect(page.getByRole("combobox",{name:"Klassen",exact:true})).toHaveValue(apple.id);
    await expect(page.getByRole("checkbox",{name:new RegExp(name)})).toBeChecked();
  } finally {
    await school.close();
  }
});

test("a finance-only administrator has no pupil navigation or school-wide pupil count",async ({page,context})=>{
  const school = schoolFixtures();
  try {
    const token = await school.bearer("finance","admin");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.goto("/de/school/more");
    await expect(page.getByRole("heading",{name:"Mehr",exact:true})).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link",{name:"Schüler",exact:true})).toHaveCount(0);
    await page.goto("/de/school/home");
    await expect(page.getByRole("link",{name:"Rechnungen ausstellen",exact:true})).toBeVisible({timeout:15_000});
    await expect(page.locator(".school-overview-metrics")).toHaveCount(0);
  } finally {
    await school.close();
  }
});
