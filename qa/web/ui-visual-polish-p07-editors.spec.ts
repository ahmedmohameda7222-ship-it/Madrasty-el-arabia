import { expect,test } from "@playwright/test";
import { mkdirSync,writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { setUpCalendar } from "../fixtures/calendar";
import { fixtureEmail,localOrigin } from "../support/target";

const scenes=[
  {route:"exams",de:"Prüfung anlegen",ar:"إضافة امتحان"},
  {route:"evaluations",de:"Beurteilung anlegen",ar:"إضافة تقييم"},
  {route:"homework",de:"Hausaufgabe anlegen",ar:"إضافة واجب"},
  {route:"academics",de:"Unterricht dokumentieren",ar:"تسجيل شرح"},
  {route:"academics",de:"Aktivität anlegen",ar:"إضافة نشاط",tab:{de:"Bewertete Aktivitäten",ar:"الأنشطة والتقييم"}},
  {route:"curriculum",de:"Unterricht planen",ar:"خطة درس جديدة"},
] as const;

for(const locale of ["de","ar"] as const) test("P07 actual academic editor hierarchy and native fields "+locale,async({context,browser,baseURL})=>{
  const school=schoolFixtures(),origin=baseURL==="https://127.0.0.1:4443"?baseURL:localOrigin;
  const folder="qa-artifacts/visual-polish/P07/editors-"+locale+"/"+browser.browserType().name();
  mkdirSync(folder,{recursive:true});
  const evidence:unknown[]=[];
  try{
    await school.seed();
    await setUpCalendar(school,await school.bearer("admin","admin"));
    const login=await context.request.post(origin+"/api/v1/auth/sign-in",{headers:{Origin:origin},data:{email:fixtureEmail(school.run,"teacher"),password:school.password}});
    expect(login.status()).toBe(200);
    for(const [index,scene] of scenes.entries()){
      const page=await context.newPage();
      const writes:string[]=[];
      page.on("request",request=>{const url=new URL(request.url());if(url.origin===origin&&url.pathname.startsWith("/api/v1/academics/")&&!["GET","HEAD","OPTIONS"].includes(request.method()))writes.push(request.method());});
      try{
        await page.setViewportSize({width:locale==="ar"?320:390,height:844});
        await page.emulateMedia({colorScheme:locale==="ar"?"dark":"light",reducedMotion:"reduce"});
        await page.goto(origin+"/"+locale+"/school/more/"+scene.route);
        if("tab" in scene)await page.getByRole("button",{name:scene.tab[locale],exact:true}).click();
        const create=page.getByRole("button",{name:scene[locale],exact:true});
        await expect(create).toBeVisible();
        await expect(create).toBeEnabled();
        await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
        const primary=await create.evaluate(el=>{
          const style=getComputedStyle(el),box=el.getBoundingClientRect();
          return {height:box.height,width:box.width,radius:parseFloat(style.borderTopLeftRadius),background:style.backgroundColor,primary:style.getPropertyValue("--primary").trim()};
        });
        await page.screenshot({path:folder+"/"+index+"-closed.png"});
        await create.click();
        const cancel=page.getByRole("button",{name:locale==="ar"?"إلغاء":"Abbrechen",exact:true});
        await expect(cancel).toBeVisible();
        const form=page.locator("form.auth-form").filter({has:cancel});
        await expect(form).toHaveCount(1);
        await expect(form.locator("button[type=submit]")).toBeVisible();
        const measure=()=>form.evaluate(el=>{
          const visible=(node:Element)=>node.getClientRects().length>0;
          const fields=[...el.querySelectorAll("input:not([type=checkbox]):not([type=radio]),select,textarea")].filter(visible).map(node=>{
            const b=node.getBoundingClientRect(),s=getComputedStyle(node);return {tag:node.tagName,height:b.height,radius:parseFloat(s.borderTopLeftRadius),inside:b.left>=el.getBoundingClientRect().left-1&&b.right<=el.getBoundingClientRect().right+1};
          });
          return {fields,overflow:Math.max(0,el.scrollWidth-el.clientWidth)};
        });
        const normal=await measure();
        await page.screenshot({path:folder+"/"+index+"-editor.png"});
        await page.evaluate(()=>{document.documentElement.style.fontSize="200%";});
        const large=await measure();
        await page.screenshot({path:folder+"/"+index+"-editor-200.png"});
        await page.evaluate(()=>{document.documentElement.style.fontSize="";});
        await cancel.click();
        await expect(form).toHaveCount(0);
        await expect(create).toBeVisible();
        expect(writes).toEqual([]);
        evidence.push({route:scene.route,action:scene[locale],primary,normal,large});
        console.log("P07 editor geometry",JSON.stringify({locale,route:scene.route,action:scene[locale],primary,normal,large}));
        expect.soft(primary.height,scene[locale]+" primary target").toBeGreaterThanOrEqual(48);
        expect.soft(primary.radius,scene[locale]+" capsule").toBeGreaterThanOrEqual(24);
        for(const [size,result] of [["normal",normal],["200%",large]] as const){
          expect.soft(result.overflow,scene[locale]+" "+size+" form overflow").toBeLessThanOrEqual(1);
          expect.soft(result.fields.length).toBeGreaterThan(0);
          for(const field of result.fields){
            expect.soft(field.height,scene[locale]+" "+size+" "+field.tag+" height").toBeGreaterThanOrEqual(44);
            expect.soft(field.radius,scene[locale]+" "+size+" "+field.tag+" radius").toBeGreaterThanOrEqual(12);
            expect.soft(field.inside,scene[locale]+" "+size+" "+field.tag+" bounds").toBe(true);
          }
        }
      }finally{await page.close();}
    }
  }finally{writeFileSync(folder+"/geometry.json",JSON.stringify(evidence,null,2));await school.close();}
});
