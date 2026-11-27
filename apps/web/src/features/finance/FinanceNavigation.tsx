"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {billingMonth,type Locale} from "@madrasty/contracts";
import css from "./FinanceWorkspace.module.css";

export function FinanceNavigation({locale,section,read,post,issue,bank}:{locale:Locale;section:"overview"|"invoices"|"cash"|"settings";read:boolean;post:boolean;issue:boolean;bank:boolean}){
  const ar=locale==="ar",root=`/${locale}/school/more`,params=useSearchParams();
  const period=billingMonth.safeParse(params.get("period")??params.get("month")).data;
  const month=period?"?period="+period:"";
  return <nav className={css.financeNav} aria-label={ar?"الحسابات":"Buchhaltung"}>
    {(read||post)&&<Link aria-current={section==="overview"?"page":undefined} href={root+"/finance-reports"+month}>{ar?"نظرة عامة":"Übersicht"}</Link>}
    {(read||post||issue)&&<Link aria-current={section==="invoices"?"page":undefined} href={root+"/invoices"+month}>{ar?"الفواتير":"Rechnungen"}</Link>}
    {(read||post)&&<Link aria-current={section==="cash"?"page":undefined} href={root+"/receipts?view=cashbook"+(period?"&month="+period:"")}>{ar?"الخزنة والبنك":"Kasse & Bank"}</Link>}
    {(issue||bank)&&<Link className={css.settingsNav} aria-current={section==="settings"?"page":undefined} href={root+"/fee-settings"} aria-label={ar?"إعدادات الحسابات":"Buchhaltungseinstellungen"} title={ar?"إعدادات الحسابات":"Buchhaltungseinstellungen"}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/><circle cx="12" cy="12" r="8"/></svg></Link>}
  </nav>;
}
