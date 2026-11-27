import { presentationParams } from "@/server/identity/ui-locale";
import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import {billingMonth,type Locale} from "@madrasty/contracts";
import {InvoiceDetails} from "@/features/finance/InvoiceDetails";
import { mayUseMany} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function InvoicesPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{invoice?:string;student?:string;period?:string}>;
}){
  const [{locale},query,session]=await Promise.all([presentationParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const [canPost,canIssue,read]=await mayUseMany(session,["finance.post","finance.issue","finance.read"]);
  if(session.activePersona!=="guardian"&&!read&&!canIssue&&!canPost)notFound();
  return <InvoiceDetails locale={locale} staff={session.activePersona!=="guardian"} canPost={canPost} canIssue={canIssue} invoice={z.uuid().safeParse(query.invoice).data}
    student={z.uuid().safeParse(query.student).data} period={billingMonth.safeParse(query.period).data}/>;
}
