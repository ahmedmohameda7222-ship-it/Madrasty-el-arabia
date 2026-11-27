import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { devices, expect, test, type Page } from "@playwright/test";
import { schoolFixtures, type FixtureSchool } from "../fixtures/school";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolClock as clock } from "../fixtures/clock";
import { fixtureApi } from "../support/api";
import { localOrigin } from "../support/target";
import { invoiceDetail, invoicePreview, invoiceBatch } from "../../packages/contracts/src/finance/invoices";
import { receiptDetail, receiptMutation } from "../../packages/contracts/src/finance/receipts";

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
    expect(invoice.balanceMinor).toBe(row.amount-row.paid);
    expect(invoice.allocatedMinor).toBe(row.paid);
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
      const context=await browser.newContext({...(browser.browserType().name()==="webkit"?devices["iPhone 13"]:{}),baseURL:localOrigin,locale:s.locale==="ar"?"ar-EG":"de-DE"});
      try{
        await context.addCookies([
          {name:"madrasty-session",value:token,url:localOrigin,httpOnly:true,sameSite:"Lax"},
          // Browser writes use the same CSRF contract as an ordinary signed-in web session.
          {name:"madrasty-csrf",value:randomUUID().replaceAll("-","")+randomUUID().replaceAll("-",""),url:localOrigin,sameSite:"Lax"},
        ]);
        let page=await context.newPage();
        const record=records.find(x=>x.label===s.record)!;
        const actorOptions={token,persona:s.persona,locale:s.locale};
        const visibleInvoice=invoiceDetail.parse((await fixtureApi(school,"/finance/invoices/"+record.invoice.id,actorOptions)).payload.data);
        expect(visibleInvoice.receiptIds).toHaveLength(1);
        const visibleReceiptId=visibleInvoice.receiptIds[0];
        const receiptResponse=await fixtureApi(school,"/finance/receipts/"+visibleReceiptId,actorOptions);
        const visibleReceipt=receiptDetail.parse(receiptResponse.payload.data);
        expect(visibleReceipt.id).toBe(visibleReceiptId);
        expect(visibleReceipt.scope).toBe(s.persona==="admin"?"staff":"payer");
        expect(visibleReceipt.amountMinor).toBe(s.record==="A"?3200:1200);
        expect(visibleReceipt.appliedMinor).toBe(visibleReceipt.amountMinor);
        expect(visibleReceipt.allocations.map(x=>x.invoiceId)).toEqual([record.invoice.id]);
        for(const path of ["/finance/invoices/"+record.invoice.id+"/pdf","/finance/receipts/"+visibleReceiptId+"/pdf"]){
          const doc=await fixtureApi(school,path+"?locale="+s.locale,actorOptions);
          expect(doc.response.headers.get("content-type")).toContain("application/pdf");
          expect(doc.response.headers.get("cache-control")).toContain("no-store");
          const bytes=Buffer.from(await doc.response.arrayBuffer());
          expect(bytes.subarray(0,8).toString()).toBe("%PDF-1.4");
          expect(bytes.subarray(-30).toString()).toContain("%%EOF");
        }
        if(s.persona==="guardian"){
          expect(receiptResponse.payload.data).not.toHaveProperty("externalReceiptRef");
          expect(receiptResponse.payload.data).not.toHaveProperty("history");
          expect(receiptResponse.payload.data).not.toHaveProperty("remainderMinor");
          const otherActor=s.actor==="guardian-de"?"guardian-ar":"guardian-de";
          const other=records.find(x=>x.label===(s.record==="A"?"B":"A"))!;
          const otherToken=await school.bearer(otherActor,"guardian");
          const otherInvoice=invoiceDetail.parse((await fixtureApi(school,"/finance/invoices/"+other.invoice.id,{token:otherToken,persona:"guardian"})).payload.data);
          expect(otherInvoice.receiptIds).toHaveLength(1);
          const otherReceiptId=otherInvoice.receiptIds[0];
          for(const path of ["/finance/invoices/"+other.invoice.id,"/finance/invoices/"+other.invoice.id+"/pdf",
            "/finance/receipts/"+otherReceiptId,"/finance/receipts/"+otherReceiptId+"/pdf",
            "/finance/receipts/"+record.receiptId,"/finance/receipts/"+record.receiptId+"/pdf"]){
            await fixtureApi(school,path,{...actorOptions,status:404});
          }
        }
        const root="/"+s.locale+"/school/more/";
        for(const [width,theme] of [[320,"dark"],[390,"light"],[430,"light"],[1280,"light"]] as const){
          await page.setViewportSize({width,height:844});
          await page.emulateMedia({colorScheme:theme,reducedMotion:"reduce"});
          const prefix="finance-populated-"+s.actor+"-"+s.locale+"-"+width+"-"+theme+"-";
          async function go(route:string){
            // Full-document navigation is intentionally isolated from the previous dev page.
            // Actual in-app receipt link clicks below remain exercised.
            await page.close();
            page=await context.newPage();
            await page.setViewportSize({width,height:844});
            await page.emulateMedia({colorScheme:theme,reducedMotion:"reduce"});
            const response=await page.goto(root+route);
            expect(response?.status()).toBe(200);
            await expect(page).toHaveURL(localOrigin+root+route);
          }
          await go("finance-reports");
          await expect(page.getByText(s.persona==="admin"?(s.locale==="ar"?"رصيد الخزنة الحالي":"Aktueller Kassenbestand"):(s.locale==="ar"?"المبلغ المتبقي":"Offener Betrag"),{exact:true}).first()).toBeVisible();
          await capture(page,prefix+"overview");
          if(s.persona==="admin"&&width===320){
            const advanced=page.getByText(s.locale==="ar"?"تفاصيل الحساب":"Weitere Kennzahlen",{exact:true}).first();
            await advanced.click();
            const rows=advanced.locator("..").locator("dl > div");
            expect(await rows.count()).toBeGreaterThan(3);
            for(const row of await rows.all()){
              const dt=row.locator("dt"),dd=row.locator("dd");
              const a=await dt.boundingBox(),b=await dd.boundingBox();
              expect(Math.abs(a!.y-b!.y)).toBeLessThan(Math.max(a!.height,b!.height));
              if(s.locale==="de")expect(b!.x).toBeGreaterThanOrEqual(a!.x+a!.width-1);
            }
            await capture(page,prefix+"overview-advanced");
          }
          if(s.persona==="guardian"&&(width===320||width===390)){
            await page.getByText(s.locale==="ar"?"الفواتير والإيصالات":"Rechnungen und Belege",{exact:true}).click();
            await capture(page,prefix+"overview-expanded");
          }
          await go("invoices");
          await expect(page.locator('a[href*="/invoices?invoice='+record.invoice.id+'"]')).toBeVisible();
          if(s.persona==="admin")for(const row of records)await expect(page.locator('a[href*="/invoices?invoice='+row.invoice.id+'"]')).toBeVisible();
          else {
            const foreign=records.find(x=>x.label===(s.record==="A"?"B":"A"))!;
            await expect(page.locator('a[href*="/invoices?invoice='+foreign.invoice.id+'"]')).toHaveCount(0);
            await expect(page.locator(".school-content input[type=search]")).toHaveCount(0);
          }
          if(width<=430){
            const row=page.locator('a[href*="/invoices?invoice='+record.invoice.id+'"]');
            const name=row.locator("strong").first();
            await expect(name).toHaveText(record.invoice.studentName);
            const rowBounds=await row.boundingBox(),nameBounds=await name.boundingBox();
            expect(nameBounds!.width).toBeGreaterThan(rowBounds!.width*0.75);
          }
          await capture(page,prefix+"invoices");
          await go("invoices?invoice="+record.invoice.id);
          const invoicePdfLink=page.locator('a[download][href*="/finance/invoices/"]');
          await expect(invoicePdfLink).toBeVisible();
          await expect(invoicePdfLink).toHaveAttribute("href","/api/v1/finance/invoices/"+record.invoice.id+"/pdf?locale="+s.locale);
          if(s.locale==="de"){
            const amount=(visibleInvoice.balanceMinor/100).toFixed(2).replace(".",",");
            await expect(page.getByText(new RegExp(amount+"\\s*€")).first()).toBeVisible();
          }
          if(s.persona==="admin"){
            const paymentLink=page.locator(`a[href*="record-payment?invoice=${record.invoice.id}"]`);
            await expect(paymentLink).toHaveCount(visibleInvoice.balanceMinor>0?1:0);
          }
          await capture(page,prefix+"invoice-detail");
          // Follow the invoice's persona-scoped receipt link, not the staff ledger ID.
          const receiptLink=page.locator('.school-content a[href*="/receipts?receipt="]');
          await expect(receiptLink).toHaveCount(1);
          const receiptHref=await receiptLink.getAttribute("href");
          expect(receiptHref).toBe(root+"receipts?receipt="+visibleReceiptId+"&invoice="+record.invoice.id);
          if(s.persona==="admin")expect(receiptHref).toContain("receipt="+record.receiptId);
          else expect(receiptHref).not.toContain("receipt="+record.receiptId);
          await receiptLink.click();
          const receiptPdfLink=page.locator('a[download][href*="/finance/receipts/"]');
          await expect(receiptPdfLink).toBeVisible();
          await expect(receiptPdfLink).toHaveAttribute("href","/api/v1/finance/receipts/"+visibleReceiptId+"/pdf?locale="+s.locale);
          await capture(page,prefix+"receipt-detail");
          if(s.persona==="admin"){
            if(width===390){
              const payerProfile=(await fixtureApi(school,"/finance/children/"+record.invoice.studentId+"/payer",actorOptions)).payload.data;
              const active=payerProfile.designations.filter((d:{effectiveFromMonth:string})=>d.effectiveFromMonth<=clock.month)
                .sort((a:{effectiveFromMonth:string},b:{effectiveFromMonth:string})=>b.effectiveFromMonth.localeCompare(a.effectiveFromMonth))[0];
              await go("fee-settings?student="+record.invoice.studentId);
              await expect(page.locator(".school-content select").filter({has:page.locator(`option[value="${active.guardianId}"]`)})).toHaveValue(active.guardianId);
            }
            await go("receipts");
            await expect(page.locator('a[href*="receipt='+record.receiptId+'"]')).toBeVisible();
            await capture(page,prefix+"receipts");
            await go("receipts?view=cashbook");
            await expect(page.getByText("QA Spende – تبرع تجريبي",{exact:true})).toBeVisible();
            await expect(page.getByText("QA Material – أدوات مدرسية",{exact:true})).toBeVisible();
            await capture(page,prefix+"cashbook");
            if(width===320||width===390){
              await page.getByText(s.locale==="ar"?"تفاصيل الشهر":"Monatsdetails",{exact:true}).click();
              await page.getByRole("button",{name:s.locale==="ar"?"إضافة حركة":"Neue Buchung",exact:true}).click();
              await expect(page.locator('.school-content textarea')).toBeVisible();
              await capture(page,prefix+"cashbook-expanded");
            }
            if(width===320||width===390){
              const unpaid=records.find(x=>x.label==="C")!.invoice;
              await go("record-payment?invoice="+unpaid.id);
              await expect(page.getByRole("button",{name:s.locale==="ar"?"تأكيد السداد":"Zahlung bestätigen",exact:true})).toBeEnabled();
              await expect(page.locator(".school-content input[type=checkbox]")).toHaveCount(0);
              await expect(page.locator(".school-content input[inputmode=decimal]")).toHaveCount(1);
              await capture(page,prefix+"simple-payment");
              await go("record-payment?advanced=1&invoice="+unpaid.id);
              // A manually entered cash amount must not be overwritten when an invoice is selected.
              const received=page.locator(".school-content input[inputmode=decimal]").first();
              await received.fill("100.00");
              await page.getByRole("button",{name:s.locale==="ar"?"+ اختيار فاتورة (اختياري)":"+ Rechnung auswählen (optional)",exact:true}).click();
              const partial=records.find(x=>x.label==="B")!.invoice;
              await expect(page.locator(".school-content li").filter({hasText:partial.invoiceNumber})).toBeVisible();
              const extra=records.find(x=>x.label==="D")!.invoice;
              const option=page.locator(".school-content li").filter({hasText:extra.invoiceNumber});
              await option.getByRole("button",{name:s.locale==="ar"?"اختيار الفاتورة":"Rechnung auswählen",exact:true}).click();
              await expect(received).toHaveValue("100.00");
              const remove=page.getByRole("button",{name:s.locale==="ar"?"حذف":"Entfernen",exact:true});
              await remove.last().click();
              await expect(received).toHaveValue("100.00");
              // In suggestion mode, removal must reduce the total rather than create an unintended credit.
              await go("record-payment?advanced=1&invoice="+unpaid.id);
              // go() closes the old Page; recreate every page-bound locator after navigation.
              const suggested=page.locator(".school-content input[inputmode=decimal]").first();
              const initialAmount=(unpaid.balanceMinor/100).toFixed(2);
              await expect(suggested).toHaveValue(initialAmount);
              await page.getByRole("button",{name:s.locale==="ar"?"+ اختيار فاتورة (اختياري)":"+ Rechnung auswählen (optional)",exact:true}).click();
              await page.locator(".school-content li").filter({hasText:extra.invoiceNumber}).getByRole("button",{name:s.locale==="ar"?"اختيار الفاتورة":"Rechnung auswählen",exact:true}).click();
              await expect(suggested).toHaveValue(((unpaid.balanceMinor+extra.balanceMinor)/100).toFixed(2));
              await page.getByRole("button",{name:s.locale==="ar"?"حذف":"Entfernen",exact:true}).last().click();
              await expect(suggested).toHaveValue(initialAmount);
              const checkbox=page.locator(".school-content input[type=checkbox]").first();
              await checkbox.check();
              const review=page.getByRole("button",{name:s.locale==="ar"?"مراجعة":"Prüfen",exact:true});
              await expect(review).toBeEnabled();
              await capture(page,prefix+"payment-form");
              await review.click();
              await expect(page.getByRole("button",{name:s.locale==="ar"?"تأكيد":"Bestätigen",exact:true})).toBeVisible();
              await capture(page,prefix+"payment-review");
            }
            if(s.locale==="ar"&&width===1280){
              const item=records.find(x=>x.label==="C")!.invoice;
              await go("record-payment?invoice="+item.id);
              const amount=page.locator(".school-content input[inputmode=decimal]");
              const confirm=page.getByRole("button",{name:"تأكيد السداد",exact:true});
              await amount.fill("0");
              await confirm.click();
              await expect(page.getByText("اكتب مبلغًا أكبر من صفر ولا يتجاوز المتبقي.",{exact:true})).toBeVisible();
              await amount.fill((item.balanceMinor/100).toFixed(2));
              const posted=page.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname==="/api/v1/finance/receipts");
              await confirm.click();
              const response=await posted;
              expect(response.status(),"browser receipt write").toBe(201);
              await expect(page.getByRole("heading",{name:"تم تسجيل السداد",exact:true})).toBeVisible();
              const after=invoiceDetail.parse((await fixtureApi(school,"/finance/invoices/"+item.id,actorOptions)).payload.data);
              expect(after.state).toBe("paid");
              expect(after.balanceMinor).toBe(0);
              expect(after.receiptIds).toHaveLength(1);
            }
          }
        }
      }finally{await context.close();}
    }
  }finally{await school.close();}
});
