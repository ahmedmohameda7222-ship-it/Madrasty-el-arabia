import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { schoolFixtures, type FixtureSchool } from "../fixtures/school";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolClock as clock } from "../fixtures/clock";
import { fixtureApi } from "../support/api";
import { localOrigin } from "../support/target";
import { invoiceDetail, invoicePreview, invoiceBatch } from "../../packages/contracts/src/finance/invoices";
import { receiptMutation } from "../../packages/contracts/src/finance/receipts";

// Run only AFTER the shared UI suite; all writes are to the disposable QA school.
async function seedFinance(school: FixtureSchool) {
  await school.seed();
  const admin = await school.bearer("admin","admin");
  const { ids } = await setUpCalendar(school,admin);
  const finance = await school.bearer("finance","admin");
  const send = async (path:string,name:string,body:unknown,method:"POST"|"PUT"="POST") =>
    (await fixtureApi(school,path,{token:finance,persona:"admin",method,key:school.run+".visual-"+name,body,status:[200,201]})).payload.data;
  const pupilChoices = [
    [ids.ahmed,"Johanna Marie Sophie von Hohenlohe-Langenburg-Wiśniewska-Kowalczyk"],
    [ids.omar,"سلمى عبد الرحمن محمد"],
    [ids.other,"أمينة"],
  ] as const;
  for(const [id,name] of pupilChoices){
    const path="/finance/children/"+id+"/payer";
    const profile=(await fixtureApi(school,path,{token:finance,persona:"admin"})).payload.data;
    const guardian=profile.choices.find((one:{displayName:string})=>one.displayName===name);
    expect(guardian?.id).toBeTruthy();
    const active=[...profile.designations].filter((x:{effectiveFromMonth:string})=>x.effectiveFromMonth<=clock.month).sort((a:{effectiveFromMonth:string},b:{effectiveFromMonth:string})=>b.effectiveFromMonth.localeCompare(a.effectiveFromMonth))[0];
    if(active?.guardianId!==guardian.id)await send(path,"payer-"+id,{guardianId:guardian.id,effectiveFromMonth:clock.month,revision:profile.revision},"PUT");
  }
  const cases=[
    {pupil:ids.ahmed,amount:3200,paid:3200,label:"A",ar:"رحلة مدرسية",de:"Schulausflug"},
    {pupil:ids.omar,amount:3200,paid:1200,label:"B",ar:"كتب مدرسية",de:"Schulbücher"},
    {pupil:ids.ahmed,amount:5100,paid:0,label:"C",ar:"مواد تعليمية",de:"Lernmaterial"},
    {pupil:ids.other,amount:7000,paid:0,label:"D",ar:"نشاط مدرسي",de:"Schulaktivität"},
  ];
  const records=[];
  for(const row of cases){
    const preview=invoicePreview.parse(await send("/finance/invoice-previews","preview-"+row.label,{kind:"manual",period:clock.month,studentIds:[row.pupil],chargeSourceId:randomUUID(),lineItems:[{titleAr:row.ar,titleDe:row.de,amountMinor:row.amount}]}));
    expect(preview.rows[0]?.outcome).toBe("ready");
    const batch=invoiceBatch.parse(await send("/finance/invoice-batches","issue-"+row.label,{previewId:preview.previewId,revision:preview.revision}));
    expect(batch.issuedIds).toHaveLength(1);
    const id=batch.issuedIds[0];
    let invoice=invoiceDetail.parse((await fixtureApi(school,"/finance/invoices/"+id,{token:finance,persona:"admin"})).payload.data);
    let receiptId:string|undefined;
    if(row.paid){
      const receipt=receiptMutation.parse(await send("/finance/receipts","receipt-"+row.label,{externalReceiptRef:school.run+"-VISUAL-"+row.label,method:"cash",receivedDate:clock.day,currency:invoice.currency,amountMinor:row.paid,verified:true,allocations:[{invoiceId:id,invoiceRevision:invoice.revision,amountMinor:row.paid}]}));
      receiptId=receipt.id;
      invoice=invoiceDetail.parse((await fixtureApi(school,"/finance/invoices/"+id,{token:finance,persona:"admin"})).payload.data);
    }
    expect(invoice.state).toBe(row.paid===row.amount?"paid":row.paid>0?"partial":"unpaid");
    records.push({invoice,receiptId,label:row.label});
  }
  await send("/finance/cashbook","donation",{kind:"donation",date:clock.day,amountMinor:5000,description:"QA Spende – تبرع تجريبي"});
  await send("/finance/cashbook","expense",{kind:"expense",date:clock.day,amountMinor:1000,description:"QA Material – أدوات مدرسية"});
  return records;
}
const output="qa-artifacts/ui-after/";
async function capture(page:Page,name:string){
  const main=page.locator(".school-content");
  await expect(main.locator("h1").first()).toBeVisible();
  await expect(main.locator('[data-async-state="loading"]')).toHaveCount(0);
  await expect(main.locator('[data-async-state="error"],[data-async-state="forbidden"]')).toHaveCount(0);
  expect(await main.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await main.evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:output+name+"-top.png",animations:"disabled"});
  const scrollable=await main.evaluate(el=>el.scrollHeight>el.clientHeight+10);
  if(scrollable){
    await main.evaluate(el=>el.scrollTop=el.scrollHeight);
    await page.screenshot({path:output+name+"-bottom.png",animations:"disabled"});
  }
}

test("populated finance: actual synthetic invoices, receipts, balance, PDF links and review actions",async({browser})=>{
  test.setTimeout(720_000);
  const school=schoolFixtures();
  try{
    const records=await seedFinance(school);
    mkdirSync(output,{recursive:true});
    const scenarios=[
      {actor:"admin",persona:"admin",locale:"de",record:"A"},
      {actor:"admin",persona:"admin",locale:"ar",record:"B"},
      {actor:"guardian-de",persona:"guardian",locale:"de",record:"A"},
      {actor:"guardian-ar",persona:"guardian",locale:"ar",record:"B"},
    ] as const;
    for(const s of scenarios){
      const token=await school.bearer(s.actor,s.persona);
      const context=await browser.newContext({baseURL:localOrigin,locale:s.locale==="ar"?"ar-EG":"de-DE"});
      try{
        await context.addCookies([{name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"}]);
        const page=await context.newPage();
        const record=records.find(x=>x.label===s.record)!;
        const root="/"+s.locale+"/school/more/";
        for(const [width,theme] of [[320,"dark"],[390,"light"],[430,"light"],[1280,"light"]] as const){
          await page.setViewportSize({width,height:844});
          await page.emulateMedia({colorScheme:theme,reducedMotion:"reduce"});
          const prefix="finance-populated-"+s.actor+"-"+s.locale+"-"+width+"-"+theme+"-";
          async function go(route:string){const response=await page.goto(root+route);expect(response?.status()).toBe(200);}
          await go("finance-reports");
          await expect(page.getByText(s.persona==="admin"?(s.locale==="ar"?"رصيد الخزنة الحالي":"Aktueller Kassenbestand"):(s.locale==="ar"?"المبلغ المتبقي":"Offener Betrag"),{exact:true}).first()).toBeVisible();
          await capture(page,prefix+"overview");
          await go("invoices");
          await expect(page.locator('a[href*="invoice='+record.invoice.id+'"]')).toBeVisible();
          if(s.persona==="admin")for(const row of records)await expect(page.locator('a[href*="invoice='+row.invoice.id+'"]')).toBeVisible();
          else {
            const foreign=records.find(x=>x.label===(s.record==="A"?"B":"A"))!;
            await expect(page.locator('a[href*="invoice='+foreign.invoice.id+'"]')).toHaveCount(0);
            await expect(page.locator(".school-content input[type=search]")).toHaveCount(0);
          }
          await capture(page,prefix+"invoices");
          await go("invoices?invoice="+record.invoice.id);
          await expect(page.locator('a[download][href*="/finance/invoices/"]')).toBeVisible();
          await capture(page,prefix+"invoice-detail");
          await go("receipts?receipt="+record.receiptId);
          await expect(page.locator('a[download][href*="/finance/receipts/"]')).toBeVisible();
          await capture(page,prefix+"receipt-detail");
          if(s.persona==="admin"){
            await go("receipts");
            await expect(page.locator('a[href*="receipt='+record.receiptId+'"]')).toBeVisible();
            await capture(page,prefix+"receipts");
            await go("receipts?view=cashbook");
            await expect(page.getByText("QA Spende – تبرع تجريبي",{exact:true})).toBeVisible();
            await capture(page,prefix+"cashbook");
            if(width===320||width===390){
              const unpaid=records.find(x=>x.label==="C")!.invoice;
              await go("record-payment?invoice="+unpaid.id);
              const checkbox=page.locator(".school-content input[type=checkbox]").first();
              await checkbox.check();
              const review=page.getByRole("button",{name:s.locale==="ar"?"مراجعة":"Prüfen",exact:true});
              await expect(review).toBeEnabled();
              await capture(page,prefix+"payment-form");
              await review.click();
              await expect(page.getByRole("button",{name:s.locale==="ar"?"تأكيد":"Bestätigen",exact:true})).toBeVisible();
              await capture(page,prefix+"payment-review");
            }
          }
        }
      }finally{await context.close();}
    }
  }finally{await school.close();}
});
