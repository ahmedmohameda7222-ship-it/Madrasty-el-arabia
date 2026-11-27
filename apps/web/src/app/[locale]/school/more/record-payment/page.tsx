import {FinanceNavigation} from "@/features/finance/FinanceNavigation";
import { presentationParams } from "@/server/identity/ui-locale";
import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import {billingMonth,invoiceState,type Locale} from "@madrasty/contracts";
import {RecordPayment} from "@/features/finance/RecordPayment";
import {mayUseMany} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function PaymentPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{invoice?:string;advanced?:string;period?:string;state?:string;q?:string;student?:string;from?:string}>;
}){
  const [{locale},query,session]=await Promise.all([presentationParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const [post,read,issue,bank]=await mayUseMany(session,["finance.post","finance.read","finance.issue","bank.configure"]);
  if(!post)notFound();
  const invoice=z.uuid().safeParse(query.invoice).data;
  if(!invoice&&query.advanced!=="1")redirect(`/${locale}/school/more/invoices`);
  const list=new URLSearchParams();
  const period=billingMonth.safeParse(query.period).data,student=z.uuid().safeParse(query.student).data;
  if(period)list.set("period",period);if(student)list.set("student",student);
  if(query.state==="open"||invoiceState.safeParse(query.state).success)list.set("state",query.state!);
  if(typeof query.q==="string")list.set("q",query.q.slice(0,100));
  return <><FinanceNavigation locale={locale} section="invoices" read={read} post={post} issue={issue} bank={bank}/><RecordPayment locale={locale} invoice={invoice} advanced={query.advanced==="1"} listQuery={list.toString()} fromList={query.from==="list"}/></>;
}
