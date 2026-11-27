"use client";

import css from "./FinanceWorkspace.module.css";

import Link from "next/link";
import {useRef,useState,type FormEvent} from "react";
import {receiptAllocationInput,receiptDetail,receiptMutation,receiptReversalInput,receiptRefundInput,receiptRefundResult,receiptOptions,type Locale,type ReceiptStaffDetail} from "@madrasty/contracts";
import {ApiResponseError} from "@/api/client";
import {useSchoolCommand} from "@/api/commands";
import {TimetableRead,timetableError,useTimetableRead} from "@/features/school/timetable/shared";
import {useAccountScope} from "@/ui/AccountScope";
import {ConfirmedAt} from "@/ui/RecordValues";
import {financeAmount,inputAmountMinor} from "./invoice-ui";
import {InvoicePicker,receiptCopy,type InvoiceCandidate} from "./receipt-ui";

export function ReceiptDetails({locale,id,staff,returnHref}:{locale:Locale;id:string;staff:boolean;returnHref?:string}){
  const text=receiptCopy[locale],root=`/${locale}/school/more`;
  const [version,setVersion]=useState(0),[notice,setNotice]=useState("");
  const details=useTimetableRead(`/finance/receipts/${id}`,receiptDetail,version);
  return <section className={`${css.workspace} auth-form`}>
    <h1>{text.title}</h1>
    <Link className="plain-button" href={returnHref??`${root}/${staff?"receipts":"invoices"}`}>{text.back}</Link>
    {notice&&<p role="status">{notice}</p>}
    <TimetableRead locale={locale} result={details}>{(item)=>{
      const money=(value:number)=><bdi dir="ltr">{financeAmount(value,item.currency,locale)}</bdi>;
      return <div className="auth-form">
        <h2><bdi>{item.receiptNumber}</bdi></h2>
        <a className="plain-button" href={`/api/v1/finance/receipts/${item.id}/pdf?locale=${locale}`} download>{locale==="ar"?"تحميل إثبات السداد PDF":"Zahlungsbestätigung als PDF"}</a>
        <p>{text[item.method]} · <bdi>{item.receivedDate}</bdi></p>
        <ConfirmedAt locale={locale} value={item.recordedAt}/>
        <div className={css.balance}><small>{text.total}</small><strong>{money(item.amountMinor)}</strong></div>
        {item.scope==="staff"&&<>
          <p>{text[item.state]} · <bdi>{item.externalReceiptRef}</bdi></p>
          <p>{text.active} · {money(item.activeMinor)}</p>
          <p>{text.remainder} · {money(item.remainderMinor)}</p>
          {item.suggestedInvoiceId&&<Link href={`${root}/invoices?invoice=${item.suggestedInvoiceId}`}>{text.forInvoice}</Link>}
        </>}
        <p>{text.applied} · {money(item.appliedMinor)}</p>
        {!!item.refunds?.length&&<div className={css.panel}><h3>{locale==="ar"?"المبالغ المرتجعة":"Erstattungen"}</h3>{item.refunds.map(refund=><p key={refund.id}><bdi>{refund.refundedDate}</bdi> · {money(refund.amountMinor)}</p>)}</div>}
        <h3>{text.allocations}</h3>
        <ul className="group-list">{item.allocations.map((allocation)=><li key={allocation.id} className="timetable-day">
          <p><bdi>{allocation.studentName}</bdi> · <bdi>{allocation.studentNumber}</bdi> · <bdi>{allocation.period}</bdi></p>
          <p><Link href={`${root}/invoices?invoice=${allocation.invoiceId}`}><bdi>{allocation.invoiceNumber}</bdi></Link> · {money(allocation.amountMinor)}</p>
          <ConfirmedAt locale={locale} value={allocation.postedAt}/>
          {allocation.reversedAt&&<p>{text.correction} <bdi>{new Date(allocation.reversedAt).toLocaleDateString(locale==="ar"?"ar":"de-DE")}</bdi></p>}
          {allocation.reason&&<p><bdi>{allocation.reason}</bdi></p>}
        </li>)}</ul>
        {item.scope==="staff"&&<>
          {item.canPost&&item.activeMinor>0&&<RefundSection key={"refund:"+item.revision} locale={locale} item={item} refresh={(message)=>{setNotice(message);setVersion(n=>n+1);}}/>}
          {item.canPost&&<details className={css.disclosure}><summary>{locale==="ar"?"تصحيح تسجيل السداد":"Zahlungsbuchung korrigieren"}</summary><ReceiptActions key={item.revision} locale={locale} item={item} refresh={(message)=>{setNotice(message);setVersion((n)=>n+1);}}/></details>}
          <details className={css.disclosure}><summary>{text.history}</summary><ul className="group-list">{item.history.map((entry)=><li key={entry.revision}>
            <p>{entry.kind==="record"?text.recorded:entry.kind==="allocate"?text.allocateEvent:entry.kind==="unapply"?text.reversed:entry.kind==="refund"?text.refund:text.voidEvent}</p>
            <ConfirmedAt locale={locale} value={entry.postedAt}/>
            {entry.reason&&<p><bdi>{entry.reason}</bdi></p>}
          </li>)}</ul></details>
        </>}
      </div>;
    }}</TimetableRead>
  </section>;
}

type AllocationInput=ReturnType<typeof receiptAllocationInput.parse>;
type ReversalInput=ReturnType<typeof receiptReversalInput.parse>;
type Proposal={endpoint:"allocations";input:AllocationInput}|{endpoint:"reversals";input:ReversalInput};

function ReceiptActions({locale,item,refresh}:{locale:Locale;item:ReceiptStaffDetail;refresh:(message:string)=>void}){
  const text=receiptCopy[locale],command=useSchoolCommand(useAccountScope().persona);
  const [tab,setTab]=useState<"allocate"|"unapply"|"void_receipt">("allocate");
  const [rows,setRows]=useState<{invoice:InvoiceCandidate;amount:string}[]>([]);
  const [selected,setSelected]=useState<string[]>([]),[reason,setReason]=useState("");
  const [preview,setPreview]=useState<Proposal>(),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const {currency}=item,active=item.allocations.filter((entry)=>!entry.reversedAt);
  const allocation=receiptAllocationInput.safeParse({revision:item.revision,lines:rows.map(({invoice,amount})=>({
    invoiceId:invoice.id,invoiceRevision:invoice.revision,amountMinor:inputAmountMinor(amount,currency,invoice.balanceMinor),
  }))});
  const total=allocation.data?.lines.reduce((sum,entry)=>sum+entry.amountMinor,0)??0;
  const reversal=receiptReversalInput.safeParse({revision:item.revision,kind:tab,reason,...(tab==="unapply"?{allocationIds:selected}:{})});
  let candidate:Proposal|undefined;
  if(tab==="allocate"&&allocation.success&&total<=item.remainderMinor)candidate={endpoint:"allocations",input:allocation.data};
  if(tab!=="allocate"&&reversal.success)candidate={endpoint:"reversals",input:reversal.data};
  const money=(value:number)=><bdi dir="ltr">{financeAmount(value,currency,locale)}</bdi>;
  const amountText=(value:number)=>financeAmount(value,currency).split(" ")[0];
  function choose(selectedTab:typeof tab){
    setTab(selectedTab);setPreview(undefined);setError("");
  }
  function review(event:FormEvent){
    event.preventDefault();
    if(candidate)setPreview(candidate);
  }
  async function confirm(){
    if(!preview||busy)return;
    setBusy(true);setError("");
    try{
      await command(`/finance/receipts/${item.id}/${preview.endpoint}`,"POST",preview.input,receiptMutation);
      refresh(preview.endpoint==="allocations"?text.allocateEvent:text.corrected);
    }catch(problem){
      if(problem instanceof ApiResponseError&&problem.status===409){refresh(text.stale);return;}
      setError(timetableError(locale,problem));
    }finally{setBusy(false);}
  }
  const adjustment=new Map<string,{number:string;before:number;add:number}>();
  if(preview?.endpoint==="reversals"){
    const {input}=preview;
    for(const one of active){
      if(input.kind==="unapply"&&!input.allocationIds.includes(one.id))continue;
      const existing=adjustment.get(one.invoiceId);
      adjustment.set(one.invoiceId,{number:one.invoiceNumber,before:one.invoiceBalanceMinor??0,add:(existing?.add??0)+one.amountMinor});
    }
  }
  return <div className="auth-form">
    {error&&<p role="alert">{error}</p>}
    {preview?<div className="notice auth-form">
      <h3>{text.preview} · {text[tab]}</h3>
      {preview.endpoint==="allocations"?<>
        {preview.input.lines.map((line)=>{
          const invoice=rows.find((entry)=>entry.invoice.id===line.invoiceId)!.invoice;
          return <p key={line.invoiceId}><bdi>{invoice.invoiceNumber}</bdi> · {text.current} {money(invoice.balanceMinor)} · {text.after} {money(invoice.balanceMinor-line.amountMinor)}</p>;
        })}
        <p>{text.remainder} · {money(item.remainderMinor-total)}</p>
      </>:<>
        {[...adjustment.values()].map((one)=><p key={one.number}><bdi>{one.number}</bdi> · {text.current} {money(one.before)} · {text.after} {money(one.before+one.add)}</p>)}
        <p>{text.remainder} · {money(preview.input.kind==="void_receipt"?0:item.remainderMinor+[...adjustment.values()].reduce((sum,one)=>sum+one.add,0))}</p>
        <p>{text.reverseHint}</p><p><bdi>{preview.input.reason}</bdi></p>
      </>}
      <div className="header-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={()=>void confirm()}>{text.confirm}</button>
        <button type="button" className="plain-button" disabled={busy} onClick={()=>setPreview(undefined)}>{text.edit}</button>
      </div>
    </div>:<>
      <div className="header-actions">
        {item.remainderMinor>0&&<button type="button" className="plain-button" aria-pressed={tab==="allocate"} onClick={()=>choose("allocate")}>{text.allocate}</button>}
        {active.length>0&&<button type="button" className="plain-button" aria-pressed={tab==="unapply"} onClick={()=>choose("unapply")}>{text.unapply}</button>}
        {!item.refunds?.length&&<button type="button" className="plain-button" aria-pressed={tab==="void_receipt"} onClick={()=>choose("void_receipt")}>{text.void_receipt}</button>}
      </div>
      {tab==="allocate"&&item.remainderMinor>0&&<InvoicePicker locale={locale} currency={currency} payerInvoice={item.allocations[0]?.invoiceId??item.suggestedInvoiceId??rows[0]?.invoice.id} exclude={rows.map((row)=>row.invoice.id)}
        onPick={(invoice)=>setRows((list)=>[...list,{invoice,amount:amountText(Math.min(invoice.balanceMinor,item.remainderMinor-total))}])}/>}
      {(tab!=="allocate"||item.remainderMinor>0)&&<form className="auth-form" onSubmit={review}>
        {tab==="allocate"?rows.map((row,index)=><div key={row.invoice.id} className="timetable-day">
          <p><bdi>{row.invoice.invoiceNumber}</bdi> · <bdi>{row.invoice.studentName}</bdi> · {money(row.invoice.balanceMinor)}</p>
          <label>{text.amount}<input dir="ltr" inputMode="decimal" value={row.amount} maxLength={22}
            onChange={(event)=>setRows((list)=>list.map((one,i)=>i===index?{...one,amount:event.target.value}:one))}/></label>
          <button type="button" className="plain-button" onClick={()=>setRows((list)=>list.filter((_,i)=>i!==index))}>{text.remove}</button>
        </div>):<>
          {tab==="unapply"&&active.map((one)=><label key={one.id}>
            <input type="checkbox" checked={selected.includes(one.id)} onChange={(event)=>setSelected((list)=>event.target.checked?[...list,one.id]:list.filter((id)=>id!==one.id))}/>
            <bdi>{one.invoiceNumber}</bdi> · <bdi>{one.studentName}</bdi> · {money(one.amountMinor)}
          </label>)}
          <label>{text.reason}<textarea value={reason} maxLength={500} minLength={3} required onChange={(event)=>setReason(event.target.value)}/></label>
          <p>{text.reverseHint}</p>
        </>}
        <button type="submit" className="primary-button" disabled={!candidate}>{text.preview}</button>
      </form>}
    </>}
  </div>;
}

function RefundSection({locale,item,refresh}:{locale:Locale;item:ReceiptStaffDetail;refresh:(message:string)=>void}){
  const [open,setOpen]=useState(false),ar=locale==="ar";
  const options=useTimetableRead(open?"/finance/receipt-options":null,receiptOptions);
  return <details className={css.disclosure} open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>{ar?"تسجيل مبلغ مرتجع":"Erstattung erfassen"}</summary>
    {open&&<TimetableRead locale={locale} result={options}>{setup=><RefundForm locale={locale} item={item} today={setup.schoolDate} refresh={refresh}/>}</TimetableRead>}
  </details>;
}
function RefundForm({locale,item,today,refresh}:{locale:Locale;item:ReceiptStaffDetail;today:string;refresh:(message:string)=>void}){
  const ar=locale==="ar",command=useSchoolCommand(useAccountScope().persona),lock=useRef(false),cashRef=useRef("CASH-REFUND-"+crypto.randomUUID());
  const active=item.allocations.filter(a=>!a.reversedAt),initial=active[0];
  const [selected,setSelected]=useState(initial?.id??""),[amount,setAmount]=useState(initial?financeAmount(initial.amountMinor,item.currency).split(" ")[0]:""),
    [date,setDate]=useState(today),[reason,setReason]=useState(""),[reference,setReference]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[attempted,setAttempted]=useState(false);
  const target=active.find(a=>a.id===selected),maximum=target?.amountMinor??item.remainderMinor;
  const minor=inputAmountMinor(amount,item.currency,maximum);
  const input=receiptRefundInput.safeParse({revision:item.revision,allocationId:target?.id,amountMinor:minor,refundedDate:date,externalRefundRef:item.method==="cash"?cashRef.current:reference,reason,verified:true});
  async function save(e:FormEvent){
    e.preventDefault();setAttempted(true);setError("");
    if(lock.current||!input.success||date<item.receivedDate||date>today)return;
    lock.current=true;setBusy(true);
    try{
      await command(`/finance/receipts/${item.id}/refunds`,"POST",input.data,receiptRefundResult);
      refresh(ar?"تم تسجيل رد المبلغ":"Erstattung erfasst");
    }catch(problem){
      if(problem instanceof ApiResponseError&&problem.status===409)setError(ar?"البيانات اتغيرت. حدّث الإيصال أو راجع مرجع العملية.":"Daten wurden geändert. Beleg oder Buchungsreferenz prüfen.");
      else if(problem instanceof ApiResponseError&&problem.status===422)setError(ar?"تعذر رد المبلغ. راجع الرصيد والتخصيص؛ تسويات التوقف لها مسار مستقل.":"Erstattung nicht möglich. Prüfe Kassenbestand und Zuordnung. Teilnahmepausen haben eine eigene Gebührenkorrektur.");
      else setError(timetableError(locale,problem));
    }finally{lock.current=false;setBusy(false);}
  }
  return <form className="auth-form" noValidate onSubmit={save}>
    <p>{ar?"سجل هذه العملية فقط بعد رد المبلغ بالفعل. الفاتورة المرتبطة ترجع مستحقة بقيمة المبلغ المرتجع.":"Nur nach tatsächlich erfolgter Rückzahlung erfassen. Der erstattete Betrag wird auf der zugehörigen Rechnung wieder offen."}</p>
    <p>{item.method==="cash"?(ar?"رد نقدي من الخزنة":"Barauszahlung aus der Kasse"):(ar?"رد بتحويل بنكي":"Bankerstattung")}</p>
    {active.length>0&&<label>{ar?"الفاتورة":"Rechnung"}<select value={selected} disabled={busy} onChange={e=>{
      const id=e.target.value,a=active.find(x=>x.id===id);setSelected(id);setAmount(financeAmount(a?.amountMinor??item.remainderMinor,item.currency).split(" ")[0]);
    }}>{active.map(a=><option key={a.id} value={a.id}>{a.studentName} · {a.invoiceNumber} · {financeAmount(a.amountMinor,item.currency,locale)}</option>)}
    {item.remainderMinor>0&&<option value="">{ar?"مبلغ غير مخصص":"Nicht zugeordneter Betrag"}</option>}</select></label>}
    <label>{ar?"المبلغ المرتجع":"Erstattungsbetrag"}<input inputMode="decimal" dir="ltr" value={amount} disabled={busy} aria-invalid={attempted&&minor===null} onChange={e=>setAmount(e.target.value)}/></label>
    {attempted&&minor===null&&<p role="alert">{ar?"اكتب مبلغًا صحيحًا لا يتجاوز المبلغ المتاح.":"Gib einen gültigen Betrag bis zum verfügbaren Betrag ein."}</p>}
    <label>{ar?"تاريخ الاسترداد":"Erstattungsdatum"}<input type="date" min={item.receivedDate} max={today} value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label>
    {attempted&&(!date||date<item.receivedDate||date>today)&&<p role="alert">{ar?"اختر تاريخًا صحيحًا.":"Wähle ein gültiges Datum."}</p>}
    {item.method==="bank"&&<label>{ar?"مرجع التحويل":"Buchungsreferenz"}<input value={reference} maxLength={160} disabled={busy} onChange={e=>setReference(e.target.value)}/></label>}
    <label>{ar?"سبب الاسترداد":"Erstattungsgrund"}<textarea value={reason} maxLength={500} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
    {attempted&&!input.success&&minor!==null&&<p role="alert">{ar?"راجع التاريخ والسبب ومرجع التحويل.":"Prüfe Datum, Grund und Buchungsreferenz."}</p>}
    {error&&<p role="alert">{error}</p>}
    <button className="primary-button" disabled={busy}>{busy?(ar?"جاري التسجيل…":"Wird gespeichert…"):(ar?"تأكيد رد المبلغ":"Erstattung bestätigen")}</button>
  </form>;
}
