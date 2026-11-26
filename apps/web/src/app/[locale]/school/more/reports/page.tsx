import { displayParams } from "@/server/identity/display-locale";
import {redirect} from "next/navigation";
import { z } from "zod";
import { academicReportQuery,type Locale } from "@madrasty/contracts";
import { AcademicReport } from "@/features/academics/AcademicReport";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function AcademicReportPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{child?:string;student?:string;from?:string;to?:string}>;
}){
  const [{locale},query,session]=await Promise.all([displayParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(session.activePersona==="admin")redirect(`/${locale}/school/more/oversight`);
  const pupil=z.uuid().safeParse(session.activePersona==="guardian"?query.child:query.student).data;
  const range=academicReportQuery.safeParse({from:query.from,to:query.to}).data;
  return <AcademicReport locale={locale} initial={pupil} initialPeriod={range}/>;
}
