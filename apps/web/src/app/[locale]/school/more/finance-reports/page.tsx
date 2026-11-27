import {FinanceNavigation} from "@/features/finance/FinanceNavigation";
import { presentationParams } from "@/server/identity/ui-locale";
import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import {billingMonth,financeReportStatus,schoolDateSchema,type Locale} from "@madrasty/contracts";
import {FinanceReports} from "@/features/finance/FinanceReports";
import { mayUseMany} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function FinanceReportsPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{student?:string;period?:string;status?:string;asOf?:string}>;
}){
  const [{locale},query,session]=await Promise.all([presentationParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const staff=session.activePersona==="admin";
  let canPost=false,canIssue=false,canRead=false,canBank=false;
  if(session.activePersona!=="guardian"){
    const [read,post,issue,bank]=await mayUseMany(session,["finance.read","finance.post","finance.issue","bank.configure"]);
    if(!read&&!post)notFound();
    canPost=post;canIssue=issue;canRead=read;canBank=bank;
  }
  return <>{staff&&<FinanceNavigation locale={locale} section="overview" read={canRead} post={canPost} issue={canIssue} bank={canBank}/>}<FinanceReports locale={locale} staff={staff} canPost={canPost} canIssue={canIssue} initial={{
    studentId:z.uuid().safeParse(query.student).data,period:billingMonth.safeParse(query.period).data??(staff?new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit"}).format(new Date()):undefined),
    status:financeReportStatus.safeParse(query.status).data,asOf:schoolDateSchema.safeParse(query.asOf).data,
  }}/></>;
}
