import { notFound, redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { z } from "zod";
import { mayUse } from "@/server/access/capabilities";
import { Timetable } from "@/features/school/timetable/Timetable";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function TimetablePage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{child?:string}>;
}) {
  const [{locale},{child},session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(session.activePersona==="admin"){
    if(session.assurance!=="aal2")redirect(`/${locale}/account/security`);
    if(!await mayUse(session,"school.manage")&&!await mayUse(session,"academics.supervise"))notFound();
  }
  return <Timetable locale={locale} child={z.uuid().safeParse(child).data}/>;
}
