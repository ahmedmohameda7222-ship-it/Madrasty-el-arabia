import "server-only";
import sharp from "sharp";
import {createRequire} from "node:module";
import {join} from "node:path";
import {readFile} from "node:fs/promises";
import type {InvoiceDetail,ReceiptDetail,Locale} from "@madrasty/contracts";
import {financePdfPages} from "./pdf-pages";

const W=1240,H=1754,M=100,C=W-2*M,green="#28665d",ink="#18342e",muted="#53665f";
const xml=(value:string)=>value.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]!)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"");
const amount=(minor:number,currency:string,locale:Locale)=>{
  const fmt=new Intl.NumberFormat(locale==="ar"?"ar":"de-DE",{style:"currency",currency});
  return fmt.format(minor/10**(fmt.resolvedOptions().maximumFractionDigits??2));
};
const labels={
  de:{invoice:"Rechnung",receipt:"Zahlungsbeleg",number:"Dokumentnummer",student:"Schüler",studentNumber:"Schülernummer",payer:"Zahlungspflichtige Person",
    issued:"Ausgestellt am",due:"Fällig am",period:"Abrechnungsmonat",description:"Position",total:"Ursprünglicher Rechnungsbetrag",
    paid:"Zugeordnete Zahlung",open:"Offener Betrag",state:"Status",paidState:"Bezahlt",partial:"Teilweise bezahlt",unpaid:"Offen",cancelled:"Storniert",
    received:"Zahlungseingang",method:"Zahlungsart",cash:"Barzahlung",bank:"Banküberweisung",original:"Ursprünglich erfasst",active:"Aktuell zugeordnet",
    recorded:"Erfasst am",reversed:"Zuordnung aufgehoben",voided:"Stornierter Beleg",allocated:"Vollständig zugeordnet",needs_matching:"Noch nicht vollständig zugeordnet",
    bankInfo:"Überweisungsdaten",reference:"Verwendungszweck",beneficiary:"Kontoinhaber",page:"Seite",asOf:"Stand",thanks:"Vielen Dank für Ihre Unterstützung!"},
  ar:{invoice:"فاتورة",receipt:"إثبات سداد",number:"رقم المستند",student:"الطالب",studentNumber:"رقم الطالب",payer:"مسؤول السداد",
    issued:"تاريخ الإصدار",due:"تاريخ الاستحقاق",period:"شهر الاشتراك",description:"البند",total:"إجمالي الفاتورة الأصلي",
    paid:"المبلغ المخصص",open:"المبلغ المتبقي",state:"الحالة",paidState:"مسددة",partial:"مسددة جزئيًا",unpaid:"مستحقة",cancelled:"ملغاة",
    received:"تاريخ الاستلام",method:"طريقة الدفع",cash:"نقدي",bank:"تحويل بنكي",original:"المبلغ المسجل أصلًا",active:"المخصص حاليًا",
    recorded:"تاريخ التسجيل",reversed:"تم إلغاء التخصيص",voided:"إيصال ملغى",allocated:"مخصص بالكامل",needs_matching:"لم يخصص بالكامل",
    bankInfo:"بيانات التحويل",reference:"مرجع التحويل",beneficiary:"صاحب الحساب",page:"صفحة",asOf:"بتاريخ",thanks:"شكرًا لدعمكم!"}
};
type Line={label:string;value?:string;emphasis?:boolean;section?:boolean};
type Document={title:string;number:string;status?:string;lines:Line[]};
function invoiceDocument(item:InvoiceDetail,locale:Locale):Document{
  const t=labels[locale],money=(v:number)=>amount(v,item.currency,locale);
  const status=item.state==="paid"?t.paidState:t[item.state];
  const lines:Line[]=[
    {label:t.student,value:item.studentName},{label:t.studentNumber,value:item.studentNumber},{label:t.payer,value:item.payerName},
    {label:t.issued,value:item.issuedAt.slice(0,10)},{label:t.due,value:item.dueDate},{label:t.period,value:item.period},
    {label:t.description,section:true},...item.lines.map(l=>({label:locale==="ar"?l.titleAr:l.titleDe,value:money(l.amountMinor)})),
    {label:t.total,value:money(item.totalMinor),emphasis:true},{label:t.paid,value:money(item.allocatedMinor)},
    {label:t.open,value:money(item.balanceMinor),emphasis:true}
  ];
  if(item.paymentInstructions&&item.balanceMinor>0&&item.state!=="cancelled"){
    const b=item.paymentInstructions;lines.push({label:t.bankInfo,section:true},{label:t.beneficiary,value:b.beneficiary},
      {label:"IBAN",value:b.iban},{label:t.reference,value:b.reference});
  }
  return {title:t.invoice,number:item.invoiceNumber,status,lines};
}
function receiptDocument(item:ReceiptDetail,locale:Locale):Document{
  const t=labels[locale],money=(v:number)=>amount(v,item.currency,locale);
  return {title:t.receipt,number:item.receiptNumber,status:item.scope==="staff"?t[item.state]:undefined,
    lines:[{label:t.received,value:item.receivedDate},{label:t.method,value:t[item.method]},
      {label:t.recorded,value:item.recordedAt.slice(0,10)},{label:t.original,value:money(item.amountMinor),emphasis:true},
      {label:t.active,value:money(item.appliedMinor),emphasis:true},{label:t.description,section:true},
      ...item.allocations.map(a=>({label:a.studentName+" · "+a.invoiceNumber+" · "+a.period+(a.reversedAt?" ("+t.reversed+")":""),value:money(a.amountMinor)}))]};
}

async function render(doc:Document,locale:Locale){
  const t=labels[locale],rtl=locale==="ar";
  const req=createRequire(join(process.cwd(),"package.json"));
  const arabicFont=req.resolve("@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2");
  const latinFont=req.resolve("@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2");
  const logo=await readFile(join(process.cwd(),"public","school-192.png")).catch(()=>null);
  type Overlay={input:Buffer;left:number;top:number};
  let overlays:Overlay[]=[],pages:Buffer[]=[],y=0;
  async function text(value:string,width:number,size=27,color=ink,bold=false){
    const safe=xml(value.trim()||"—");
    return sharp({text:{text:"<span foreground='"+color+"'"+(bold?" weight='bold'":"")+">"+safe+"</span>",
      font:"IBM Plex Sans Arabic "+size,fontfile:/\p{Script=Arabic}/u.test(value)?arabicFont:latinFont,
      width,rgba:true}}).png().toBuffer({resolveWithObject:true});
  }
  async function put(value:string,x:number,top:number,width:number,size=27,color=ink,bold=false,right=false){
    const img=await text(value,width,size,color,bold);
    overlays.push({input:img.data,left:x+(right?Math.max(0,width-img.info.width):0),top});
    return img.info.height;
  }
  const rect=(x:number,top:number,w:number,h:number,color:string)=>{
    overlays.push({input:Buffer.from('<svg width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="'+color+'"/></svg>'),left:x,top});
  };
  async function start(){
    overlays=[];y=80;
    if(logo){const img=await sharp(logo).resize(90,90).png().toBuffer();overlays.push({input:img,left:rtl?W-M-90:M,top:80});}
    await put("Madrasty El Arabia",M+(rtl?0:110),96,C-110,36,green,true,rtl);
    rect(M,196,C,5,green);y=245;
    const heading=await put(doc.title,M,y,C,47,green,true,rtl);y+=heading+20;
    y+=await put(t.number+" · "+doc.number,M,y,C,25,muted,false,rtl)+16;
    if(doc.status)y+=await put(t.state+" · "+doc.status,M,y,C,29,green,true,rtl)+25;
    y+=20;
  }
  async function finish(){
    rect(M,H-130,C,2,"#c8d8d2");
    await put(t.asOf+" "+new Date().toISOString().slice(0,10),M,H-102,C-150,20,muted,false,rtl);
    await put(t.page+" "+(pages.length+1),W-M-130,H-102,130,20,muted,false,true);
    const image=await sharp({create:{width:W,height:H,channels:3,background:"#ffffff"}}).composite(overlays).jpeg({quality:91,chromaSubsampling:"4:4:4"}).toBuffer();
    pages.push(image);
  }
  await start();
  for(const line of doc.lines){
    if(line.section){
      if(y+100>H-180){await finish();await start();}
      rect(M,y,C,58,green);await put(line.label,M+16,y+9,C-32,28,"#ffffff",true,rtl);y+=75;continue;
    }
    const half=Math.floor(C*.47),gap=C-2*half;
    const left=await text(line.label,half,27,line.emphasis?green:muted,line.emphasis);
    const right=await text(line.value??"",half,28,ink,line.emphasis);
    const h=Math.max(left.info.height,right.info.height)+24;
    if(y+h>H-180){await finish();await start();}
    if(line.emphasis)rect(M,y-6,C,h,"#edf5f1");
    overlays.push({input:left.data,left:rtl?M+half+gap+half-left.info.width:M,top:y+4});
    overlays.push({input:right.data,left:rtl?M:M+half+gap+half-right.info.width,top:y+4});
    y+=h+8;
    rect(M,y-5,C,1,"#dfe8e4");
  }
  if(y+70>H-180){await finish();await start();}
  await put(t.thanks,M,y+18,C,25,green,true,rtl);
  await finish();
  return financePdfPages(pages,W,H);
}

export const invoicePdf=(item:InvoiceDetail,locale:Locale)=>render(invoiceDocument(item,locale),locale);
export const receiptPdf=(item:ReceiptDetail,locale:Locale)=>render(receiptDocument(item,locale),locale);
export function pdfResponse(bytes:Buffer,number:string){
  return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="'+number.replace(/[^A-Za-z0-9_-]/g,"_")+'.pdf"',"X-Content-Type-Options":"nosniff"}});
}
