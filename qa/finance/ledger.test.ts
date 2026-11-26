import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceDetail, invoicePreview, invoiceBatch } from "../../packages/contracts/src/finance/invoices";
import { receiptMutation } from "../../packages/contracts/src/finance/receipts";
import { enrollmentStop } from "../../packages/contracts/src/finance/stops";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolClock as clock } from "../fixtures/clock";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("issued fees, payer privacy and checked receipts affect one child and preserve the sibling balance", async () => {
  const school = schoolFixtures();
  try {
    let admin = await school.bearer("admin", "admin");
    const { apple, ids } = await setUpCalendar(school, admin);
    const [finance, payer, nonpayer] = await Promise.all([
      school.bearer("finance", "admin"), school.bearer("guardian-ar", "guardian"), school.bearer("guardian-de", "guardian"),
    ]);
    const bank = { beneficiary: "Musterschule QA", iban: "DE89370400440532013000", revision: 0 };
    const existingBank = (await fixtureApi(school, "/finance/bank", { token: admin })).payload.data;
    if (existingBank.active === null) {
      const factor = await school.localMfa("admin");
      const challenge = await fixtureApi(school, "/finance/bank/step-up", {
        method: "POST", token: admin, persona: "admin", status: 201,
        body: { ...bank, factorId: factor.factorId },
      });
      const proof = await fixtureApi(school, "/finance/bank/step-up", {
        method: "PATCH", token: admin, persona: "admin",
        body: { challengeId: challenge.payload.data.challengeId, code: factor.code() },
      });
      admin = proof.payload.data.providerSession.access_token;
      await fixtureApi(school, "/finance/bank", {
        method: "PUT", token: admin, persona: "admin", key: `${school.run}.initial-bank`,
        body: { ...bank, stepUpProof: proof.payload.data.stepUpProof },
      });
    } else {
      assert.equal(existingBank.active.iban, bank.iban);
    }

    const send = async (path: string, name: string, body: unknown, method: "POST" | "PUT" = "POST", status = 201) =>
      (await fixtureApi(school, path, { method, token: finance, persona: "admin", key: `${school.run}.${name}`, body, status })).payload.data;
    const automatic=(await fixtureApi(school,"/finance/automatic-billing",{token:finance})).payload.data;
    assert.equal(typeof automatic.enabled,"boolean");
    assert.ok(Array.isArray(automatic.payerIssues),"finance must surface payer activation and notification eligibility issues");
    for(const entry of automatic.payerIssues){
      assert.equal(typeof entry.studentId,"string");
      assert.ok(["payer_missing","payer_unreachable"].includes(entry.reason));
    }
    await fixtureApi(school,"/finance/automatic-billing",{token:payer,status:403});
    const updated=await send("/finance/automatic-billing","automatic-settings",{enabled:false,startMonth:clock.nextMonth,revision:automatic.revision},"PUT",200);
    assert.equal(updated.enabled,false);
    assert.equal(updated.revision,automatic.revision+1);
    const tariffs = (await fixtureApi(school, "/finance/tariffs", {token:finance,persona:"admin"})).payload.data;
    const existingTariff = tariffs.find((row: {effectiveFromMonth:string})=>row.effectiveFromMonth===clock.month);
    if (existingTariff) {
      assert.equal(existingTariff.dueDay,25);
      assert.equal(existingTariff.lines.reduce((total: number, line: {amountMinor:number})=>total+line.amountMinor,0),3200);
    } else {
      await send("/finance/tariffs", "tariff", {
        effectiveFromMonth: clock.month, dueDay: 25, lines: [{ titleAr: "QA fee", titleDe: "QA fee", amountMinor: 3200 }],
      });
    }
    for (const child of [ids.ahmed, ids.omar]) {
      const path = `/finance/children/${child}/payer`;
      const profile = (await fixtureApi(school, path, { token: finance })).payload.data;
      const guardian = profile.choices.find((entry: { displayName: string }) => entry.displayName === "سلمى عبد الرحمن محمد");
      assert.ok(guardian?.id);
      await send(path, `payer-${child}`, { guardianId: guardian.id, effectiveFromMonth: clock.month, revision: 0 }, "PUT", 200);
    }
    const healthAfter=(await fixtureApi(school,"/finance/automatic-billing",{token:finance})).payload.data;
    assert.ok(!healthAfter.payerIssues.some((entry:{studentId:string})=>[ids.ahmed,ids.omar].includes(entry.studentId)),"confirmed synthetic payer must not be flagged");
    const selection = { kind: "monthly", period: clock.month, classId: apple.id, studentIds: [ids.ahmed, ids.omar] };
    const prepared = invoicePreview.parse(await send("/finance/invoice-previews", "monthly-preview", selection));
    const issue = {
      previewId: prepared.previewId, revision: prepared.revision,
    };
    const batch = invoiceBatch.parse(await send("/finance/invoice-batches", "monthly-issue", issue));
    assert.equal(batch.issuedIds.length, 2);
    assert.deepEqual(invoiceBatch.parse(await send("/finance/invoice-batches", "monthly-issue", issue)), batch);
    const invoices = await Promise.all(batch.issuedIds.map(async (id) => invoiceDetail.parse((await fixtureApi(school, `/finance/invoices/${id}`, { token: payer })).payload.data)));
    const ahmed = invoices.find((invoice) => invoice.studentId === ids.ahmed);
    const omar = invoices.find((invoice) => invoice.studentId === ids.omar);
    assert.ok(ahmed && omar);
    assert.equal(ahmed.totalMinor, 3200);
    assert.ok(ahmed.issueInstructions);
    assert.equal(ahmed.issueInstructions.iban, bank.iban);
    assert.match(ahmed.issueInstructions.reference, /MA-\d+/);
    await fixtureApi(school, `/finance/invoices/${ahmed.id}`, { token: nonpayer, status: 404 });
    for (const locale of ["de","ar"] as const) {
      const doc = await fixtureApi(school, `/finance/invoices/${ahmed.id}/pdf?locale=${locale}`, {token:payer,locale});
      assert.match(doc.response.headers.get("content-type")??"", /application\/pdf/);
      assert.match(doc.response.headers.get("cache-control")??"", /no-store/);
      const bytes=Buffer.from(await doc.response.arrayBuffer());
      assert.equal(bytes.subarray(0,8).toString(),"%PDF-1.4");
      assert.match(bytes.subarray(-20).toString(),/%%EOF/);
    }
    await fixtureApi(school, `/finance/invoices/${ahmed.id}/pdf`, {token:nonpayer,status:404});

    const receipt = receiptMutation.parse(await send("/finance/receipts", "single-receipt", {
      externalReceiptRef: `${school.run}-BANK-01`, method: "bank", receivedDate: clock.day, currency: "EUR",
      amountMinor: 3200, invoiceId: ahmed.id, verified: true,
    }));
    assert.equal(receipt.remainderMinor, 0);
    const paid = invoiceDetail.parse((await fixtureApi(school, `/finance/invoices/${ahmed.id}`, { token: payer })).payload.data);
    const sibling = invoiceDetail.parse((await fixtureApi(school, `/finance/invoices/${omar.id}`, { token: payer })).payload.data);
    assert.equal(paid.state, "paid");
    assert.equal(paid.balanceMinor, 0);
    assert.equal(sibling.state, "unpaid");
    assert.equal(sibling.balanceMinor, 3200);
    // Exercise the real projector against the disposable school and the actual
    // named payer's session. A posting alone does not prove notification delivery.
    assert.ok(process.env.SCHOOL_WORKER_SECRET);
    assert.equal(paid.receiptIds.length,1);
    const financeNotices=async(token:string,template:string,targetId:string)=>{
      const rows=(await fixtureApi(school,"/notifications?limit=100",{token,persona:"guardian"})).payload.data;
      const matches:string[]=[];
      for(const row of rows.filter((n:{template:string})=>n.template===template)){
        const detail=(await fixtureApi(school,`/notifications/${row.id}`,{token,persona:"guardian"})).payload.data;
        if(detail.targets?.some((t:{id:string})=>t.id===targetId))matches.push(row.id);
      }
      return matches;
    };
    for(let i=0;i<24;i++){
      if((await financeNotices(payer,"invoice_issued",ahmed.id)).length&&
         (await financeNotices(payer,"payment_recorded",paid.receiptIds[0])).length)break;
      await fixtureApi(school,"/internal/dispatch",{method:"POST",token:process.env.SCHOOL_WORKER_SECRET});
    }
    const invoiceNotices=await financeNotices(payer,"invoice_issued",ahmed.id);
    const paymentNotices=await financeNotices(payer,"payment_recorded",paid.receiptIds[0]);
    assert.equal(invoiceNotices.length,1,"named payer receives exactly one invoice notice");
    assert.equal(paymentNotices.length,1,"named payer receives exactly one receipt notice");
    assert.equal((await financeNotices(nonpayer,"invoice_issued",ahmed.id)).length,0);
    assert.equal((await financeNotices(nonpayer,"payment_recorded",paid.receiptIds[0])).length,0);
    await fixtureApi(school,"/internal/dispatch",{method:"POST",token:process.env.SCHOOL_WORKER_SECRET});
    assert.deepEqual(await financeNotices(payer,"invoice_issued",ahmed.id),invoiceNotices);
    assert.deepEqual(await financeNotices(payer,"payment_recorded",paid.receiptIds[0]),paymentNotices);

    const payment = receiptMutation.parse(await send("/finance/receipts", "unmatched-receipt", {
      externalReceiptRef: `${school.run}-BANK-02`, method: "bank", receivedDate: clock.day, currency: "EUR",
      amountMinor: 4000, invoiceId: omar.id, verified: true,
    }));
    assert.equal(payment.state, "needs_matching");
    assert.equal(payment.remainderMinor, 4000);
    const {today: queueDate} = (await fixtureApi(school, "/school/work-queues", {token:admin,persona:"admin"})).payload.data;
    const matching = await fixtureApi(school, `/school/work-queues/settlement_review?asOf=${queueDate}`, {token:admin,persona:"admin"});
    assert.ok(matching.payload.data.items.some((entry: {target:{receiptId?: string}})=>entry.target.receiptId===payment.id));
    const allocated = receiptMutation.parse(await send(`/finance/receipts/${payment.id}/allocations`, "manual-allocation", {
      revision: payment.revision, lines: [{ invoiceId: omar.id, amountMinor: 1600, invoiceRevision: sibling.revision }],
    }));
    assert.equal(allocated.remainderMinor, 2400);
    const open=(await fixtureApi(school,`/finance/invoices?period=${clock.month}&state=open&limit=100`,{token:finance})).payload.data;
    assert.ok(open.some((row:{id:string;state:string})=>row.id===omar.id&&row.state==="partial"));
    assert.ok(!open.some((row:{id:string})=>row.id===ahmed.id));
    assert.ok(open.every((row:{state:string})=>row.state==="unpaid"||row.state==="partial"));
    const partial = invoiceDetail.parse((await fixtureApi(school, `/finance/invoices/${omar.id}`, { token: payer })).payload.data);
    assert.equal(partial.state, "partial");
    assert.equal(partial.balanceMinor, 1600);
    const reversal = receiptMutation.parse(await send(`/finance/receipts/${payment.id}/reversals`, "reverse-allocation", {
      kind: "unapply", revision: allocated.revision, allocationIds: [allocated.items[0].allocationId],
      reason: "Synthetic adjustment",
    }));
    assert.equal(reversal.remainderMinor, 4000);
    const restored = invoiceDetail.parse((await fixtureApi(school, `/finance/invoices/${omar.id}`, { token: payer })).payload.data);
    assert.equal(restored.balanceMinor, 3200);

    const overviewBefore=(await fixtureApi(school,"/finance/overview",{token:finance})).payload.data;
    assert.equal(overviewBefore.month,clock.month);
    assert.equal(overviewBefore.months.length,6);
    await fixtureApi(school,"/finance/overview",{token:payer,status:403});
    const cashBefore=(await fixtureApi(school,"/finance/cashbook",{token:finance})).payload.data;
    const donation={date:clock.day,kind:"donation",amountMinor:5000,description:"Synthetic donation"};
    const movement=await send("/finance/cashbook","donation",donation);
    assert.deepEqual(await send("/finance/cashbook","donation",donation),movement);
    await send("/finance/cashbook","expense",{date:clock.day,kind:"expense",amountMinor:1000,description:"Synthetic stationery"});
    await send("/finance/cashbook","bank-deposit",{date:clock.day,kind:"bank_deposit",amountMinor:1500,description:"Synthetic deposit"});
    const combined=receiptMutation.parse(await send("/finance/receipts","combined-cash",{externalReceiptRef:`${school.run}-CASH-01`,method:"cash",receivedDate:clock.day,currency:"EUR",amountMinor:100,verified:true,allocations:[{invoiceId:omar.id,amountMinor:100,invoiceRevision:restored.revision}]}));
    assert.equal(combined.state,"allocated");
    assert.equal(combined.items.length,1);
    await send(`/finance/receipts/${combined.id}/reversals`,"void-combined-cash",{kind:"void_receipt",revision:combined.revision,reason:"Synthetic cash correction"});
    const cashAfter=(await fixtureApi(school,"/finance/cashbook",{token:finance})).payload.data;
    assert.equal(cashAfter.balanceMinor-cashBefore.balanceMinor,2500);
    assert.equal(cashAfter.expenseMinor-cashBefore.expenseMinor,1000);
    assert.equal(cashAfter.depositsMinor-cashBefore.depositsMinor,1500);
    await fixtureApi(school,"/finance/cashbook",{token:payer,status:403});

    const stop = enrollmentStop.parse((await fixtureApi(school, "/enrollment-stops", {
      method: "POST", token: payer, persona: "guardian", key: `${school.run}.pause-omar`, status: [200, 201],
      body: { studentId: ids.omar, lastAttendanceMonth: clock.month, duration: "one_month", reason: "Synthetic school break" },
    })).payload.data);
    assert.equal(stop.startMonth, clock.nextMonth);
    assert.equal(stop.state, "approved");
    assert.equal(stop.canDecide, false);
    assert.equal(stop.endMonthExclusive, clock.nextMonth === "9999-12" ? null : (() => {
      const d = new Date(clock.nextMonth + "-01T00:00:00Z");
      d.setUTCMonth(d.getUTCMonth()+1); return d.toISOString().slice(0,7);
    })());
    const resolved = await fixtureApi(school, `/school/work-queues/noncontinuation_requests?asOf=${queueDate}`, {token:admin,persona:"admin"});
    assert.ok(!resolved.payload.data.items.some((entry: {target:{requestId?: string}})=>entry.target.requestId===stop.id));
    await fixtureApi(school, `/school/work-queues/noncontinuation_requests?asOf=${queueDate}`, {token:payer,persona:"guardian",status:404});
    const nextMonth = invoicePreview.parse(await send("/finance/invoice-previews", "next-month-preview", {
      ...selection, period: clock.nextMonth,
    }));
    assert.equal(nextMonth.rows.find((row) => row.studentId === ids.omar)?.outcome, "stopped");
    assert.equal(nextMonth.rows.find((row) => row.studentId === ids.ahmed)?.outcome, "ready");
    const futureBatch=invoiceBatch.parse(await send("/finance/invoice-batches","future-issue",{previewId:nextMonth.previewId,revision:nextMonth.revision}));
    assert.equal(futureBatch.issuedIds.length,1);
    const future=invoiceDetail.parse((await fixtureApi(school,`/finance/invoices/${futureBatch.issuedIds[0]}`,{token:payer})).payload.data);
    const freshOmar=invoiceDetail.parse((await fixtureApi(school,`/finance/invoices/${omar.id}`,{token:payer})).payload.data);
    const familyInput={externalReceiptRef:`${school.run}-CASH-FAMILY`,method:"cash",receivedDate:clock.day,currency:"EUR",amountMinor:200,verified:true,allocations:[
      {invoiceId:future.id,invoiceRevision:future.revision,amountMinor:100},{invoiceId:freshOmar.id,invoiceRevision:freshOmar.revision,amountMinor:100}
    ]};
    const family=receiptMutation.parse(await send("/finance/receipts","family-cash",familyInput));
    assert.equal(family.items.length,2);
    assert.equal(family.remainderMinor,0);
    assert.deepEqual(await send("/finance/receipts","family-cash",familyInput),family);
    const familyBook=(await fixtureApi(school,"/finance/cashbook",{token:finance})).payload.data;
    assert.equal(familyBook.balanceMinor-cashAfter.balanceMinor,200);
    await send(`/finance/receipts/${family.id}/reversals`,"void-family",{kind:"void_receipt",revision:family.revision,reason:"Synthetic family payment correction"});

    const otherProfile=(await fixtureApi(school,`/finance/children/${ids.other}/payer`,{token:finance})).payload.data;
    const otherPayer=otherProfile.choices.find((g:{activeAccount:boolean})=>g.activeAccount);
    assert.ok(otherPayer);
    if(!otherProfile.designations.some((d:{effectiveFromMonth:string})=>d.effectiveFromMonth===clock.month)){
      await send(`/finance/children/${ids.other}/payer`,"other-payer",{guardianId:otherPayer.id,effectiveFromMonth:clock.month,revision:otherProfile.revision},"PUT",200);
    }
    const config=(await fixtureApi(school,"/finance/automatic-billing",{token:finance})).payload.data;
    const enabled=await send("/finance/automatic-billing","enable-auto",{enabled:true,startMonth:clock.month,revision:config.revision},"PUT",200);
    try {
      assert.ok(process.env.SCHOOL_WORKER_SECRET);
      const dispatch=await fixtureApi(school,"/internal/dispatch",{method:"POST",token:process.env.SCHOOL_WORKER_SECRET});
      assert.ok(typeof dispatch.payload.data.automaticBilling.issued==="number");
      const first=(await fixtureApi(school,`/finance/invoices?studentId=${ids.other}&period=${clock.month}`,{token:finance})).payload.data;
      assert.equal(first.filter((row:{kind:string})=>row.kind==="monthly").length,1);
      await fixtureApi(school,"/internal/dispatch",{method:"POST",token:process.env.SCHOOL_WORKER_SECRET});
      const again=(await fixtureApi(school,`/finance/invoices?studentId=${ids.other}&period=${clock.month}`,{token:finance})).payload.data;
      assert.deepEqual(again.map((row:{id:string})=>row.id),first.map((row:{id:string})=>row.id));
      await fixtureApi(school,"/finance/automatic-billing",{token:payer,status:403});
    } finally {
      await send("/finance/automatic-billing","restore-auto",{enabled:true,startMonth:clock.nextMonth,revision:enabled.revision},"PUT",200);
    }
    const historical = invoiceDetail.parse((await fixtureApi(school, `/finance/invoices/${omar.id}`, { token: payer })).payload.data);
    assert.equal(historical.balanceMinor, 3200);
  } finally {
    await school.close();
  }
});
