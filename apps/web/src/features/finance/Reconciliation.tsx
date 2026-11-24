"use client";

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
  return <section className="auth-card auth-form">
    <h1>{locale==="ar"?"المدفوعات":"Zahlungen"}</h1>
    {enabled&&<Link className="plain-button" href={`${root}/receipts?view=record`}>{text.record}</Link>}
    <label>{text.title}<select value={state} onChange={(event)=>setState(receiptState.safeParse(event.target.value).data??"")}>
      <option value="">{text.all}</option>
      {receiptState.options.map((one)=><option key={one} value={one}>{text[one]}</option>)}
    </select></label>
    <AcademicPageItems locale={locale} page={page}>{(items)=><ul className="group-list">{items.map((item)=><li key={item.id} className="timetable-day">
      <Link className="group-row" href={`${root}/receipts?receipt=${item.id}`}><bdi>{item.receiptNumber}</bdi>{text[item.state]}</Link>
      <p><bdi>{item.receivedDate}</bdi> · {text[item.method]} · <bdi dir="ltr">{financeAmount(item.amountMinor,item.currency)}</bdi></p>
      <p>{text.remainder} · <bdi dir="ltr">{financeAmount(item.remainderMinor,item.currency)}</bdi></p>
    </li>)}</ul>}</AcademicPageItems>
  </section>;
}
