import { notFound,redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { z } from "zod";
import { Curriculum } from "@/features/academics/Curriculum";
import { mayUse } from "@/server/access/capabilities";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function CurriculumPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{child?:string;lesson?:string}>;
}){
  const [{locale},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(session.activePersona==="admin"&&!await mayUse(session,"academics.supervise"))notFound();
  return <Curriculum locale={locale} initialChild={z.uuid().safeParse(query.child).data} initialLesson={z.uuid().safeParse(query.lesson).data}/>;
}
