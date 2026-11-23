import { expect, test } from "@playwright/test";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

test("family-first dashboard opens one guardian-and-children form with optional class selection", async ({ page, context }) => {
  test.setTimeout(75_000);
  const school = schoolFixtures();
  try {
    await school.seed();
    const token = await school.bearer("admin","admin");
    const {year,command} = await setUpCalendar(school, token);
    const apple = await command("/school/classes","guided-family-class",{
      yearId:year.id,code:"QA_GUIDED_FAMILY",nameAr:"عائلة اختبار الواجهة",nameDe:"UI Familienklasse",capacity:10,
    });
    await context.addCookies([
      {name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"},
      {name:"madrasty-csrf",value:"a".repeat(64),url:localOrigin,sameSite:"Lax"},
    ]);
    await page.goto("/de/school/home");
    await expect(page.locator(".school-overview-metrics dt")).toHaveText(["Schüler","Klassen","Lehrkräfte"]);
    await page.getByRole("link",{name:"Neue Familie hinzufügen",exact:true}).first().click();
    await expect(page).toHaveURL(/students\?add=family$/);
    await expect(page.getByRole("heading",{name:"Neue Familie hinzufügen",exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"Schüler hinzufügen",exact:true})).toHaveCount(0);
    const seed=Date.now();
    await page.locator('input[name="guardian1Name"]').fill("QA Family "+seed);
    await page.locator('input[name="guardian1Email"]').fill(`qa-family-${seed}@madrasty.invalid`);
    await page.getByRole("combobox",{name:"Schuljahr für die Klassenauswahl"}).selectOption(year.id);
    await page.getByRole("textbox",{name:"Name",exact:true}).last().fill("QA Child "+seed);
    await page.getByRole("combobox",{name:"Klasse (optional)"}).selectOption(apple.id);
    await page.getByRole("button",{name:"Familie und Kinder speichern",exact:true}).click();
    await expect(page).toHaveURL(/guardian=[0-9a-f-]{36}/);
    await expect(page.getByRole("heading",{name:"Kind zur Familie hinzufügen",exact:true})).toBeVisible();
    await expect(page.getByText("QA Child "+seed)).toBeVisible();
    await page.getByRole("link",{name:"Nachrichten",exact:true}).click();
    await expect(page).toHaveURL("/de/school/messages");
  } finally { await school.close(); }
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

test("an invitation-only administrator can provision teachers without school administration access",async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const token=await school.bearer("office","admin");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.goto("/de/school/more/assignments");
    await expect(page.getByRole("heading",{name:"Lehrkraft hinzufügen"}).first()).toBeVisible();
    await expect(page.getByRole("textbox",{name:"E-Mail-Adresse"})).toBeVisible();
    await expect(page.getByRole("button",{name:"Admin hinzufügen"})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Klasseneinsätze"})).toHaveCount(0);
  }finally{await school.close();}
});
