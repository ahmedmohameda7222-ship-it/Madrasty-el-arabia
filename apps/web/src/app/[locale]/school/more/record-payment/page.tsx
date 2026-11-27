import { presentationParams } from "@/server/identity/ui-locale";
import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import type {Locale} from "@madrasty/contracts";
import {RecordPayment} from "@/features/finance/RecordPayment";
import {mayUse} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function PaymentPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{invoice?:string;advanced?:string}>;
}){
  const [{locale},query,session]=await Promise.all([presentationParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(!await mayUse(session,"finance.post"))notFound();
  const invoice=z.uuid().safeParse(query.invoice).data;
  if(!invoice&&query.advanced!=="1")redirect(`/${locale}/school/more/invoices`);
  return <RecordPayment locale={locale} invoice={invoice} advanced={query.advanced==="1"}/>;
}
