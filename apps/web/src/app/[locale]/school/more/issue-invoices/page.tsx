import { displayParams } from "@/server/identity/display-locale";
import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import type {Locale} from "@madrasty/contracts";
import {IssueInvoices} from "@/features/finance/IssueInvoices";
import {mayUse} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function IssueInvoicesPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{student?:string}>;
}){
  const [{locale},query,session]=await Promise.all([displayParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const [issue,bank]=await Promise.all([mayUse(session,"finance.issue"),mayUse(session,"bank.configure")]);
  if(!issue)notFound();
  return <IssueInvoices locale={locale} initialStudent={z.uuid().safeParse(query.student).data} mayConfigureBank={bank}/>;
}
