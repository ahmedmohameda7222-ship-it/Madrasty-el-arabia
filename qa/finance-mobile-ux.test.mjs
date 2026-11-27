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
  assert.match(source("FinanceOverview.tsx"), /canPost&&<Link[^>]*invoices/);
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

test("payer readiness on the overview is limited to authorized billing staff",()=>{
  const overview=source("FinanceOverview.tsx");
  assert.match(overview,/canIssue\?"\/finance\/automatic-billing":null/);
  assert.match(overview,/payerIssues\.length/);
  const route=readFileSync(new URL("../apps/web/src/app/[locale]/school/more/finance-reports/page.tsx",import.meta.url),"utf8");
  assert.match(route,/\[read,post,issue,bank\]=await mayUseMany\(session,\["finance.read","finance.post","finance.issue","bank.configure"\]\)/);
  assert.match(route,/canIssue=issue/);
  assert.match(route,/canIssue=\{canIssue\}/);
});

test("combined payment picker supports stable same-payer invoice scope on both clients",()=>{
  assert.match(source("RecordPayment.tsx"), /payerInvoice=\{payerAnchor\}/);
  assert.match(source("receipt-ui.tsx"), /&payerInvoice=/);
  const native=readFileSync(new URL("../apps/android/app/src/main/java/de/madrasty/app/finance/RecordPayment.kt",import.meta.url),"utf8");
  assert.match(native,/&payerInvoice=/);
  assert.match(native,/payerAnchor = payerAnchor/);
});

test("cashbook corrections are explicit, permission-gated and use an append-only command",()=>{
  const web=source("Cashbook.tsx");
  assert.match(web,/data\.canPost&&entry\.canReverse/);
  assert.match(web,/\/finance\/cashbook\/reversals/);
  const native=readFileSync(new URL("../apps/android/app/src/main/java/de/madrasty/app/finance/FinanceExtras.kt",import.meta.url),"utf8");
  assert.match(native,/entry\.optBoolean\("canReverse"\)/);
  assert.match(native,/\/finance\/cashbook\/reversals/);
});

test("normal invoice payments use one submit and keep advanced allocation separate",()=>{
  const page=source("RecordPayment.tsx");
  assert.match(page,/function SimpleInvoicePayment/);
  const simple=page.slice(page.indexOf("function SimpleInvoicePayment"),page.indexOf("function PaymentForm"));
  assert.match(simple,/verified:true/);
  assert.match(simple,/invoiceRevision:initial.revision/);
  assert.match(simple,/command\("\/finance\/receipts","POST"/);
  assert.doesNotMatch(simple,/type="checkbox"|setPreview|InvoicePicker/);
  assert.match(simple,/type="date"/);
  assert.match(simple,/role="alert"/);
  assert.match(source("Reconciliation.tsx"), /record-payment\?advanced=1/);
});

test("finance date controls are visible and never transparent required inputs",()=>{
  assert.doesNotMatch(source("FinanceWorkspace.module.css"), /\.dateControl>input[^{]*\{[^}]*opacity:0/);
});

test("native invoice payments also use a single confirmation and revision-checked allocation",()=>{
  const native=readFileSync(new URL("../apps/android/app/src/main/java/de/madrasty/app/finance/RecordPayment.kt",import.meta.url),"utf8");
  const simple=native.slice(native.indexOf("private fun SimpleInvoicePayment("),native.indexOf("private fun PaymentForm("));
  assert.match(simple,/Submit\(ready,R.string.receipt_confirm_payment/);
  assert.match(simple,/put\("invoiceRevision",initial.getInt\("revision"\)\)/);
  assert.match(simple,/put\("verified",true\)/);
  assert.doesNotMatch(simple,/receipt_confirmed_external|fee_preview|ReceiptInvoicePicker/);
});

test("participation pause starts next month and is confirmed directly on both clients",()=>{
  const web=source("StopRequest.tsx");
  assert.doesNotMatch(web,/setPreview|setLast|type="month"/);
  assert.match(web,/lastAttendanceMonth:month/);
  assert.match(web,/duration:"one_month"/);
  assert.match(web,/command\("\/enrollment-stops","POST"/);
  const native=readFileSync(new URL("../apps/android/app/src/main/java/de/madrasty/app/finance/StopRequest.kt",import.meta.url),"utf8");
  assert.doesNotMatch(native,/var review|fee_preview|var last/);
  assert.match(native,/put\("lastAttendanceMonth", todayMonth\)/);
  assert.match(native,/put\("duration", "one_month"\)/);
});

test("V2 invoice issuing defaults to one pupil and uses an inline payer repair",()=>{
  const page=source("IssueInvoices.tsx");
  assert.match(page,/useState<"student"\|"class"\|"school">\("student"\)/);
  assert.match(page,/<InlinePayerEditor\b/);
  assert.doesNotMatch(page,/href=\{\x60\$\{root\}\/fee-settings\?student=/);
  assert.match(page,/readyRows\.length/);
  assert.match(page,/command\("\/finance\/invoice-batches","POST"/);
});
test("V2 daily cash and fee saves do not require a separate preview",()=>{
  assert.doesNotMatch(source("Cashbook.tsx"),/setPreview\(true\)/);
  assert.doesNotMatch(source("FeeSettings.tsx"),/setReview\(true\)/);
});
