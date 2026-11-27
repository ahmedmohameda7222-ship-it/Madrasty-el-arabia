import { presentationParams } from "@/server/identity/ui-locale";
import { notFound, redirect } from "next/navigation";
import { schoolDateSchema, type Locale } from "@madrasty/contracts";
import { z } from "zod";
import { mayUseMany } from "@/server/access/capabilities";
import { DailyAttendance } from "@/features/attendance/DailySheet";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function AttendanceReviewPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{date?:string;class?:string}>;
}){
  const [{locale},query,session]=await Promise.all([presentationParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const [attendance,academic]=await mayUseMany(session,["attendance.supervise","academics.supervise"]);
  if(!attendance)notFound();
  if(session.activePersona==="admin"){
    if(!academic)notFound();
    const selected=z.uuid().safeParse(query.class).data;
    redirect(`/${locale}/school/more/oversight${selected?"?class="+selected:""}`);
  }
  return <>
    <h1>{locale==="ar"?"مراجعة الحضور":"Anwesenheit prüfen"}</h1>
    <DailyAttendance locale={locale} initialClass={z.uuid().safeParse(query.class).data}
      initialDate={schoolDateSchema.safeParse(query.date).data}/>
  </>;
}
