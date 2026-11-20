import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import {billingMonth,financeReportStatus,schoolDateSchema,type Locale} from "@madrasty/contracts";
import {FinanceReports} from "@/features/finance/FinanceReports";
import {mayUse} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function FinanceReportsPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{student?:string;period?:string;status?:string;asOf?:string}>;
}){
  const [{locale},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const staff=session.activePersona==="admin";
  if(session.activePersona!=="guardian"){
    const [read,post]=await Promise.all([mayUse(session,"finance.read"),mayUse(session,"finance.post")]);
    if(!read&&!post)notFound();
  }
  return <FinanceReports locale={locale} staff={staff} initial={{
    studentId:z.uuid().safeParse(query.student).data,period:billingMonth.safeParse(query.period).data,
    status:financeReportStatus.safeParse(query.status).data,asOf:schoolDateSchema.safeParse(query.asOf).data,
  }}/>;
}
