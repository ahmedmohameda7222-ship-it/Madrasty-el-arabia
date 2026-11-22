import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { schoolFixtures } from "../fixtures/school";
import { localOrigin } from "../support/target";

for(const width of [768,1024,1280]){
  test("single admin student search panel is balanced at "+width+"px rather than occupying half a desktop grid",async({page,context})=>{
    const school=schoolFixtures();
    try {
      await school.seed();
      const token=await school.bearer("admin","admin");
      await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      await page.setViewportSize({width,height:900});
      await page.goto("/ar/school/students");
      const panel=page.locator(".school-content .calendar-layout > section.auth-card");
      await expect(panel).toHaveCount(1);
      await expect(panel).toBeVisible({timeout:30000});
      await expect(panel.locator(".group-list, [data-async-state='empty']").first()).toBeVisible({timeout:30000});
      const measured=await panel.evaluate(el=>{
        const card=el.getBoundingClientRect();
        const content=document.querySelector(".school-content")!.getBoundingClientRect();
        return {width:card.width,leftGap:card.left-content.left,rightGap:content.right-card.right};
      });
      expect(measured.width,"single-list card must not be half-width").toBeGreaterThanOrEqual(Math.min(600,width-110));
      expect(measured.width,"forms must remain readable").toBeLessThanOrEqual(800);
      expect(Math.abs(measured.leftGap-measured.rightGap),"one card must be centered").toBeLessThanOrEqual(36);
      mkdirSync("qa-artifacts/ui-after",{recursive:true});
      await page.screenshot({path:"qa-artifacts/ui-after/UIX11-admin-ar-students-"+width+"-ready.png",animations:"disabled"});
    }finally{await school.close();}
  });
}

test("German class-year selector stays a readable centered form on 1280px desktop",async({page,context})=>{
  const school=schoolFixtures();
  try {
    await school.seed();
    const token=await school.bearer("admin","admin");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:1280,height:900});
    await page.goto("/de/school/more/classes");
    const panel=page.locator(".school-content > section.auth-card").first();
    await expect(panel.locator("select")).toBeVisible({timeout:30000});
    const box=await panel.evaluate(el=>{
      const r=el.getBoundingClientRect(),m=document.querySelector(".school-content")!.getBoundingClientRect();
      return {width:r.width,left:r.left-m.left,right:m.right-r.right,scroll:el.scrollWidth-el.clientWidth};
    });
    expect(box.width,"short year selector must not span the entire content rail").toBeLessThanOrEqual(800);
    expect(Math.abs(box.left-box.right)).toBeLessThanOrEqual(36);
    expect(box.scroll).toBeLessThanOrEqual(1);
    mkdirSync("qa-artifacts/ui-after",{recursive:true});
    await page.screenshot({path:"qa-artifacts/ui-after/UIX11-admin-de-classes-1280-year-form.png",animations:"disabled"});
  }finally{await school.close();}
});

test("German guardian child details retain a readable desktop measure with the long QA name",async({page,context})=>{
  const school=schoolFixtures();
  try {
    await school.seed();
    const token=await school.bearer("guardian-de","guardian");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:1280,height:900});
    await page.goto("/de/school/children");
    const panel=page.locator(".school-content > section.auth-card").first();
    await expect(panel.locator("h2 bdi")).toBeVisible({timeout:30000});
    const box=await panel.evaluate(el=>{
      const r=el.getBoundingClientRect(),m=document.querySelector(".school-content")!.getBoundingClientRect();
      return {width:r.width,left:r.left-m.left,right:m.right-r.right,scroll:el.scrollWidth-el.clientWidth};
    });
    expect(box.width,"child detail reading measure").toBeLessThanOrEqual(900);
    expect(Math.abs(box.left-box.right)).toBeLessThanOrEqual(36);
    expect(box.scroll).toBeLessThanOrEqual(1);
    mkdirSync("qa-artifacts/ui-after",{recursive:true});
    await page.screenshot({path:"qa-artifacts/ui-after/UIX11-guardian-de-children-1280-ready.png",animations:"disabled"});
  }finally{await school.close();}
});

test("existing data-heavy guardian home retains the full desktop rail",async({page,context})=>{
  const school=schoolFixtures();
  try {
    await school.seed();
    const token=await school.bearer("guardian-ar","guardian");
    await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    await page.setViewportSize({width:1280,height:900});
    await page.goto("/ar/school/home");
    const hero=page.locator(".role-hero");
    await expect(hero.locator("h2")).toBeVisible({timeout:30000});
    const box=await hero.evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,scroll:el.scrollWidth-el.clientWidth};});
    expect(box.width,"data-heavy home remains full-width").toBeGreaterThanOrEqual(700);
    expect(box.scroll).toBeLessThanOrEqual(1);
    await expect(page.locator("html")).toHaveAttribute("dir","rtl");
  }finally{await school.close();}
});
