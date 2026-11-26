import { displayParams } from "@/server/identity/display-locale";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Locale } from "@madrasty/contracts";
import { Evaluations } from "@/features/academics/Evaluations";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function EvaluationsPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{child?:string;evaluation?:string}>;
}){
  const [{locale},query,session]=await Promise.all([displayParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  // Admin academic monitoring has a dedicated published-only read view.
  if(session.activePersona==="admin")redirect(`/${locale}/school/more/oversight`);
  return <Evaluations locale={locale} initialChild={z.uuid().safeParse(query.child).data} initial={z.uuid().safeParse(query.evaluation).data}/>;
}
