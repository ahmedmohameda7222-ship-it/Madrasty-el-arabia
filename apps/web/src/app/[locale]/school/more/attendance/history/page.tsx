import { displayParams } from "@/server/identity/display-locale";
import { notFound, redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { z } from "zod";
import { mayUse } from "@/server/access/capabilities";
import { AttendanceHistory } from "@/features/attendance/AttendanceHistory";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function StaffAttendanceHistoryPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{class?:string;row?:string}>;
}) {
  const [{locale},query,session]=await Promise.all([displayParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(session.activePersona!=="teacher"&&!await mayUse(session,"attendance.supervise"))notFound();
  return <AttendanceHistory locale={locale} classId={z.uuid().safeParse(query.class).data}
    rowId={z.uuid().safeParse(query.row).data}/>;
}
