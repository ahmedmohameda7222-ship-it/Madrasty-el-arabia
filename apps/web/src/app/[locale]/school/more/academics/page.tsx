import { notFound,redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { z } from "zod";
import { TeachingActivity } from "@/features/academics/TeachingActivity";
import { mayUse } from "@/server/access/capabilities";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function AcademicWorkPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{child?:string;activity?:string}>;
}){
  const [{locale},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(session.activePersona==="admin"&&!await mayUse(session,"academics.supervise"))notFound();
  return <TeachingActivity locale={locale} initialChild={z.uuid().safeParse(query.child).data}
    initialActivity={z.uuid().safeParse(query.activity).data}/>;
}
