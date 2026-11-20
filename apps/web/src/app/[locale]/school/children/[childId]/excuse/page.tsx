import { notFound, redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { z } from "zod";
import { FamilyExcuse } from "@/features/attendance/FamilyExcuse";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function ChildExcusePage({params}:{params:Promise<{locale:Locale;childId:string}>}){
  const [{locale,childId},session]=await Promise.all([params,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(session.activePersona!=="guardian"||!z.uuid().safeParse(childId).success)notFound();
  return <FamilyExcuse locale={locale} child={childId}/>;
}
