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

test("the team workspace uses a dark compact directory and offers permanent-password classroom onboarding",async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const token=await school.bearer("admin","admin");
    const {year,command}=await setUpCalendar(school,token);
    const classroom=await command("/school/classes","staff-ux-class",{
      yearId:year.id,code:"QA_TEAM_UI",nameAr:"فصل المدرس",nameDe:"Lehrkraft UI",capacity:15,
    });
    await context.addCookies([
      {name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"},
      {name:"madrasty-csrf",value:"a".repeat(64),url:localOrigin,sameSite:"Lax"},
    ]);
    await page.goto("/de/school/more/assignments");
    await expect(page.getByRole("heading",{name:"Lehrkräfte und Verwaltung"})).toBeVisible();
    await expect(page.getByRole("button",{name:"Klasseneinsätze",exact:true})).toHaveCount(0);
    await expect(page.getByText("♧")).toHaveCount(0);
    await page.getByRole("button",{name:"Lehrkraft hinzufügen",exact:true}).click();
    await expect(page.getByText(/Passwort ist dauerhaft, nicht temporär/)).toBeVisible();
    await expect(page.getByRole("combobox",{name:"Klasse (optional)"})).toBeVisible();
    await page.getByRole("combobox",{name:"Schuljahr"}).selectOption(year.id);
    await page.getByRole("combobox",{name:"Klasse (optional)"}).selectOption(classroom.id);
    await expect(page.getByText("Klassenlehrkraft",{exact:true})).toHaveCount(0);
    await expect(page.getByText("Fachlehrkraft",{exact:true})).toHaveCount(0);
    await expect(page.getByRole("combobox",{name:"Fach",exact:true})).toHaveCount(0);
    await expect(page.getByText("So funktioniert es jetzt")).toHaveCount(0);
    await expect(page.getByText("Lehrkräfte und Admins zentral verwalten. Klassenzuweisungen erfolgen direkt in der jeweiligen Klasse.")).toHaveCount(0);
    const teacherName="QA Volunteer "+Date.now();
    await page.locator('input[name="displayName"]').fill(teacherName);
    await page.locator('input[name="email"]').fill(`qa-${school.run}-volunteer@madrasty.invalid`);
    await page.locator('input[name="password"]').fill("QA-volunteer-permanent-2026");
    await page.getByRole("button",{name:"Konto erstellen"}).click();
    await expect(page.getByText(teacherName)).toBeVisible();
    await page.goto(`/de/school/more/classes?year=${year.id}&class=${classroom.id}`);
    await expect(page.getByRole("heading",{name:"Lehrkraft dieser Klasse"})).toBeVisible();
    await expect(page.getByText(teacherName)).toBeVisible();
    await expect(page.getByRole("button",{name:"Lehrkraft zuweisen"})).toHaveCount(0);
  }finally{await school.close();}
});

test("classroom teacher management lives inside Klassen und Einschreibungen",async({page,context})=>{
  const school=schoolFixtures();
  try{
    await school.seed();
    const token=await school.bearer("admin","admin");
    const {year,command}=await setUpCalendar(school,token);
    const room=await command("/school/classes","class-teachers-ui",{
      yearId:year.id,code:"QA_CLASS_TEAM",nameAr:"فصل المعلمين",nameDe:"Klassenlehrkräfte",capacity:20,
    });
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.goto(`/de/school/more/classes?year=${year.id}&class=${room.id}`);
    await expect(page.getByRole("heading",{name:"Lehrkraft dieser Klasse"})).toBeVisible();
    await page.getByRole("button",{name:"Lehrkraft zuweisen"}).click();
    await expect(page.getByText("Klassenlehrkraft",{exact:true})).toHaveCount(0);
    await expect(page.getByText("Fachlehrkraft",{exact:true})).toHaveCount(0);
    await expect(page.getByRole("combobox",{name:"Fach",exact:true})).toHaveCount(0);
    await expect(page.getByRole("combobox",{name:"Lehrkraft",exact:true})).toBeVisible();
    await expect(page.getByText("Erweiterte Einstellungen")).toBeVisible();
    await page.getByRole("combobox",{name:"Lehrkraft",exact:true}).selectOption({index:1});
    await page.getByRole("button",{name:"Zuordnung speichern"}).click();
    await expect(page.getByRole("button",{name:"Lehrkraft zuweisen"})).toHaveCount(0);
    await page.getByRole("link",{name:"Zuordnungen und Vertretungen"}).click();
    await expect(page.getByRole("combobox",{name:"Aufgabe",exact:true})).toHaveCount(0);
  }finally{await school.close();}
});
