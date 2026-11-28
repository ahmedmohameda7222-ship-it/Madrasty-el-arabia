import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { fixtureEmail, localOrigin } from "../support/target";
import { setUpCalendar } from "../fixtures/calendar";

async function signInCalendarFixture(school:ReturnType<typeof schoolFixtures>, page:import("@playwright/test").Page, context:import("@playwright/test").BrowserContext, origin:string, actor:"admin"|"teacher"|"guardian-de", persona:"admin"|"teacher"|"guardian") {
  const token=await school.bearer(actor,persona);
  if(origin===localOrigin){await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);return;}
  expect(origin).toBe("https://127.0.0.1:4443");
  const login=await context.request.post(origin+"/api/v1/auth/sign-in",{headers:{Origin:origin},data:{email:fixtureEmail(school.run,actor),password:school.password}});
  expect(login.status()).toBe(200);
  if(persona==="admin"){
    await page.goto("/de/account/security");
    await page.locator('input[name="code"]').fill((await school.localMfa("admin")).code());
    await page.getByRole("button",{name:"Bestätigen",exact:true}).click();
    await expect(page).toHaveURL(/\/de\/school\/home(?:\?.*)?$/);
  }
  expect((await context.cookies(origin)).some(c=>c.name==="__Host-madrasty-session"&&c.secure&&c.httpOnly)).toBe(true);
}


for (const scene of [
  { locale: "de", width: 390, theme: "light", title: "Schuljahr und Kalender", year: "Ausgewähltes Schuljahr", create: "Neues Schuljahr", next: "Nächster Monat", prev: "Vorheriger Monat", today: "Heute", cancel: "Abbrechen" },
  { locale: "ar", width: 320, theme: "dark", title: "السنة الدراسية والتقويم", year: "السنة الدراسية المختارة", create: "سنة دراسية جديدة", next: "الشهر التالي", prev: "الشهر السابق", today: "اليوم", cancel: "إلغاء" },
] as const) {
  test(`P09 school calendar hierarchy and month controls ${scene.locale}`, async ({ page, context, browser, baseURL }) => {
    const school = schoolFixtures();
    const folder = `qa-artifacts/visual-polish/P09/calendar-${scene.locale}-${scene.width}/${browser.browserType().name()}`;
    mkdirSync(folder, { recursive: true });
    await context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await school.seed();
      const admin = await school.bearer("admin", "admin");
      await setUpCalendar(school,admin);
      await signInCalendarFixture(school,page,context,baseURL??localOrigin,"admin","admin");
      await page.setViewportSize({ width: scene.width, height: 844 });
      await page.emulateMedia({ colorScheme: scene.theme, reducedMotion: "reduce" });
      expect((await page.goto(`/${scene.locale}/school/more/calendar`))?.status()).toBe(200);
      const heading = page.getByRole("heading", { name: scene.title, exact: true });
      const calendar = page.getByRole("region", { name: scene.title, exact: true });
      const create = page.getByRole("button", { name: new RegExp(scene.create) });
      const year = page.getByText(scene.year, { exact: true }).locator("..");
      await expect(heading).toBeVisible();
      await expect(calendar).toBeVisible();
      await expect(year).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const next = calendar.getByRole("button", { name: scene.next });
      const prev = calendar.getByRole("button", { name: scene.prev });
      const month = calendar.getByRole("heading", { level: 2 }).first();
      const original = await month.innerText();
      const metrics = {
        createHeight: (await create.boundingBox())!.height,
        arrowWidth: (await next.boundingBox())!.width,
        arrowHeight: (await next.boundingBox())!.height,
        yearRadius: await year.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius)),
        calendarRadius: await calendar.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius)),
        titleTracking: await heading.evaluate(el => getComputedStyle(el).letterSpacing),
      };
      await page.screenshot({ path: folder + "/calendar.png" });
      await next.click();
      await expect(month).not.toHaveText(original);
      await prev.click();
      await expect(month).toHaveText(original);
      await calendar.getByRole("button", { name: scene.today, exact: true }).click();
      const selected = calendar.locator("button[aria-pressed=true]");
      await expect(selected).toHaveCount(1);
      const dayButtons = calendar.locator("button[aria-pressed]");
      expect(await dayButtons.count()).toBeGreaterThanOrEqual(28);
      const daySizes: {width:number;height:number}[]=[];
      for (const day of await dayButtons.all()) {
        const bounds = (await day.boundingBox())!;
        daySizes.push({width:bounds.width,height:bounds.height});
        expect(bounds.width).toBeGreaterThanOrEqual(24);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
      await create.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.screenshot({ path: folder + "/year-form.png" });
      const close = dialog.getByRole("button", { name: "Close", exact: true });
      const closeBox = (await close.boundingBox())!;
      await close.click();
      await expect(dialog).toHaveCount(0);
      await expect(calendar).toBeVisible();
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await page.screenshot({ path: folder + "/calendar-text-200.png" });
      const overflow = await page.locator(".school-content").evaluate(el => el.scrollWidth - el.clientWidth);
      // A page-width check alone misses clipped text inside the three summary cards.
      const summary=page.getByRole("region",{name:scene.year,exact:true});
      if (scene.theme === "dark") {
        await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
        await expect(summary).toHaveCSS("background-color", "rgb(28, 28, 28)");
        await expect(page.getByRole("heading",{name:scene.title,exact:true})).toHaveCSS("color", "rgb(255, 255, 255)");
      }
      const stats=summary.locator('div[class*="statCard"] > span:last-child');
      await expect(stats).toHaveCount(3);
      const statOverflow=await stats.evaluateAll(nodes=>nodes.map(el=>{
        const range=document.createRange();range.selectNodeContents(el);
        const box=el.getBoundingClientRect();
        return [...range.getClientRects()].some(r=>r.left<box.left-1||r.right>box.right+1);
      }));
      const gridOverflow=await calendar.locator("button[aria-pressed]").evaluateAll(nodes=>nodes.flatMap((el,i)=>{
        const box=el.getBoundingClientRect();
        const text=el.firstElementChild;
        if(!text)return [i];
        const range=document.createRange();range.selectNodeContents(text);
        return [...range.getClientRects()].some(r=>r.left<box.left-1||r.right>box.right+1)?[i]:[];
      }));
      const largeDaySizes=await dayButtons.evaluateAll(nodes=>nodes.map(el=>{const b=el.getBoundingClientRect();return {width:b.width,height:b.height};}));
      const evidence = { locale: scene.locale, metrics, overflow, closeBox,statOverflow,gridOverflow,daySizes,largeDaySizes };
      console.log("P09 calendar geometry", JSON.stringify(evidence));
      writeFileSync(folder + "/geometry.json", JSON.stringify(evidence, null, 2));
      expect(metrics.createHeight).toBeGreaterThanOrEqual(48);
      expect(Math.min(metrics.arrowWidth, metrics.arrowHeight, closeBox.width, closeBox.height)).toBeGreaterThanOrEqual(44);
      expect(metrics.yearRadius).toBeGreaterThanOrEqual(22);
      expect(metrics.calendarRadius).toBeGreaterThanOrEqual(22);
      if (scene.locale === "ar") expect(["normal", "0px"]).toContain(metrics.titleTracking);
      expect(overflow).toBeLessThanOrEqual(1);
      expect.soft(statOverflow,"All calendar summary labels fit their cards").toEqual([false,false,false]);
      expect.soft(gridOverflow,"Day numbers remain within day controls").toEqual([]);
      for(const size of [...daySizes,...largeDaySizes])expect.soft(Math.min(size.width,size.height),"School calendar day hit target").toBeGreaterThanOrEqual(44);
    } finally {
      await context.tracing.stop({ path: folder + "/trace.zip" });
      await school.close();
    }
  });
}

for(const locale of ["de","ar"] as const){
  test("P09 month-grid weekday labels at enlarged text "+locale,async({page,context,browser,baseURL})=>{
    const school=schoolFixtures(),origin=baseURL??localOrigin;
    const folder=`qa-artifacts/visual-polish/P09/month-weekdays-${locale}/${browser.browserType().name()}`;
    mkdirSync(folder,{recursive:true});
    try{
      await school.seed();
      await setUpCalendar(school,await school.bearer("admin","admin"));
      await signInCalendarFixture(school,page,context,origin,"guardian-de","guardian");
      await page.setViewportSize({width:320,height:844});
      await page.emulateMedia({colorScheme:locale==="ar"?"dark":"light",reducedMotion:"reduce"});
      expect((await page.goto("/"+locale+"/school/calendar"))?.status()).toBe(200);
      const grid=page.locator('.school-month-grid[data-calendar-ready="true"]');
      await expect(grid).toBeVisible();
      const names=grid.locator(".comms-weekday");
      await expect(names).toHaveCount(7);
      const expected=Array.from({length:7},(_,i)=>new Intl.DateTimeFormat(locale==="de"?"de-DE":"ar-EG",{weekday:"long",timeZone:"UTC"}).format(new Date(Date.UTC(2024,0,i+1,12))));
      expect(await names.evaluateAll(nodes=>nodes.map(el=>el.getAttribute("aria-label")))).toEqual(expected);
      await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
      const measure=()=>names.evaluateAll(nodes=>nodes.map(el=>{
        const range=document.createRange();range.selectNodeContents(el);
        const box=el.getBoundingClientRect();
        return {overflow:Math.max(0,el.scrollWidth-el.clientWidth),clipped:[...range.getClientRects()].some(r=>r.left<box.left-1||r.right>box.right+1)};
      }));
      const daySizes=()=>grid.locator("button[aria-pressed]").evaluateAll(nodes=>nodes.map(el=>{const b=el.getBoundingClientRect();return {width:b.width,height:b.height,left:b.left,right:b.right};}));
      const normal=await measure();
      const normalDays=await daySizes();
      await grid.scrollIntoViewIfNeeded();
      await page.screenshot({path:folder+"/calendar.png"});
      await page.evaluate(()=>{document.documentElement.style.fontSize="200%";});
      const large=await measure();
      const largeDays=await daySizes();
      await grid.scrollIntoViewIfNeeded();
      await page.screenshot({path:folder+"/calendar-text-200.png"});
      console.log("P09 month weekdays",JSON.stringify({locale,normal,large,normalDays,largeDays}));
      for(const size of [...normalDays,...largeDays]){expect.soft(Math.min(size.width,size.height),"Event calendar day hit target").toBeGreaterThanOrEqual(44);expect.soft(size.left).toBeGreaterThanOrEqual(0);expect.soft(size.right).toBeLessThanOrEqual(320);}
      for(const row of [...normal,...large]){expect.soft(row.overflow).toBeLessThanOrEqual(1);expect.soft(row.clipped).toBe(false);}
      expect(await grid.locator('button[aria-pressed]').count()).toBeGreaterThanOrEqual(28);
    }finally{await school.close();}
  });
}
