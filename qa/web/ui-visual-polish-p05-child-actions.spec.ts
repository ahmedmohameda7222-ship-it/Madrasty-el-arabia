import { expect,test } from "@playwright/test";
import { mkdirSync,writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { fixtureEmail,localOrigin } from "../support/target";

const names={
  de:["Wochenplan","Lernbericht","Prüfungen","Regelmäßige Beurteilungen","Hausaufgaben","Bewertete Aktivitäten","Fächer und Unterricht","Anwesenheitsverlauf","Abwesenheit entschuldigen","Rechnungen","Gebührenübersicht","Teilnahmepause","Schulnachrichten","Veranstaltungskalender"],
  ar:["الجدول الأسبوعي","التقرير الأكاديمي","الامتحانات","التقييمات الدورية","الواجبات","الأنشطة والتقييم","المواد والدروس","تاريخ الحضور","عذر الغياب","الفواتير","كشف الحساب","وقف القيد","أخبار المدرسة","تقويم الأحداث"]
} as const;
for(const locale of ["de","ar"] as const)test("P05 linked child shortcuts preserve order, scope and separated hit targets "+locale,async({page,context,browser,baseURL})=>{
  const school=schoolFixtures(),origin=baseURL??localOrigin;
  const folder="qa-artifacts/visual-polish/P05/child-actions-"+locale+"/"+browser.browserType().name();
  mkdirSync(folder,{recursive:true});
  try{
    await school.seed();
    if(origin===localOrigin){
      const token=await school.bearer("guardian-de","guardian");
      await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
    }else{
      expect(origin).toBe("https://127.0.0.1:4443");
      const login=await context.request.post(origin+"/api/v1/auth/sign-in",{headers:{Origin:origin},data:{email:fixtureEmail(school.run,"guardian-de"),password:school.password}});
      expect(login.status()).toBe(200);
    }
    await page.setViewportSize({width:320,height:844});
    await page.emulateMedia({colorScheme:locale==="ar"?"dark":"light",reducedMotion:"reduce"});
    expect((await page.goto("/"+locale+"/school/children"))?.status()).toBe(200);
    const panel=page.locator(".guardian-child-panel");
    await expect(panel.locator("h2 bdi")).toBeVisible();
    const links=panel.locator("a.plain-button");
    await expect(links).toHaveCount(14);
    expect(await links.allTextContents()).toEqual([...names[locale]]);
    const hrefs=await links.evaluateAll(nodes=>nodes.map(el=>el.getAttribute("href")!));
    const first=new URL(hrefs[0]!,origin),id=first.searchParams.get("child");
    expect(id).toMatch(/^[a-f0-9-]{36}$/i);
    const expectedPaths=["more/timetable","more/reports","more/exams","more/evaluations","more/homework","more/academics","more/curriculum","children/"+id+"/attendance","children/"+id+"/excuse","more/invoices","more/finance-reports","more/enrollment-stops","more/news","calendar"];
    for(const [i,href] of hrefs.entries()){
      const url=new URL(href,origin);
      expect(url.pathname).toBe("/"+locale+"/school/"+expectedPaths[i]);
      if(i<13)expect(url.searchParams.get("returnChild")).toBe(id);
      if(i<7)expect(url.searchParams.get("child")).toBe(id);
      if(i>=9&&i<=11)expect(url.searchParams.get("student")).toBe(id);
    }
    await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
    const measure=()=>links.evaluateAll(nodes=>{
      const boxes=nodes.map(el=>el.getBoundingClientRect()),gaps:number[]=[];
      for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
        const a=boxes[i]!,b=boxes[j]!;
        if(Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)gaps.push(Math.max(b.left-a.right,a.left-b.right));
        if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1)gaps.push(Math.max(b.top-a.bottom,a.top-b.bottom));
      }
      return {minGap:Math.min(...gaps),minHeight:Math.min(...boxes.map(b=>b.height)),minWidth:Math.min(...boxes.map(b=>b.width)),within:boxes.every(b=>b.left>=-1&&b.right<=innerWidth+1),overflow:document.querySelector(".school-content")!.scrollWidth-document.querySelector(".school-content")!.clientWidth};
    });
    const normal=await measure();
    await page.screenshot({path:folder+"/actions.png",fullPage:true});
    await page.evaluate(()=>{document.documentElement.style.fontSize="200%";});
    const large=await measure();
    await page.screenshot({path:folder+"/actions-200.png",fullPage:true});
    const evidence={locale,normal,large};
    console.log("P05 child shortcut geometry",JSON.stringify(evidence));
    writeFileSync(folder+"/geometry.json",JSON.stringify(evidence,null,2));
    for(const row of [normal,large]){
      expect.soft(row.minGap).toBeGreaterThanOrEqual(8);
      expect.soft(Math.min(row.minHeight,row.minWidth)).toBeGreaterThanOrEqual(44);
      expect.soft(row.within).toBe(true);
      expect.soft(row.overflow).toBeLessThanOrEqual(1);
    }
  }finally{await school.close();}
});
