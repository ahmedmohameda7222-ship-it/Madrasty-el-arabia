import {cashbookQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {readCashbook} from "@/server/finance/cashbook";
import {api,ApiError} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
const quote=(value:unknown)=>{let text=String(value??"");if(/^[\s]*[=+@-]/.test(text)&&typeof value!=="number")text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
export const GET=api(async(request,context)=>{
  const book=await readCashbook(await requireActor(request,context),academicQuery(request,cashbookQuery).month);
  if(book.entryCount>book.entries.length)throw new ApiError("validation");
  const rows=[["Datum","Art","Beschreibung","Betrag (kleinste Währungseinheit)","Währung","Erfasst von","Beleg-ID","Buchungs-ID","Korrigierte Buchung"],...book.entries.map(e=>[e.date,e.reversalOf?"movement_correction":e.kind,e.description,e.signedMinor,book.currency,e.actorId,e.receiptId,e.id,e.reversalOf])];
  return new Response("\ufeff"+rows.map(row=>row.map(quote).join(";")).join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="Kassenbuch-'+book.month+'.csv"',"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}});
});
