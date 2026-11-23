import { redirect } from "next/navigation";
import { z } from "zod";
import type { Locale } from "@madrasty/contracts";
import { Exams } from "@/features/academics/Exams";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function ExamPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{child?:string;exam?:string;class?:string}>;
}){
  const [{locale},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  // Admin academic monitoring has a dedicated published-only read view.
  if(session.activePersona==="admin")redirect(`/${locale}/school/more/oversight`);
  return <Exams locale={locale} initialChild={z.uuid().safeParse(query.child).data} initial={z.uuid().safeParse(query.exam).data}
    initialClass={undefined}/>;
}
