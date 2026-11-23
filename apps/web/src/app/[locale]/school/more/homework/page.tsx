import { redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { z } from "zod";
import { Homework } from "@/features/academics/Homework";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function HomeworkPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{child?:string;work?:string}>;
}){
  const [{locale},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  // Admin academic monitoring has a dedicated published-only read view.
  if(session.activePersona==="admin")redirect(`/${locale}/school/more/oversight`);
  return <Homework locale={locale} initialChild={z.uuid().safeParse(query.child).data}
    initialWork={z.uuid().safeParse(query.work).data}/>;
}
