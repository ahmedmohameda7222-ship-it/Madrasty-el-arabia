"use client";

import css from "./FinanceWorkspace.module.css";

import Link from "next/link";
import {useState} from "react";
import {receiptState,receiptSummary,type Locale} from "@madrasty/contracts";
import {AcademicPageItems,useAcademicPage} from "@/features/academics/shared";
import {financeAmount} from "./invoice-ui";
import {receiptCopy} from "./receipt-ui";

const receipts=receiptSummary.array();
export function Reconciliation({locale,enabled,initialState}:{locale:Locale;enabled:boolean;initialState?:ReturnType<typeof receiptState.parse>}){
  const [state,setState]=useState<""|ReturnType<typeof receiptState.parse>>(initialState??""),text=receiptCopy[locale];
  const root=`/${locale}/school/more`,selected=receiptState.safeParse(state);
  const page=useAcademicPage(`/finance/receipts?limit=25${selected.success?"&state="+selected.data:""}`,receipts,0);
  return <section className={`${css.workspace} auth-form`}>
    <h1>{locale==="ar"?"المدفوعات":"Zahlungen"}</h1>
    <div className="header-actions">
      {enabled&&<Link className="primary-button" href={`${root}/record-payment`}>{text.record}</Link>}
      <Link className="plain-button" href={`${root}/stop-reviews`}>{locale==="ar"?"تسويات التوقف":"Gebührenkorrekturen"}</Link>
    </div>
    <label>{locale==="ar"?"الحالة":"Status"}<select value={state} onChange={(event)=>setState(receiptState.safeParse(event.target.value).data??"")}>
      <option value="">{text.all}</option>
      {receiptState.options.map((one)=><option key={one} value={one}>{text[one]}</option>)}
    </select></label>
    <AcademicPageItems locale={locale} page={page}>{(items)=><ul className={css.recordList}>{items.map((item)=><li key={item.id}>
      <Link className={css.recordRow} href={`${root}/receipts?receipt=${item.id}`}><span><strong><bdi>{item.receiptNumber}</bdi></strong><small><bdi>{item.receivedDate}</bdi> · {text[item.method]}</small>{item.remainderMinor>0&&<small>{text.remainder} · <bdi dir="ltr">{financeAmount(item.remainderMinor,item.currency)}</bdi></small>}</span><span className={css.recordValue}><strong><bdi dir="ltr">{financeAmount(item.amountMinor,item.currency)}</bdi></strong><small data-state={item.state}>{text[item.state]}</small></span><span className={css.chevron} aria-hidden="true"/></Link>
    </li>)}</ul>}</AcademicPageItems>
  </section>;
}
