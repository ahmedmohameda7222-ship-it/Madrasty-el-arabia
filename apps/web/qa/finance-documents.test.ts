import assert from "node:assert/strict";
import {test} from "node:test";
import {invoicePdf,receiptPdf} from "../src/server/finance/documents";
import type {InvoiceDetail,ReceiptDetail} from "@madrasty/contracts";

const id="10000000-0000-4000-8000-000000000001";
const invoice:InvoiceDetail={id,invoiceNumber:"MA-R-QA-1",studentId:id,studentNumber:"MA-000001",studentName:"أحمد عبد الرحمن",payerName:"Salma Müller",period:"2026-11",kind:"monthly",dueDate:"2026-11-25",currency:"EUR",totalMinor:3200,allocatedMinor:0,balanceMinor:3200,state:"unpaid",issuedAt:"2026-11-01T08:00:00Z",cancelledAt:null,revision:1,lines:[{titleAr:"اشتراك شهري",titleDe:"Monatsbeitrag",amountMinor:3200}],paymentInstructions:null,issueInstructions:null,receiptIds:[],canInquire:false};
const receipt:ReceiptDetail={id,receiptNumber:"MA-E-QA-1",method:"cash",receivedDate:"2026-11-01",currency:"EUR",recordedAt:"2026-11-01T08:00:00Z",scope:"payer",amountMinor:3200,appliedMinor:3200,allocations:[]};
for(const locale of ["de","ar"] as const){
 test("synthetic invoice PDF "+locale,async()=>{
  const pdf=await invoicePdf(invoice,locale);
  assert.equal(pdf.subarray(0,8).toString(),"%PDF-1.4");
  assert.match(pdf.subarray(-30).toString(),/%%EOF/);
 });
 test("synthetic receipt PDF "+locale,async()=>{
  const pdf=await receiptPdf(receipt,locale);
  assert.equal(pdf.subarray(0,8).toString(),"%PDF-1.4");
 });
}

function actualText(value:string){
  return "<FEFF"+Buffer.from(value,"utf16le").swap16().toString("hex").toUpperCase()+">";
}
for(const locale of ["de","ar"] as const){
  test("invoice has a Unicode text layer and correct document language "+locale,async()=>{
    const source=(await invoicePdf(invoice,locale)).toString("latin1");
    assert.ok(source.includes("/Lang ("+locale+")"));
    assert.ok(source.includes("/ActualText "+actualText(invoice.studentName)));
    assert.ok(source.includes("/ActualText "+actualText(locale==="ar"?"اشتراك شهري":"Monatsbeitrag")));
    assert.match(source,/3 Tr/);
  });
  test("receipt has an extractable number and language "+locale,async()=>{
    const source=(await receiptPdf(receipt,locale)).toString("latin1");
    assert.ok(source.includes("/Lang ("+locale+")"));
    assert.ok(source.includes("/ActualText "+actualText((locale==="ar"?"الرقم":"Nummer")+": "+receipt.receiptNumber)));
  });
}

for(const locale of ["de","ar"] as const){
  test("professional invoice layout preserves financial content on one A4 page "+locale,async()=>{
    const source=(await invoicePdf({...invoice,allocatedMinor:2000,balanceMinor:1200,state:"partial"},locale)).toString("latin1");
    assert.match(source,/\/Type \/Pages \/Count 1\b/);
    for(const label of locale==="ar"?["بيانات الطالب ومسؤول السداد","بيانات الفاتورة","المبلغ المتبقي","المبلغ المدفوع","البند","المبلغ"]:["Rechnungsempfänger","Rechnungsdaten","Offener Betrag","Bereits bezahlt","Beschreibung","Betrag"]){
      assert.ok(source.includes("/ActualText "+actualText(label)),label);
    }
    assert.ok(source.includes(actualText(invoice.invoiceNumber)));
    assert.ok(source.includes(actualText(invoice.studentName)));
  });
  test("professional invoice handles long names, line items and bank data "+locale,async()=>{
    const longName="عبد الرحمن أحمد Müller ".repeat(9).trim();
    const lines=Array.from({length:36},(_,index)=>({titleAr:"اشتراك ومستلزمات مدرسية "+index,titleDe:"Schulmaterial und Unterricht "+index,amountMinor:100}));
    const item={...invoice,studentName:longName,payerName:longName,kind:"manual" as const,lines,totalMinor:3600,balanceMinor:3600,
      paymentInstructions:{beneficiary:"Madrasty El Arabia",iban:"DE89370400440532013000",reference:"QA-TRANSFER-001"}};
    const source=(await invoicePdf(item,locale)).toString("latin1");
    assert.match(source,/\/Type \/Pages \/Count [2-9]\b/);
    assert.ok(source.includes(actualText(longName)));
    assert.ok(source.includes(actualText(locale==="ar"?lines.at(-1)!.titleAr:lines.at(-1)!.titleDe)));
    assert.ok(source.includes(actualText(item.paymentInstructions.iban)));
    assert.ok(source.includes(actualText(item.paymentInstructions.reference)));
  });
}
