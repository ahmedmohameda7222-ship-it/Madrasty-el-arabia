import "server-only";
import sharp from "sharp";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { InvoiceDetail, ReceiptDetail, Locale, CashbookMonth } from "@madrasty/contracts";

const W=1240,H=1754,margin=90,bodyWidth=W-margin*2,accent="#21665b",ink="#173b35",muted="#546660";
type Block={text:string;value?:string;size?:number;color?:string;bold?:boolean;gap?:number};
const labels={
  de:{invoice:"Rechnung",receipt:"Zahlungsbestätigung",number:"Nummer",payer:"Rechnungsempfänger",student:"Schüler",studentNumber:"Schülernummer",period:"Abrechnungsmonat",issued:"Rechnungsdatum",due:"Fälligkeit",status:"Status",unpaid:"Offen",partial:"Teilweise bezahlt",paid:"Bezahlt",cancelled:"Storniert",position:"Rechnungspositionen",total:"Ursprünglicher Rechnungsbetrag",allocated:"Zugeordnete Zahlungen",balance:"Offener Betrag",adjusted:"Aktueller Gebührenbetrag",method:"Zahlungsart",cash:"Barzahlung",bank:"Banküberweisung",received:"Eingangsdatum",receiptAmount:"Ursprünglicher Zahlungseingang",active:"Aktuell erfasster Betrag",applied:"Aktuell zugeordnet",reversed:"Zuordnung aufgehoben",voided:"Storniert",needs_matching:"Noch nicht vollständig zugeordnet",allocatedState:"Vollständig zugeordnet",allocations:"Rechnungszuordnungen",transfer:"Überweisungsdaten",reference:"Verwendungszweck",beneficiary:"Empfänger",thanks:"Vielen Dank für Ihre Unterstützung.",snapshot:"Stand",page:"Seite"},
  ar:{invoice:"فاتورة",receipt:"إثبات سداد",number:"الرقم",payer:"مسؤول السداد",student:"الطالب",studentNumber:"رقم الطالب",period:"شهر الاشتراك",issued:"تاريخ إصدار الفاتورة",due:"موعد السداد",status:"الحالة",unpaid:"مستحقة",partial:"مسددة جزئيًا",paid:"مسددة",cancelled:"ملغاة",position:"بنود الفاتورة",total:"قيمة الفاتورة الأصلية",allocated:"المبالغ المخصصة",balance:"المبلغ المتبقي",adjusted:"الرسوم الحالية",method:"طريقة الدفع",cash:"نقدي",bank:"تحويل بنكي",received:"تاريخ الاستلام",receiptAmount:"المبلغ المستلم الأصلي",active:"المبلغ المثبت حاليًا",applied:"المبلغ المخصص حاليًا",reversed:"تم إلغاء التخصيص",voided:"ملغى",needs_matching:"لم يخصص بالكامل",allocatedState:"مخصص بالكامل",allocations:"تخصيصات الفواتير",transfer:"بيانات التحويل",reference:"مرجع التحويل",beneficiary:"المستفيد",thanks:"شكرًا لدعمكم للمدرسة.",snapshot:"حالة الحساب بتاريخ",page:"صفحة"},
} as const;
const esc=(s:string)=>s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const date=(s:string,locale:Locale)=>new Intl.DateTimeFormat(locale==="ar"?"ar-EG":"de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(s.length===10?s+"T12:00:00Z":s));
const money=(n:number,currency:string,locale:Locale)=>{
  const fmt=new Intl.NumberFormat(locale==="ar"?"ar-EG":"de-DE",{style:"currency",currency});
  return fmt.format(n/10**(fmt.resolvedOptions().maximumFractionDigits??2));
};
const pair=(text:string,value:string):Block=>({text,value});
const heading=(text:string):Block=>({text,size:31,bold:true,color:accent,gap:22});

async function fontPath(){
  const root=join(process.cwd(),"node_modules","@fontsource","ibm-plex-sans-arabic");
  const arabic=join(root,"files","ibm-plex-sans-arabic-arabic-400-normal.woff2");
  // Register both subsets with Pango before drawing mixed-language records.
  await sharp({text:{text:"Madrasty",font:"IBM Plex Sans Arabic 22",fontfile:join(root,"files","ibm-plex-sans-arabic-latin-400-normal.woff2"),rgba:true}}).png().toBuffer();
  return arabic;
}
async function renderDocument(title:string,number:string,locale:Locale,blocks:Block[]){
  const rtl=locale==="ar",t=labels[locale],fontfile=await fontPath().catch(cause=>{console.error("Finance PDF stage: font initialization",cause instanceof Error?cause.name:"unknown");throw cause;});
  const logo=await readFile(join(process.cwd(),"public","school-192.png")).then(b=>sharp(b).resize(80,80,{fit:"contain"}).png().toBuffer()).catch(cause=>{console.error("Finance PDF stage: logo initialization",cause instanceof Error?cause.name:"unknown");throw cause;});
  type Layer={input:Buffer;left:number;top:number};
  let layers:Layer[]=[],y=0;
  const pages:Buffer[]=[];
  const raster=async(text:string,width:number,size:number,color:string,bold=false,align:"left"|"right"=rtl?"right":"left")=>{
    const markup='<span foreground="'+color+'">'+(bold?"<b>":"")+esc(text||" ")+(bold?"</b>":"")+"</span>";
    const {data,info}=await sharp({text:{text:markup,font:"IBM Plex Sans Arabic "+size,fontfile,width,align,rgba:true,wrap:"word-char"}}).png().toBuffer({resolveWithObject:true}).catch(cause=>{console.error("Finance PDF stage: text raster",cause instanceof Error?cause.name:"unknown");throw cause;});
    return {data,width:info.width,height:info.height};
  };
  const put=async(text:string,left:number,top:number,width:number,size:number,color:string,bold=false,align:"left"|"right"=rtl?"right":"left")=>{
    const image=await raster(text,width,size,color,bold,align);
    layers.push({input:image.data,left:align==="right"?left+width-image.width:left,top});
    return image.height;
  };
  async function start(){
    layers=[{input:logo,left:rtl?W-margin-80:margin,top:60}];
    await put("Madrasty El Arabia",rtl?margin:margin+105,68,bodyWidth-105,32,accent,true);
    const rule=await sharp({create:{width:bodyWidth,height:5,channels:3,background:accent}}).png().toBuffer();
    layers.push({input:rule,left:margin,top:162});
    const a=await put(title,margin,192,bodyWidth,46,ink,true);
    const b=await put(t.number+": "+number,margin,207+a,bodyWidth,25,muted);
    y=236+a+b;
  }
  async function finish(){
    await put(t.snapshot+": "+date(new Date().toISOString(),locale),margin,H-105,bodyWidth-130,19,muted);
    await put(t.page+" "+(pages.length+1),W-margin-125,H-105,125,19,muted,false,"right");
    pages.push(await sharp({create:{width:W,height:H,channels:3,background:"#ffffff"}}).composite(layers).jpeg({quality:94,chromaSubsampling:"4:4:4"}).toBuffer().catch(cause=>{console.error("Finance PDF stage: page composite",cause instanceof Error?cause.name:"unknown");throw cause;}));
  }
  await start();
  for(const block of blocks){
    const size=block.size??26,color=block.color??ink;
    const labelWidth=block.value===undefined?bodyWidth:Math.floor(bodyWidth*.48),valueWidth=bodyWidth-labelWidth-30;
    const a=await raster(block.text,labelWidth,size,color,block.bold);
    const b=block.value===undefined?undefined:await raster(block.value,valueWidth,size,color,block.bold,rtl?"left":"right");
    const height=Math.max(a.height,b?.height??0)+18+(block.gap??0);
    if(y+height>H-145){await finish();await start();}
    if(y+height>H-145)throw new Error("Document row exceeds page");
    const labelLeft=rtl?W-margin-labelWidth:margin;
    layers.push({input:a.data,left:rtl?labelLeft+labelWidth-a.width:labelLeft,top:y});
    if(b){const left=rtl?margin:W-margin-valueWidth;layers.push({input:b.data,left:rtl?left:left+valueWidth-b.width,top:y});}
    y+=height;
  }
  await finish();
  return imagePdf(pages);
}

// Image-only PDF; each A4 page is independently rendered at print resolution.
// Offsets are byte counts, not UTF-16 string lengths.
export function imagePdf(pages:Buffer[]){
  const objects:Buffer[]=[];
  const add=(s:string|Buffer)=>objects.push(typeof s==="string"?Buffer.from(s,"ascii"):s);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("<< /Type /Pages /Count "+pages.length+" /Kids ["+pages.map((_,i)=>(3+i*3)+" 0 R").join(" ")+"] >>");
  for(let i=0;i<pages.length;i++){
    const p=3+i*3,im=p+1,stream=p+2;
    add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im "+im+" 0 R >> >> /Contents "+stream+" 0 R >>");
    add(Buffer.concat([Buffer.from("<< /Type /XObject /Subtype /Image /Width "+W+" /Height "+H+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+pages[i].length+" >>\nstream\n"),pages[i],Buffer.from("\nendstream")]));
    const body="q\n595.28 0 0 841.89 0 0 cm\n/Im Do\nQ\n";
    add("<< /Length "+Buffer.byteLength(body)+" >>\nstream\n"+body+"endstream");
  }
  const chunks=[Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n","latin1")],offsets=[0];
  let offset=chunks[0].length;
  for(let i=0;i<objects.length;i++){
    offsets.push(offset);const chunk=Buffer.concat([Buffer.from((i+1)+" 0 obj\n"),objects[i],Buffer.from("\nendobj\n")]);
    chunks.push(chunk);offset+=chunk.length;
  }
  chunks.push(Buffer.from("xref\n0 "+offsets.length+"\n0000000000 65535 f \n"+offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Size "+offsets.length+" /Root 1 0 R >>\nstartxref\n"+offset+"\n%%EOF\n"));
  return Buffer.concat(chunks);
}

export async function invoicePdf(item:InvoiceDetail,locale:Locale){
  const t=labels[locale],m=(v:number)=>money(v,item.currency,locale);
  const blocks:Block[]=[pair(t.status,t[item.state]),pair(t.payer,item.payerName),pair(t.student,item.studentName),pair(t.studentNumber,item.studentNumber),pair(t.period,item.period),pair(t.issued,date(item.issuedAt,locale)),pair(t.due,date(item.dueDate,locale)),heading(t.position),
    ...item.lines.map(line=>pair(locale==="ar"?line.titleAr:line.titleDe,m(line.amountMinor))),
    {...pair(t.total,m(item.totalMinor)),bold:true},pair(t.allocated,m(item.allocatedMinor)),{...pair(t.balance,m(item.balanceMinor)),bold:true,color:accent,size:33}];
  if(item.state!=="cancelled"&&item.allocatedMinor+item.balanceMinor!==item.totalMinor)blocks.push(pair(t.adjusted,m(item.allocatedMinor+item.balanceMinor)));
  if(item.paymentInstructions&&item.balanceMinor>0&&item.state!=="cancelled"){
    const i=item.paymentInstructions;blocks.push(heading(t.transfer),pair(t.beneficiary,i.beneficiary),pair("IBAN",i.iban),pair(t.reference,i.reference));
  }
  blocks.push({text:t.thanks,color:accent,gap:20});
  return renderDocument(t.invoice,item.invoiceNumber,locale,blocks);
}
export async function receiptPdf(item:ReceiptDetail,locale:Locale){
  const t=labels[locale],m=(v:number)=>money(v,item.currency,locale);
  const blocks:Block[]=[pair(t.received,date(item.receivedDate,locale)),pair(t.method,t[item.method]),pair(t.receiptAmount,m(item.amountMinor))];
  if(item.scope==="staff")blocks.push(pair(t.status,item.state==="allocated"?t.allocatedState:t[item.state]),pair(t.active,m(item.activeMinor)));
  blocks.push({...pair(t.applied,m(item.appliedMinor)),bold:true,color:accent},heading(t.allocations));
  for(const a of item.allocations){blocks.push(pair(a.studentName+" · "+a.invoiceNumber+" · "+a.period,m(a.amountMinor)));if(a.reversedAt)blocks.push({text:t.reversed+" · "+date(a.reversedAt,locale),color:muted,size:22});}
  blocks.push({text:t.thanks,color:accent});
  return renderDocument(t.receipt,item.receiptNumber,locale,blocks);
}
export function pdfResponse(body:Buffer,filename:string){
  return new Response(new Uint8Array(body),{headers:{"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="'+filename.replace(/[^A-Za-z0-9_.-]/g,"_")+'.pdf"',"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}});
}

export async function cashbookPdf(item:CashbookMonth,locale:Locale){
  const ar=locale==="ar",m=(v:number)=>money(v,item.currency,locale),t=ar?{opening:"رصيد البداية",income:"المقبوضات",expenses:"المصروفات",deposit:"الإيداعات البنكية",refund:"المبالغ المرتجعة",correction:"التصحيحات",closing:"رصيد النهاية",entries:"الحركات"}:{opening:"Anfangsbestand",income:"Einnahmen",expenses:"Ausgaben",deposit:"Bankeinzahlungen",refund:"Erstattungen",correction:"Korrekturen",closing:"Endbestand",entries:"Buchungen"};
  return renderDocument(ar?"دفتر الخزنة":"Kassenbuch",item.month,locale,[
    pair(t.opening,m(item.openingMinor)),pair(t.income,m(item.incomeMinor)),pair(t.expenses,m(item.expenseMinor)),pair(t.deposit,m(item.depositsMinor)),pair(t.refund,m(item.refundsMinor)),pair(t.correction,m(item.correctionsMinor)),{...pair(t.closing,m(item.closingMinor)),bold:true},heading(t.entries),
    ...item.entries.map(e=>pair(e.date+" · "+e.description,m(e.signedMinor))),
  ]);
}
