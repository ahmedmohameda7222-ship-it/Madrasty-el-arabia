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

test("Android finance lists use Material list items and advanced report filters are optional", () => {
  const android=new URL("../apps/android/app/src/main/java/de/madrasty/app/finance/", import.meta.url);
  for(const file of ["InvoiceDetails.kt","Reconciliation.kt"]) assert.match(readFileSync(new URL(file,android),"utf8"), /FinanceRecordRow\(/);
  assert.match(readFileSync(new URL("FinanceReports.kt",android),"utf8"), /if \(showFilters\)/);
  assert.match(readFileSync(new URL("FinanceExtras.kt",android),"utf8"), /if \(addMovement\)/);
});
test("overview payment action is capability-gated", () => {
  assert.match(source("FinanceOverview.tsx"), /canPost&&<Link[^>]*record-payment/);
});

test("monthly billing has one owner and one page heading", () => {
  const route=readFileSync(new URL("../apps/web/src/app/[locale]/school/more/fee-settings/page.tsx",import.meta.url),"utf8");
  assert.equal((route.match(/<AutomaticBilling\b/g)||[]).length+(source("FeeSettings.tsx").match(/<AutomaticBilling\b/g)||[]).length,1);
  assert.doesNotMatch(source("FeeSettings.tsx"), /<h1>/);
});
test("guardian invoice search is not an administrative search", () => {
  assert.match(source("InvoiceDetails.tsx"), /staff&&<form className=\{css\.search\}/);
  assert.match(source("FinanceReports.tsx"), /data\.scope==="payer"/);
});
test("invoice kind has a specific label and checkboxes use aligned controls", () => {
  assert.match(source("IssueInvoices.tsx"), /Rechnungsart/);
  assert.doesNotMatch(source("IssueInvoices.tsx"), /<label><input type="checkbox"/);
});
test("finance primary form actions remain easy to reach", () => {
  for(const file of ["RecordPayment.tsx","IssueInvoices.tsx"]) assert.match(source(file), /css\.formAction/);
});

test("native family finance uses the payer summary rather than administrative report fields",()=>{
  const native=readFileSync(new URL("../apps/android/app/src/main/java/de/madrasty/app/finance/FinanceReports.kt",import.meta.url),"utf8");
  assert.match(native,/data\.getString\("scope"\) == "payer"/);
  assert.match(native,/FinancePayerSummary\(/);
});

test("monthly billing configuration lives inside the fee tab, never over the payer editor",()=>{
  const route=readFileSync(new URL("../apps/web/src/app/[locale]/school/more/fee-settings/page.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(route, /<AutomaticBilling\b/);
  assert.match(source("FeeSettings.tsx"), /tab==="tariffs"\?<\>[\s\S]*?<AutomaticBilling\b/);
  const native=readFileSync(new URL("../apps/android/app/src/main/java/de/madrasty/app/finance/FeeSettings.kt",import.meta.url),"utf8");
  assert.match(native,/if \(!payerTab\)\s*\{[\s\S]*?AutomaticBillingPanel\(model\)/);
});
