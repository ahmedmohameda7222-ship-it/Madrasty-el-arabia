import { displayParams } from "@/server/identity/display-locale";
import { notFound, redirect } from "next/navigation";
import { schoolDateSchema, type Locale } from "@madrasty/contracts";
import { z } from "zod";
import { FamilyExcuse } from "@/features/attendance/FamilyExcuse";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function ChildExcusePage({params,searchParams}:{
  params:Promise<{locale:Locale;childId:string}>;searchParams:Promise<{date?:string}>;
}){
  const [{locale,childId},query,session]=await Promise.all([displayParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(session.activePersona!=="guardian"||!z.uuid().safeParse(childId).success)notFound();
  return <FamilyExcuse locale={locale} child={childId} initialDate={schoolDateSchema.safeParse(query.date).data}/>;
}
