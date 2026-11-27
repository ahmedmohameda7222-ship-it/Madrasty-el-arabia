"use client";
import Link from "next/link";
import {z} from "zod";
import {automaticBillingSettings,cashbookMonth,type Locale} from "@madrasty/contracts";
import {useTimetableRead,TimetableRead} from "@/features/school/timetable/shared";
import {financeAmount} from "./invoice-ui";
import css from "./FinanceWorkspace.module.css";
const monthSchema=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const overviewSchema=z.object({month:monthSchema,schoolMonth:monthSchema,currency:z.string().regex(/^[A-Z]{3}$/),active:z.int().nonnegative(),paused:z.int().nonnegative(),months:z.array(z.object({month:monthSchema,cash:z.int().nonnegative(),bank:z.int().nonnegative()}))});
export function FinanceOverview({locale,month,refresh,canPost=false,canIssue=false}:{locale:Locale;month?:string;refresh:number;canPost?:boolean;canIssue?:boolean}){
 const ar=locale==="ar",root=`/${locale}/school/more`;
 const result=useTimetableRead(`/finance/overview${month?"?month="+month:""}`,overviewSchema,refresh);
 const cash=useTimetableRead(`/finance/cashbook${month?"?month="+month:""}`,cashbookMonth,refresh);
 const billing=useTimetableRead(canIssue?"/finance/automatic-billing":null,automaticBillingSettings,refresh);
 return <div className={css.workspace}>
 <TimetableRead locale={locale} result={cash}>{data=><div className={css.balance}><small>{ar?"رصيد الخزنة الحالي":"Aktueller Kassenbestand"}</small><strong><bdi>{data.balanceMinor<0?"−":""}{financeAmount(Math.abs(data.balanceMinor),data.currency,locale)}</bdi></strong><div className={css.balanceRows}><span>{ar?"مصروفات الشهر":"Barausgaben im Monat"}</span><bdi>{financeAmount(data.expenseMinor,data.currency,locale)}</bdi><span>{ar?"الإيداعات البنكية":"Bankeinzahlungen"}</span><bdi>{financeAmount(data.depositsMinor,data.currency,locale)}</bdi></div></div>}</TimetableRead>
 {canPost&&<Link className="primary-button" href={root+"/invoices?state=open"}>{ar?"الفواتير غير المدفوعة":"Offene Rechnungen"}</Link>}
 {canIssue&&<TimetableRead locale={locale} result={billing}>{data=>data.payerIssues.length>0?<Link className={css.recordRow} href={root+"/fee-settings"}><span><strong>{ar?"طلاب يحتاجون متابعة":"Handlungsbedarf bei Zahlern"}</strong><small>{ar?"راجع مسؤول السداد وأهلية الإشعارات.":"Zahler und Benachrichtigungsbereitschaft prüfen."}</small></span><strong>{data.payerIssues.length}</strong><span className={css.chevron} aria-hidden="true"/></Link>:<p className={css.secondary}>{ar?"لا توجد مشاكل حالية في تعيين مسؤول السداد أو أهلية الإشعارات.":"Keine aktuellen Probleme bei Zahlerzuordnung oder Benachrichtigungsbereitschaft."}</p>}</TimetableRead>}
 <nav className={css.recordList} aria-label={ar?"الحسابات":"Buchhaltung"}><Link className={css.recordRow} href={root+"/invoices"}><strong>{ar?"الفواتير":"Rechnungen"}</strong><span className={css.chevron} aria-hidden="true"/></Link><Link className={css.recordRow} href={root+"/receipts?view=cashbook"}><strong>{ar?"الخزنة والبنك":"Kasse & Bank"}</strong><span className={css.chevron} aria-hidden="true"/></Link></nav>
 <TimetableRead locale={locale} result={result}>{data=>{
 const m=(n:number)=>financeAmount(n,data.currency,locale),max=Math.max(1,...data.months.map(x=>x.cash+x.bank)),last=data.months.at(-1);
 return <><div className={css.metrics}><div><small>{ar?"طلاب نشطون":"Aktive Schüler"}</small><strong>{data.active}</strong></div><div><small>{ar?"طلاب متوقفون":"Pausierende Schüler"}</small><strong>{data.paused}</strong></div><div><small>{ar?"اشتراكات نقدية":"Barzahlungen"}</small><strong><bdi>{m(last?.cash??0)}</bdi></strong></div><div><small>{ar?"تحويلات بنكية":"Überweisungen"}</small><strong><bdi>{m(last?.bank??0)}</bdi></strong></div></div>
 <details className={css.disclosure}><summary>{ar?"المدفوعات آخر ٦ شهور":"Zahlungen der letzten 6 Monate"}</summary><p><small>{ar?"صافي المقبوض حسب شهر الاستلام، بعد الإلغاءات والاستردادات.":"Nettoeingänge nach Eingangsmonat, abzüglich Stornos und Erstattungen."}</small></p>
 <div className={css.chart}>{data.months.map(row=><div key={row.month}><bdi>{row.month}</bdi><div className={css.track} role="img" aria-label={m(row.cash+row.bank)}><span style={{width:(row.cash/max*100)+"%"}}/><span style={{width:(row.bank/max*100)+"%"}}/></div><strong><bdi>{m(row.cash+row.bank)}</bdi></strong></div>)}</div>
 <small>{ar?"أخضر: نقدي · رمادي: تحويل بنكي":"Grün: Bar · Grau: Überweisung"}</small></details></>;
 }}</TimetableRead>
 </div>;
}
