import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import {billingMonth,type Locale} from "@madrasty/contracts";
import Link from "next/link";
import {IssueInvoices} from "@/features/finance/IssueInvoices";
import {InvoiceDetails} from "@/features/finance/InvoiceDetails";
import {mayUse} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function InvoicesPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{invoice?:string;student?:string;period?:string;view?:string}>;
}){
  const [{locale},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const canPost=await mayUse(session,"finance.post");
  const canIssue=session.activePersona!=="guardian"&&await mayUse(session,"finance.issue");
  if(session.activePersona!=="guardian"){
    const [read,issue]=await Promise.all([mayUse(session,"finance.read"),mayUse(session,"finance.issue")]);
    if(!read&&!issue&&!canPost)notFound();
  }
  const root=`/${locale}/school/more/invoices`;
  if(query.view==="issue"){
    if(!canIssue)notFound();
    return <><Link className="plain-button" href={root}>{locale==="ar"?"الفواتير":"Rechnungen"}</Link><IssueInvoices locale={locale} initialStudent={z.uuid().safeParse(query.student).data} mayConfigureBank={await mayUse(session,"bank.configure")}/></>;
  }
  return <>{canIssue&&!query.invoice&&<Link className="primary-button" href={`${root}?view=issue`}>{locale==="ar"?"+ إصدار فاتورة":"+ Neue Rechnung"}</Link>}<InvoiceDetails locale={locale} canPost={canPost} invoice={z.uuid().safeParse(query.invoice).data}
    student={z.uuid().safeParse(query.student).data} period={billingMonth.safeParse(query.period).data}/></>;
}
