import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("../apps/web/src/features/finance/", import.meta.url);
const source = (name) => readFileSync(new URL(name, dir), "utf8");
test("finance screens use dedicated workspace instead of auth cards", () => {
  for (const file of ["FinanceReports.tsx","InvoiceDetails.tsx","RecordPayment.tsx","IssueInvoices.tsx","ReceiptDetails.tsx","Reconciliation.tsx","FeeSettings.tsx","AutomaticBilling.tsx"]) {
    assert.doesNotMatch(source(file), /className="auth-card auth-form"/, file);
    assert.match(source(file), /css\.workspace|css\.panel/, file);
  }
});
test("cash balance precedes overview metrics and advanced details are collapsed", () => {
  const overview=source("FinanceOverview.tsx");
  assert.ok(overview.indexOf("result={cash}") < overview.indexOf("result={result}"));
  assert.match(overview, /className=\{css\.balance\}/);
  assert.match(source("Cashbook.tsx"), /<details className=\{css\.disclosure\}/);
  assert.match(source("FinanceReports.tsx"), /<details className=\{css\.disclosure\}/);
});
test("invoice and payment lists group rows with amount and accessible links", () => {
  for(const file of ["InvoiceDetails.tsx","Reconciliation.tsx"]) assert.match(source(file), /className=\{css\.recordList\}/, file);
});
