import { expect,test,type Locator } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { schoolFixtures } from "../fixtures/school";
import { setUpCalendar } from "../fixtures/calendar";
import { fixtureEmail,localOrigin } from "../support/target";

function allowedBreaks(marked:string){
  let index=0;
  const allowed=new Set<number>();
  for(const char of marked){
    if(char==="\u00ad"){allowed.add(index);continue;}
    if(char===" "){allowed.add(index);allowed.add(index+1);}
    if(char==="-")allowed.add(index+1);
    index++;
  }
  return allowed;
}
async function glyphBreaks(locator:Locator){
  return locator.evaluate(el=>{
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    const breaks:number[]=[];
    let index=0,previous:number|undefined,text="";
    for(let node=walker.nextNode();node;node=walker.nextNode()){
      const value=node.textContent??"";
      for(let i=0;i<value.length;i++){
        const char=value[i];if(char==="\u00ad")continue;
        text+=char;
        const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);
        const box=[...range.getClientRects()].filter(r=>r.width>0).at(-1);
        if(!box){if(char===" "){index++;continue;}throw Error("Missing heading glyph");}
        if(previous!==undefined&&Math.round(box.top)!==previous)breaks.push(index);
        if(char!==" ")previous=Math.round(box.top);
        index++;
      }
    }
    return {text,breaks};
  });
}
for(const persona of ["guardian","admin"] as const){
  test("P11 German static heading readability "+persona,async({page,context,browser,baseURL})=>{
    const school=schoolFixtures(),origin=baseURL??localOrigin;
    const actor=persona==="admin"?"admin":"guardian-de";
    const folder=`qa-artifacts/visual-polish/P11/headings-${persona}/${browser.browserType().name()}`;
    mkdirSync(folder,{recursive:true});
    try{
      await school.seed();
      const admin=await school.bearer("admin","admin");
      const {ids}=await setUpCalendar(school,admin);
      const token=persona==="admin"?admin:await school.bearer(actor,persona);
      if(origin===localOrigin){
        await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
      }else{
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
      const routes=persona==="admin"?[
        {path:"/de/staff/access",heading:"Berechtigungen verwalten",marked:"Be\u00adrech\u00adti\u00adgun\u00adgen ver\u00adwal\u00adten",key:"staff-access"}
      ]:[
        {path:"/de/account/preferences",heading:"App-Einstellungen",marked:"App-Ein\u00adstel\u00adlun\u00adgen",key:"preferences"},
        {path:"/de/school/children/"+ids.ahmed+"/attendance",heading:"Anwesenheitsverlauf",marked:"An\u00adwe\u00adsen\u00adheits\u00adver\u00adlauf",key:"attendance"},
        {path:"/de/school/children/"+ids.ahmed+"/excuse",heading:"Abwesenheit entschuldigen",marked:"Ab\u00adwe\u00adsen\u00adheit ent\u00adschul\u00addi\u00adgen",key:"excuse"}
      ];
      for(const row of routes)for(const width of [320,390]){
        const screen=await context.newPage();
        try{
          await screen.setViewportSize({width,height:844});
          await screen.emulateMedia({colorScheme:"light",reducedMotion:"reduce"});
          expect((await screen.goto(origin+row.path))?.status()).toBe(200);
          const title=screen.getByRole("heading",{name:row.heading,exact:true,level:1});
          await expect(title).toBeVisible();
          await screen.evaluate(()=>document.fonts.ready.then(()=>undefined));
          await screen.evaluate(()=>{document.documentElement.style.fontSize="200%";});
          await title.scrollIntoViewIfNeeded();
          const measured=await glyphBreaks(title);
          expect(measured.text).toBe(row.heading);
          console.log("P11 heading line breaks",JSON.stringify({key:row.key,width,...measured}));
          await screen.screenshot({path:folder+"/"+row.key+"-"+width+"-200.png"});
          expect.soft(measured.breaks.filter(i=>!allowedBreaks(row.marked).has(i)),row.key+" "+width).toEqual([]);
          if(row.key==="preferences"){
            const deutsch=screen.getByRole("button",{name:"Deutsch",exact:true});
            const german=await glyphBreaks(deutsch);
            console.log("P11 language option line breaks",JSON.stringify({width,...german}));
            expect.soft(german.breaks,"Deutsch must remain a whole word").toEqual([]);
            await expect(screen.getByRole("button",{name:"العربية",exact:true})).toBeVisible();
          }
        }finally{await screen.close();}
      }
    }finally{await school.close();}
  });
}
