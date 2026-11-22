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
    assert.equal(ahmed.issueInstructions.iban, bank.iban);
    assert.match(ahmed.issueInstructions.reference, /MA-\d+/);
    await fixtureApi(school, `/finance/invoices/${ahmed.id}`, { token: nonpayer, status: 404 });
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

    const stop = enrollmentStop.parse((await fixtureApi(school, "/enrollment-stops", {
      method: "POST", token: payer, persona: "guardian", key: `${school.run}.pause-omar`, status: [200, 201],
      body: { studentId: ids.omar, lastAttendanceMonth: clock.month, duration: "one_month", reason: "Synthetic school break" },
    })).payload.data);
    assert.equal(stop.startMonth, "2026-12");
    const dashboard = await fixtureApi(school, `/school/work-queues?asOf=${queueDate}`, {token:admin,persona:"admin"});
    const pending = dashboard.payload.data.queues.find((row: {key:string}) => row.key==="noncontinuation_requests");
    assert.equal(pending?.state, "ready");
    assert.ok(pending.count > 0);
    const queue = await fixtureApi(school, `/school/work-queues/noncontinuation_requests?asOf=${queueDate}`, {token:admin,persona:"admin"});
    assert.ok(queue.payload.data.items.some((entry: {target:{requestId?: string}})=>entry.target.requestId===stop.id));
    await fixtureApi(school, `/school/work-queues/noncontinuation_requests?asOf=${queueDate}`, {token:payer,persona:"guardian",status:404});
    const decision = enrollmentStop.parse((await fixtureApi(school, `/enrollment-stops/${stop.id}/decision`, {
      method: "POST", token: admin, persona: "admin", key: `${school.run}.approve-omar`,
      body: { decision: "approve", revision: stop.revision },
    })).payload.data);
    assert.equal(decision.state, "approved");
    const resolved = await fixtureApi(school, `/school/work-queues/noncontinuation_requests?asOf=${queueDate}`, {token:admin,persona:"admin"});
    assert.ok(!resolved.payload.data.items.some((entry: {target:{requestId?: string}})=>entry.target.requestId===stop.id));
    const nextMonth = invoicePreview.parse(await send("/finance/invoice-previews", "next-month-preview", {
      ...selection, period: "2026-12",
    }));
    assert.equal(nextMonth.rows.find((row) => row.studentId === ids.omar)?.outcome, "stopped");
    assert.equal(nextMonth.rows.find((row) => row.studentId === ids.ahmed)?.outcome, "ready");
    const historical = invoiceDetail.parse((await fixtureApi(school, `/finance/invoices/${omar.id}`, { token: payer })).payload.data);
    assert.equal(historical.balanceMinor, 3200);
  } finally {
    await school.close();
  }
});
