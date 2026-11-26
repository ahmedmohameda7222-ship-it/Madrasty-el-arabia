import { presentationParams } from "@/server/identity/ui-locale";
import { notFound, redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { z } from "zod";
import { mayUse } from "@/server/access/capabilities";
import { Timetable } from "@/features/school/timetable/Timetable";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function TimetablePage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{child?:string;class?:string;year?:string}>;
}) {
  const [{locale},query,session]=await Promise.all([presentationParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(session.activePersona==="admin"){
    if(session.assurance!=="aal2")redirect(`/${locale}/account/security`);
    if(!await mayUse(session,"school.manage")&&!await mayUse(session,"academics.supervise"))notFound();
  }
  const id = z.uuid();
  return <Timetable locale={locale} child={id.safeParse(query.child).data}
    initialClass={session.activePersona==="admin"?id.safeParse(query.class).data:undefined}
    initialYear={session.activePersona==="admin"?id.safeParse(query.year).data:undefined}/>;
}
