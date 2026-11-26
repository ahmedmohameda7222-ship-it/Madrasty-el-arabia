import { presentationParams } from "@/server/identity/ui-locale";
import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import type {Locale} from "@madrasty/contracts";
import {StopReview} from "@/features/finance/StopReview";
import {mayUse} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function StopReviewsPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{review?:string}>;
}){
  const [{locale},query,session]=await Promise.all([presentationParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const [read,post]=await Promise.all([mayUse(session,"finance.read"),mayUse(session,"finance.post")]);
  if(!read&&!post)notFound();
  return <StopReview locale={locale} id={z.uuid().safeParse(query.review).data}/>;
}
