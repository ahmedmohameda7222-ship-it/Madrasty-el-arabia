import { displayParams } from "@/server/identity/display-locale";
import { notFound,redirect } from "next/navigation";
import { z } from "zod";
import type { Locale } from "@madrasty/contracts";
import { Gradebook } from "@/features/academics/Gradebook";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function GradebookPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{work?:string}>;
}){
  const [{locale},query,session]=await Promise.all([displayParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  // Admin academic monitoring has a dedicated published-only read view.
  if(session.activePersona==="admin")redirect(`/${locale}/school/more/oversight`);
  if(session.activePersona==="guardian")notFound();
  return <Gradebook locale={locale} initial={z.uuid().safeParse(query.work).data}/>;
}
