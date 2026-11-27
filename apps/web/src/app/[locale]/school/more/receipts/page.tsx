import {FinanceNavigation} from "@/features/finance/FinanceNavigation";
import { presentationParams } from "@/server/identity/ui-locale";
import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import {billingMonth,invoiceState,receiptState,type Locale} from "@madrasty/contracts";
import Link from "next/link";
import {Cashbook} from "@/features/finance/Cashbook";
import css from "@/features/finance/FinanceWorkspace.module.css";
import {Reconciliation} from "@/features/finance/Reconciliation";
import {ReceiptDetails} from "@/features/finance/ReceiptDetails";
import { mayUseMany} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function ReceiptsPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{receipt?:string;state?:string;view?:string;month?:string;invoice?:string;period?:string;q?:string;student?:string;listState?:string}>;
}){
  const [{locale},query,session]=await Promise.all([presentationParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const id=z.uuid().safeParse(query.receipt).data;
  const invoice=z.uuid().safeParse(query.invoice).data,back=new URLSearchParams();
  if(invoice){back.set("invoice",invoice);const period=billingMonth.safeParse(query.period).data,student=z.uuid().safeParse(query.student).data;if(period)back.set("period",period);if(student)back.set("student",student);if(query.state==="open"||invoiceState.safeParse(query.state).success)back.set("state",query.state!);if(typeof query.q==="string")back.set("q",query.q.slice(0,100));}
  const returnHref=invoice?`/${locale}/school/more/invoices?${back.toString()}`:undefined;
  if(session.activePersona==="guardian"&&id)return <ReceiptDetails locale={locale} id={id} staff={false} returnHref={returnHref}/>;
  const [read,post,issue,bank]=await mayUseMany(session,["finance.read","finance.post","finance.issue","bank.configure"]);
  if(!read&&!post)notFound();
  if(id)return <><FinanceNavigation locale={locale} section="cash" read={read} post={post} issue={issue} bank={bank}/><ReceiptDetails locale={locale} id={id} staff returnHref={returnHref}/></>;
  const root=`/${locale}/school/more/receipts`,cash=query.view==="cashbook";
  return <><FinanceNavigation locale={locale} section="cash" read={read} post={post} issue={issue} bank={bank}/><div className="auth-form"><nav className={css.tabs} aria-label={locale==="ar"?"الخزنة والبنك":"Kasse & Bank"}>
    <Link className="plain-button" aria-current={!cash?"page":undefined} href={root}>{locale==="ar"?"سجل المدفوعات":"Zahlungsverlauf"}</Link>
    <Link className="plain-button" aria-current={cash?"page":undefined} href={root+"?view=cashbook"}>{locale==="ar"?"الخزنة":"Kasse"}</Link>
  </nav>{cash?<Cashbook locale={locale} initialMonth={billingMonth.safeParse(query.month).data}/>:<Reconciliation locale={locale} enabled={post} initialState={receiptState.safeParse(query.state).data}/>}</div></>;
}
