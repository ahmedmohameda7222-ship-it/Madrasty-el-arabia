import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { fixtureEmail, localOrigin, schoolOrigin } from "../support/target";

for (const viewport of [
  { locale: "ar", dir: "rtl", width: 320, principal: "guardian-ar", colorScheme: "dark" },
  { locale: "de", dir: "ltr", width: 390, principal: "guardian-de", colorScheme: "light" },
  { locale: "de", dir: "ltr", width: 1280, principal: "teacher", colorScheme: "light" },
] as const) {
  test(`${viewport.locale} ${viewport.width}px ${viewport.principal} can sign in and reach the correct school home`, async ({ page }) => {
    const school = schoolFixtures();
    try {
      await page.setViewportSize({ width: viewport.width, height: 820 });
      await page.emulateMedia({ colorScheme: viewport.colorScheme, reducedMotion: "reduce" });
      await page.route("**/*", (route) => new URL(route.request().url()).origin === localOrigin ? route.continue() : route.abort());
      await page.goto(`/${viewport.locale}/account/sign-in`);
      await expect(page.locator("html")).toHaveAttribute("dir", viewport.dir);
      await expect(page.locator("html")).toHaveAttribute("lang", viewport.locale);
      await page.locator('input[name="email"]').fill(fixtureEmail(school.run, viewport.principal));
      await page.locator('input[name="password"]').fill(school.password);
      await page.locator("form button[type=submit],form button:not([type])").first().click();
      await expect(page).toHaveURL(new RegExp(`/${viewport.locale}/school/home(?:\\?.*)?$`));
      await expect(page.getByRole("main")).toBeVisible();
      const overflow = await page.locator("html").evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeLessThanOrEqual(2);
    } finally {
      await school.close();
    }
  });
}

test("the desktop administrator can reach calendar and finances from the administration navigation", async ({ page, context }) => {
  const school = schoolFixtures();
  try {
    const token = await school.bearer("admin", "admin");
    await context.addCookies([{ name: "madrasty-session", value: token, url: localOrigin, httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/de/school/more");
    await page.getByText("Buchhaltung", { exact: true }).click();
    await expect(page.getByRole("link", { name: "Rechnungen", exact: true })).toBeVisible();
    await page.getByText("Aufnahme und Schulverwaltung", { exact: true }).click();
    await page.getByRole("link", { name: "Schuljahr und Kalender" }).click();
    await expect(page).toHaveURL(/\/de\/school\/more\/calendar$/);
    await expect(page.getByRole("main")).toBeVisible();
  } finally {
    await school.close();
  }
});

test("first-run administration exposes school setup and keeps the route while switching language", async ({page,context}) => {
  const school=schoolFixtures();
  try {
    const token=await school.bearer("admin","admin");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.route("**/api/v1/school/work-queues",route=>route.fulfill({json:{data:{
      asOf:null,today:null,timezone:null,setupRequired:true,mayConfigure:true,queues:[],
    }}}));
    await page.goto("/ar/school/home");
    await page.getByRole("link",{name:"إعداد المدرسة",exact:true}).click();
    await expect(page).toHaveURL(/\/ar\/school\/more\/calendar$/);
    await page.getByRole("link",{name:"Deutsch",exact:true}).click();
    await expect(page).toHaveURL(/\/de\/school\/more\/calendar$/);
  } finally {
    await school.close();
  }
});

for (const locale of ["ar", "de"]) {
  test(`${locale} published install page links to the school APK and exposes standalone PWA metadata`, async ({ page }) => {
    await page.goto(`${schoolOrigin}/${locale}/install`);
    await expect(page.locator("a[href='/download/android']")).toBeVisible();
    const manifestHref = await page.locator('link[rel="manifest"]').first().getAttribute("href");
    expect(manifestHref).toBeTruthy();
    const manifest = new URL(manifestHref!, schoolOrigin);
    expect(manifest.origin).toBe(schoolOrigin);
    const response = await page.request.get(manifest.href, { maxRedirects: 0 });
    expect(response.ok()).toBe(true);
    expect((await response.json()).display).toBe("standalone");
  });
}
