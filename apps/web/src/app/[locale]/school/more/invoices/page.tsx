import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import {billingMonth,type Locale} from "@madrasty/contracts";
import {InvoiceDetails} from "@/features/finance/InvoiceDetails";
import {mayUse} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function InvoicesPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{invoice?:string;student?:string;period?:string}>;
}){
  const [{locale},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(session.activePersona!=="guardian"){
    const [read,issue]=await Promise.all([mayUse(session,"finance.read"),mayUse(session,"finance.issue")]);
    if(!read&&!issue)notFound();
  }
  return <InvoiceDetails locale={locale} invoice={z.uuid().safeParse(query.invoice).data}
    student={z.uuid().safeParse(query.student).data} period={billingMonth.safeParse(query.period).data}/>;
}
