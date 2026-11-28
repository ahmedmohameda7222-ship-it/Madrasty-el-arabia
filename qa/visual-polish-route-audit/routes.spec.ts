import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { setUpCalendar } from "../fixtures/calendar";
import { fixtureEmail, requireFixtureTarget } from "../support/target";

const origin="https://127.0.0.1:4443";
const stage=process.env.VISUAL_POLISH_SURVEY_STAGE;
if(stage!==undefined&&!["baseline","candidate"].includes(stage))throw Error("Invalid matched survey stage");
const sourceSha=stage?process.env.VISUAL_POLISH_SOURCE_SHA:process.env.GITHUB_SHA;
if(!sourceSha||!/^[a-f0-9]{40}$/.test(sourceSha))throw Error("Missing exact survey source SHA");
requireFixtureTarget(process.env);
if(process.env.GITHUB_ACTIONS!=="true"||process.env.GITHUB_REF!=="refs/heads/visual-polish/premium"||!process.env.NODE_EXTRA_CA_CERTS)throw Error("Route survey requires disposable trusted HTTPS");
const actors=[
  {actor:"admin",persona:"admin"},{actor:"teacher",persona:"teacher"},{actor:"guardian-de",persona:"guardian"}
] as const;
const safeRoutes=new Set([
  "/account/preferences","/account/profile","/account/security","/directory","/school/home","/school/students",
  "/school/attendance","/school/children","/school/messages","/school/calendar","/school/more","/school/home/tasks",
  "/school/more/academics","/school/more/assignments","/school/more/attendance/history","/school/more/attendance",
  "/school/more/bank","/school/more/broadcasts","/school/more/calendar","/school/more/classes","/school/more/curriculum",
  "/school/more/enrollment-stops","/school/more/evaluations","/school/more/events","/school/more/exams","/school/more/fee-settings",
  "/school/more/finance-reports","/school/more/grading","/school/more/homework","/school/more/invoices","/school/more/issue-invoices",
  "/school/more/message-reports","/school/more/news","/school/more/notifications","/school/more/oversight","/school/more/receipts",
  "/school/more/record-payment","/school/more/reports","/school/more/stop-reviews","/school/more/timetable","/school/students/import",
  "/staff/access","/staff/invitations",
]);
for(const scene of actors)for(const locale of ["de","ar"] as const){
  test("visual route survey "+scene.persona+" "+locale,async({browser,context,page})=>{
    const school=schoolFixtures();
    const folder=`qa-artifacts/visual-polish/${stage?"route-survey-matched/"+stage:"route-survey"}/${browser.browserType().name()}/${scene.persona}-${locale}`;
    mkdirSync(folder,{recursive:true});
    const rows:Record<string,unknown>[]=[];
    const failures:{route:string;category:string}[]=[];
    const width=locale==="ar"?320:390;
    try{
      await school.seed();
      const admin=await school.bearer("admin","admin");
      const {ids}=await setUpCalendar(school,admin);
      const login=await context.request.post(origin+"/api/v1/auth/sign-in",{headers:{Origin:origin},data:{email:fixtureEmail(school.run,scene.actor),password:school.password}});
      expect(login.status()).toBe(200);
      if(scene.persona==="admin"){
        await page.goto("/de/account/security");
        await page.locator('input[name="code"]').fill((await school.localMfa("admin")).code());
        await page.getByRole("button",{name:"Bestätigen",exact:true}).click();
        await expect(page).toHaveURL(/\/de\/school\/home(?:\?.*)?$/);
      }
      expect((await context.cookies(origin)).some(c=>c.name==="__Host-madrasty-session"&&c.secure&&c.httpOnly)).toBe(true);
      await page.goto("/"+locale+"/school/more");
      await expect(page.locator(".more-index")).toBeVisible();
      const links=await page.locator(".more-index a.more-row, .school-nav > a").evaluateAll(nodes=>nodes.map(el=>el.getAttribute("href")??""));
      const routes=new Map<string,string>();
      for(const href of links){
        const url=new URL(href,origin);
        if(url.origin!==origin||!url.pathname.startsWith("/"+locale+"/"))continue;
        const path=url.pathname.slice(3);
        if(!safeRoutes.has(path))continue;
        const query=url.search==="?view=cashbook"?url.search:"";
        routes.set(path+query,"/"+locale+path+query);
      }
      for(const path of ["/directory","/school/more/notifications"])routes.set(path,"/"+locale+path);
      if(scene.persona==="guardian")for(const childPage of ["attendance","excuse"]){
        routes.set("/school/children/:child/"+childPage,"/"+locale+"/school/children/"+ids.ahmed+"/"+childPage);
      }
      expect(routes.size).toBeGreaterThanOrEqual(10);
      await page.close();
      for(const [route,path] of routes){
        const screen=await context.newPage();
        const key=route.replace(/[^a-z0-9-]+/gi,"-").replace(/^-|-$/g,"");
        try{
          await screen.setViewportSize({width,height:844});
          await screen.emulateMedia({colorScheme:locale==="ar"?"dark":"light",reducedMotion:"reduce"});
          // Start observation before navigation. The survey is evidence, not
          // a performance benchmark: wait for actual initial client fetches.
          // Never count a transient empty staff list or hidden skeleton as ready.
          const reads=new Map<string,number>();
          screen.on("response",response=>{
            const url=new URL(response.url());
            if(url.origin===origin&&url.pathname.startsWith("/api/v1/")&&response.request().method()==="GET"){
              const safe=url.pathname.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,":id");
              reads.set(safe,response.status());
            }
          });
          const reply=await screen.goto(origin+path,{waitUntil:"domcontentloaded"});
          await screen.waitForLoadState("networkidle",{timeout:30000});
          // Stock Next not-found has no school/public shell. Capture only the
          // positively identified terminal 404, never an arbitrary missing root.
          const stockNotFound=await screen.getByRole("heading",{name:"404",exact:true}).isVisible();
          const root=stockNotFound?screen.locator("body"):screen.locator(".school-content, main.public-page").first();
          await expect(root).toBeVisible();
          await expect(root.locator('[data-async-state="loading"], .school-route-loading')).toHaveCount(0,{timeout:30000});
          if(route==="/school/more/assignments"&&scene.persona==="admin"){
            await expect(root.locator('button[aria-pressed]').first()).toBeVisible();
            expect(reads.get("/api/v1/school/staff")).toBe(200);
          }
          if(route==="/school/calendar"){
            await expect(root.locator('.school-month-grid[data-calendar-ready="true"]')).toBeVisible();
          }
          await screen.evaluate(()=>document.fonts.ready.then(()=>undefined));
          const measure=()=>root.evaluate(el=>{
            const bounds=el.getBoundingClientRect();
            const visible=(node:Element)=>node.getClientRects().length>0&&!node.classList.contains("screen-reader-only");
            const candidates=[...el.querySelectorAll("button,input:not([type=checkbox]):not([type=radio]),select,textarea,summary")].filter(visible);
            const small=candidates.flatMap(node=>{const r=node.getBoundingClientRect();return r.width<44||r.height<44?[{tag:node.tagName,classes:typeof node.className==="string"?node.className:"",width:Math.round(r.width),height:Math.round(r.height)}]:[]});
            const outside=[...el.querySelectorAll("*")].filter(visible).flatMap(node=>{
              const r=node.getBoundingClientRect();return r.width>0&&(r.left<bounds.left-1||r.right>bounds.right+1||node.scrollWidth>node.clientWidth+1&&getComputedStyle(node).overflowX==="visible")?[{tag:node.tagName,classes:typeof node.className==="string"?node.className:"",width:Math.round(r.width),scroll:node.scrollWidth,client:node.clientWidth}]:[];
            }).slice(0,20);
            const states=[...el.querySelectorAll("[data-async-state]")].map(node=>node.getAttribute("data-async-state"));
            return {overflow:Math.max(document.documentElement.scrollWidth-innerWidth,el.scrollWidth-el.clientWidth),
              headingCount:el.querySelectorAll("h1").length,controlCount:candidates.length,small,outside,states};
          });
          const normal=await measure();
          await screen.screenshot({path:folder+"/"+key+"-normal.png"});
          await screen.evaluate(()=>{document.documentElement.style.fontSize="200%";});
          const large=await measure();
          await screen.screenshot({path:folder+"/"+key+"-text-200.png"});
          const destination=new URL(screen.url()).pathname.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,":id").slice(3);
          const denied=await screen.locator("[data-generic-not-found]").count()>0 || stockNotFound;
          const state={route,destination,status:reply?.status(),denied,normal,large,reads:[...reads.entries()].sort((a,b)=>a[0].localeCompare(b[0]))};
          rows.push(state);
          console.log("Visual route survey",JSON.stringify(state));
          if(reply?.status()!==200||denied)failures.push({route,category:"advertised-route-unavailable"});
          if([...normal.states,...large.states].some(s=>s==="error"||s==="forbidden"))failures.push({route,category:"async-terminal"});
          if(normal.overflow>1||large.overflow>1)failures.push({route,category:"horizontal-overflow"});
          // Small controls and descendant clipping are diagnostic findings, not
          // automatically defects (e.g. intentional inline date controls).
        }catch(error){
          failures.push({route,category:error instanceof Error?error.name:"unknown"});
        }finally{await screen.close();}
      }
      expect(rows.length).toBe(routes.size);
      expect(failures).toEqual([]);
    }finally{
      writeFileSync(folder+"/survey.json",JSON.stringify({sha:sourceSha,stage:stage??"single",role:scene.persona,locale,width,fixtureId:school.run,rows,failures},null,2));
      await school.close();
    }
  });
}
