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
  const pages:Buffer[]=[],textPages:PdfTextRun[][]=[];
  let textRuns:PdfTextRun[]=[];
  const raster=async(text:string,width:number,size:number,color:string,bold=false,align:"left"|"right"=rtl?"right":"left")=>{
    const markup='<span foreground="'+color+'">'+(bold?"<b>":"")+esc(text||" ")+(bold?"</b>":"")+"</span>";
    const {data,info}=await sharp({text:{text:markup,font:"IBM Plex Sans Arabic "+size,fontfile,width,align,rgba:true,wrap:"word-char"}}).png().toBuffer({resolveWithObject:true}).catch(cause=>{console.error("Finance PDF stage: text raster",cause instanceof Error?cause.name:"unknown");throw cause;});
    return {data,width:info.width,height:info.height};
  };
  const put=async(text:string,left:number,top:number,width:number,size:number,color:string,bold=false,align:"left"|"right"=rtl?"right":"left")=>{
    const image=await raster(text,width,size,color,bold,align);
    const x=align==="right"?left+width-image.width:left;
    layers.push({input:image.data,left:x,top});
    textRuns.push({text,left:x,top,width:image.width,height:image.height});
    return image.height;
  };
  async function start(){
    textRuns=[];
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
    textPages.push(textRuns);
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
    const x=rtl?labelLeft+labelWidth-a.width:labelLeft;
    layers.push({input:a.data,left:x,top:y});
    textRuns.push({text:block.text,left:x,top:y,width:a.width,height:a.height});
    if(b&&block.value!==undefined){
      const left=rtl?margin:W-margin-valueWidth,x=rtl?left:left+valueWidth-b.width;
      layers.push({input:b.data,left:x,top:y});
      textRuns.push({text:block.value,left:x,top:y,width:b.width,height:b.height});
    }
    y+=height;
  }
  await finish();
  return imagePdf(pages,textPages,locale);
}

type PdfTextRun={text:string;left:number;top:number;width:number;height:number};

// ActualText preserves the logical Unicode text rather than re-shaping Arabic glyphs.
// Invisible placeholder glyphs locate the text without changing the printed page.
function textLayer(runs:readonly PdfTextRun[]){
  return runs.filter(run=>run.text.trim()).map(run=>{
    const unicode="FEFF"+Buffer.from(run.text,"utf16le").swap16().toString("hex").toUpperCase();
    const x=(run.left*595.28/W).toFixed(3);
    const y=(841.89-(run.top+run.height*.8)*841.89/H).toFixed(3);
    const h=Math.max(1,run.height*841.89/H).toFixed(3);
    const w=Math.max(1,run.width*595.28/W*2).toFixed(3);
    return `/Span << /ActualText <${unicode}> >> BDC\nBT /F1 1 Tf 3 Tr ${w} 0 0 ${h} ${x} ${y} Tm (x) Tj ET\nEMC\n`;
  }).join("");
}

// A4 image-backed layout with a Unicode extraction/search layer. Byte-accurate offsets.
// This is not a fully tagged PDF/UA document.
export function imagePdf(pages:Buffer[],textPages:readonly (readonly PdfTextRun[])[]=[],locale:Locale="de"){
  const objects:Buffer[]=[];
  const add=(s:string|Buffer)=>objects.push(typeof s==="string"?Buffer.from(s,"ascii"):s);
  add("<< /Type /Catalog /Pages 2 0 R /Lang ("+locale+") >>");
  add("<< /Type /Pages /Count "+pages.length+" /Kids ["+pages.map((_,i)=>(3+i*3)+" 0 R").join(" ")+"] >>");
  const font=3+pages.length*3;
  for(let i=0;i<pages.length;i++){
    const p=3+i*3,im=p+1,stream=p+2;
    add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im "+im+" 0 R >> /Font << /F1 "+font+" 0 R >> >> /Contents "+stream+" 0 R >>");
    add(Buffer.concat([Buffer.from("<< /Type /XObject /Subtype /Image /Width "+W+" /Height "+H+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+pages[i].length+" >>\nstream\n"),pages[i],Buffer.from("\nendstream")]));
    const body="q\n595.28 0 0 841.89 0 0 cm\n/Im Do\nQ\n"+textLayer(textPages[i]??[]);
    add("<< /Length "+Buffer.byteLength(body)+" >>\nstream\n"+body+"endstream");
  }
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const chunks=[Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n","latin1")],offsets=[0];
  let offset=chunks[0].length;
  for(let i=0;i<objects.length;i++){
    offsets.push(offset);const chunk=Buffer.concat([Buffer.from((i+1)+" 0 obj\n"),objects[i],Buffer.from("\nendobj\n")]);
    chunks.push(chunk);offset+=chunk.length;
  }
  chunks.push(Buffer.from("xref\n0 "+offsets.length+"\n0000000000 65535 f \n"+offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Size "+offsets.length+" /Root 1 0 R >>\nstartxref\n"+offset+"\n%%EOF\n"));
  return Buffer.concat(chunks);
}

// Professional invoice layout, approved in the DE/AR A4 prototype.
// Reuses the existing Unicode extraction layer and font registration; receipts
// and cashbook PDFs continue using renderDocument unchanged.
export async function invoicePdf(item:InvoiceDetail,locale:Locale){
  const rtl=locale==="ar",t=labels[locale],M=112,R=W-M,C=R-M,bottom=1570;
  const brand="#14665b",dark="#174e45",body="#203a36",soft="#637772",rule="#d5e0dc";
  const ltrDate=(s:string)=>new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Europe/Berlin"}).format(new Date(s.length===10?s+"T12:00:00Z":s));
  const month=new Intl.DateTimeFormat(rtl?"ar-EG-u-nu-latn":"de-DE",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(item.period+"-01T12:00:00Z"));
  const m=(n:number)=>money(n,item.currency,"de");
  const fontfile=await fontPath();
  const logo=await readFile(join(process.cwd(),"public","school-192.png")).then(b=>sharp(b).resize(82,82,{fit:"contain"}).png().toBuffer());
  type Layer={input:Buffer;left:number;top:number};
  type Page={layers:Layer[];runs:PdfTextRun[]};
  const pages:Page[]=[];
  let page:Page={layers:[],runs:[]},y=0;
  const startAlign=rtl?"right":"left",endAlign=rtl?"left":"right";
  // Logical horizontal coordinates mirror the complete layout, not just text.
  const x=(offset:number,width:number)=>rtl?R-offset-width:M+offset;
  async function measure(text:string,width:number,size:number,color=body,bold=false,align:"left"|"right"=startAlign){
    const markup='<span foreground="'+color+'">'+(bold?"<b>":"")+esc(text||" ")+(bold?"</b>":"")+"</span>";
    const {data,info}=await sharp({text:{text:markup,font:"IBM Plex Sans Arabic "+size,fontfile,width:Math.floor(width),align,rgba:true,wrap:"word-char"}}).png().toBuffer({resolveWithObject:true});
    return {text,data,w:info.width,h:info.height};
  }
  type Raster=Awaited<ReturnType<typeof measure>>;
  function place(r:Raster,left:number,top:number,width:number,align:"left"|"right"=startAlign){
    const px=align==="right"?left+width-r.w:left;
    if(px<0||top<0||px+r.w>W||top+r.h>H)throw new Error("Invoice layout exceeds A4 page");
    page.layers.push({input:r.data,left:Math.round(px),top:Math.round(top)});
    page.runs.push({text:r.text,left:Math.round(px),top:Math.round(top),width:r.w,height:r.h});
  }
  async function put(text:string,offset:number,top:number,width:number,size:number,color=body,bold=false,align:"left"|"right"=startAlign){
    const r=await measure(text,width,size,color,bold,align);place(r,x(offset,width),top,width,align);return r.h;
  }
  async function box(offset:number,top:number,width:number,height:number,fill:string,stroke=fill,radius=0){
    width=Math.round(width);height=Math.round(height);
    const input=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><rect x="1" y="1" width="'+(width-2)+'" height="'+(height-2)+'" rx="'+radius+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="2"/></svg>')).png().toBuffer();
    page.layers.push({input,left:Math.round(x(offset,width)),top:Math.round(top)});
  }
  async function divider(top:number,offset=0,width=C,color=rule){await box(offset,top,width,3,color);}
  async function start(first:boolean){
    page={layers:[],runs:[]};pages.push(page);
    page.layers.push({input:logo,left:x(0,82),top:112});
    await put("Madrasty El Arabia",112,116,C-112,32,brand,true);
    await put(rtl?"إدارة المدرسة والحسابات":"Schulverwaltung · Buchhaltung",112,166,C-112,19,soft);
    await divider(236);
    const titleH=await put(t.invoice,0,first?286:274,C,first?62:38,"#163d36",true);
    const numberY=(first?286:274)+titleH+14;
    const numberH=await put(item.invoiceNumber,0,numberY,Math.floor(C*.62),23,soft);
    const badgeText=t[item.state];
    const palette=item.state==="paid"?["#e8f4ef","#cce4da","#14665b"]:item.state==="partial"?["#fbf6e8","#e6d4ad","#79571c"]:item.state==="cancelled"?["#f2f4f3","#d5e0dc","#546660"]:["#fbf6e8","#e6d4ad","#79571c"];
    const status=await measure(badgeText,312,22,palette[2],false,endAlign);
    const badgeWidth=Math.max(140,status.w+40);
    const badgeH=Math.max(56,status.h+24);
    const badgeY=numberY+Math.round((numberH-badgeH)/2);
    await box(C-badgeWidth,badgeY,badgeWidth,badgeH,palette[0],palette[1],20);
    place(status,x(C-badgeWidth, badgeWidth)+Math.round((badgeWidth-status.w)/2),badgeY+Math.round((badgeH-status.h)/2),status.w,"left");
    y=Math.max(numberY+numberH,badgeY+badgeH)+32;
  }
  async function room(height:number){
    if(y+height>bottom)await start(false);
    if(y+height>bottom)throw new Error("Invoice section exceeds printable area");
  }
  await start(true);
  const heroW=C-72,mainW=Math.floor(heroW*.61),dueW=heroW-mainW-24;
  const amount=await measure(m(item.balanceMinor),mainW,58,"#0c6151",true);
  const balanceLabel=await measure(t.balance,mainW,22,"#506a61");
  const dueLabel=await measure(t.due,dueW,22,"#506a61",false,endAlign);
  const due=await measure(ltrDate(item.dueDate),dueW,30,body,true,endAlign);
  const heroH=Math.max(194,balanceLabel.h+amount.h+78,dueLabel.h+due.h+78);
  await room(heroH);
  await box(0,y,C,heroH,"#e8f4ef","#cce4da",24);
  place(balanceLabel,x(36,mainW),y+36,mainW);
  place(amount,x(36,mainW),y+48+balanceLabel.h,mainW);
  const dueY=y+Math.round((heroH-dueLabel.h-due.h-10)/2);
  place(dueLabel,x(C-36-dueW,dueW),dueY,dueW,endAlign);
  place(due,x(C-36-dueW,dueW),dueY+dueLabel.h+10,dueW,endAlign);
  y+=heroH+48;
  const col=Math.floor((C-60)/2);
  async function details(offset:number,title:string,fields:[string,string][]){
    let top=y;
    top+=await put(title,offset,top,col,22,brand,true)+18;
    for(const [label,value] of fields){
      top+=await put(label,offset,top,col,19,soft)+4;
      top+=await put(value,offset,top,col,24,body,true)+14;
    }
    return top;
  }
  const leftEnd=await details(0,rtl?"بيانات الطالب ومسؤول السداد":"Rechnungsempfänger",[[rtl?t.payer:"Zahler",item.payerName],[t.student,item.studentName],[t.studentNumber,item.studentNumber]]);
  const rightEnd=await details(col+60,rtl?"بيانات الفاتورة":"Rechnungsdaten",[[t.period,month],[t.issued,ltrDate(item.issuedAt)]]);
  y=Math.max(leftEnd,rightEnd)+34;
  const descWidth=Math.floor(C*.64)-40,amountWidth=C-descWidth-76;
  async function tableHeader(){
    y+=await put(t.position,0,y,C,22,brand,true)+18;
    await box(0,y,C,62,dark);
    await put(rtl?"البند":"Beschreibung",24,y+17,descWidth,21,"#ffffff",true);
    await put(rtl?"المبلغ":"Betrag",C-24-amountWidth,y+17,amountWidth,21,"#ffffff",true,endAlign);
    y+=62;
  }
  await room(150);await tableHeader();
  for(const line of item.lines){
    const desc=await measure(rtl?line.titleAr:line.titleDe,descWidth,24);
    const amount=await measure(m(line.amountMinor),amountWidth,24,body,false,endAlign);
    const height=Math.max(desc.h,amount.h)+60;
    if(y+height>bottom){await start(false);await tableHeader();}
    if(y+height>bottom)throw new Error("Invoice line exceeds printable area");
    place(desc,x(24,descWidth),y+30,descWidth);
    place(amount,x(C-24-amountWidth,amountWidth),y+30,amountWidth,endAlign);
    y+=height;await divider(y-2);
  }
  y+=30;
  const summaryW=510,summaryOffset=C-summaryW,summaryLabelW=268,summaryValueW=summaryW-summaryLabelW-16;
  const adjusted=item.state!=="cancelled"&&item.allocatedMinor+item.balanceMinor!==item.totalMinor;
  const totals:[string,string,boolean][]=[[rtl?"إجمالي الفاتورة":"Rechnungsbetrag",m(item.totalMinor),false],[rtl?"المبلغ المدفوع":"Bereits bezahlt",m(item.allocatedMinor===0?0:-item.allocatedMinor),false]];
  if(item.state==="cancelled")totals.push([rtl?"المبلغ الملغى":"Stornierter Betrag",m(item.totalMinor-item.allocatedMinor===0?0:-(item.totalMinor-item.allocatedMinor)),false]);
  if(adjusted)totals.push([t.adjusted,m(item.allocatedMinor+item.balanceMinor),false]);
  totals.push([t.balance,m(item.balanceMinor),true]);
  const measured=await Promise.all(totals.map(async([label,value,last])=>({last,a:await measure(label,summaryLabelW,last?29:22,last?brand:soft,last),b:await measure(value,summaryValueW,last?29:25,last?brand:body,true,endAlign)})));
  const totalH=measured.reduce((n,r)=>n+Math.max(r.a.h,r.b.h)+36,0);
  await room(totalH);
  for(const r of measured){
    if(r.last)await divider(y,summaryOffset,summaryW,brand);
    place(r.a,x(summaryOffset,summaryLabelW),y+17,summaryLabelW);
    place(r.b,x(C-summaryValueW,summaryValueW),y+17,summaryValueW,endAlign);
    y+=Math.max(r.a.h,r.b.h)+36;
    if(!r.last)await divider(y-2,summaryOffset,summaryW);
  }
  if(item.paymentInstructions&&item.balanceMinor>0&&item.state!=="cancelled"){
    y+=22;
    const i=item.paymentInstructions;
    const bankRows:[[string,string],[string,string],[string,string]]=[[t.beneficiary,i.beneficiary],["IBAN",i.iban],[t.reference,i.reference]];
    const cells=await Promise.all(bankRows.map(async ([label,value])=>({a:await measure(label,300,21,soft),b:await measure(value,C-330,23,body,true,endAlign)})));
    const blockH=80+cells.reduce((n,r)=>n+Math.max(r.a.h,r.b.h)+22,0);
    await room(blockH);y+=await put(t.transfer,0,y,C,23,brand,true)+20;
    for(const r of cells){place(r.a,x(0,300),y,300);place(r.b,x(330,C-330),y,C-330,endAlign);y+=Math.max(r.a.h,r.b.h)+22;}
  }
  y+=25;
  const thanks=await measure(t.thanks,C,23,dark,true),note=await measure(rtl?"تعكس هذه الفاتورة حالة السداد حتى التاريخ الموضح أدناه.":"Diese Rechnung zeigt den Zahlungsstand zum unten angegebenen Datum.",C,21,soft);
  await room(thanks.h+note.h+42);
  await divider(y);y+=24;place(thanks,x(0,C),y,C);y+=thanks.h+12;place(note,x(0,C),y,C);
  const images:Buffer[]=[],runs:PdfTextRun[][]=[];
  const snapshot=t.snapshot+": "+ltrDate(new Date().toISOString());
  for(let index=0;index<pages.length;index++){
    page=pages[index];
    await divider(1616);
    await put(snapshot,0,1642,C-200,18,soft);
    await put(t.page+" "+(index+1)+" / "+pages.length,C-180,1642,180,18,soft,false,endAlign);
    runs.push(page.runs);
    images.push(await sharp({create:{width:W,height:H,channels:3,background:"#ffffff"}}).composite(page.layers).jpeg({quality:94,chromaSubsampling:"4:4:4"}).toBuffer());
  }
  return imagePdf(images,runs,locale);
}
export async function receiptPdf(item:ReceiptDetail,locale:Locale){
  const t=labels[locale],m=(v:number)=>money(v,item.currency,locale);
  const blocks:Block[]=[pair(t.received,date(item.receivedDate,locale)),pair(t.method,t[item.method]),pair(t.receiptAmount,m(item.amountMinor))];
  if(item.scope==="staff")blocks.push(pair(t.status,item.state==="allocated"?t.allocatedState:t[item.state]),pair(t.active,m(item.activeMinor)));
  blocks.push({...pair(t.applied,m(item.appliedMinor)),bold:true,color:accent});
  if(item.refunds?.length){blocks.push(heading(locale==="ar"?"المبالغ المرتجعة":"Erstattungen"));for(const refund of item.refunds)blocks.push(pair(date(refund.refundedDate,locale),m(refund.amountMinor)));}
  blocks.push(heading(t.allocations));
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
    ...item.entries.map(e=>pair(e.date+" · "+(e.reversalOf?(ar?"تصحيح حركة":"Buchungskorrektur")+" · ":"")+e.description,m(e.signedMinor))),
  ]);
}
