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
