import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import type {Locale} from "@madrasty/contracts";
import {StopQueue} from "@/features/finance/StopQueue";
import {mayManageStops} from "@/server/finance/stops";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function EnrollmentStopsPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{request?:string;student?:string}>;
}){
  const [{locale},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const staff=session.activePersona!=="guardian";
  if(staff&&!await mayManageStops(session))notFound();
  return <StopQueue locale={locale} staff={staff} id={z.uuid().safeParse(query.request).data} student={z.uuid().safeParse(query.student).data}/>;
}
