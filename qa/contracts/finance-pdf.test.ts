import assert from "node:assert/strict";
import {test} from "node:test";
import {financePdfPages} from "../../apps/web/src/server/finance/pdf-pages";
test("finance PDF has valid object offsets and one page per rendered image",()=>{
 const pdf=financePdfPages([Buffer.from([255,216,255,217]),Buffer.from([255,216,255,217])]);
 const str=pdf.toString("latin1");
 assert.ok(str.startsWith("%PDF-1.4"));
 assert.ok(str.includes("/Count 2"));
 const start=Number(str.match(/startxref\n(\d+)/)?.[1]);
 assert.equal(str.slice(start,start+4),"xref");
 const rows=str.slice(start).split("\n").slice(3,11);
 for(const [i,row] of rows.entries())assert.ok(str.slice(Number(row.slice(0,10))).startsWith((i+1)+" 0 obj"));
 assert.throws(()=>financePdfPages([]));
});
