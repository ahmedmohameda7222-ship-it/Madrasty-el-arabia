import { notFound, redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { z } from "zod";
import { AttendanceHistory } from "@/features/attendance/AttendanceHistory";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function ChildAttendancePage({params,searchParams}:{
  params:Promise<{locale:Locale;childId:string}>;
  searchParams:Promise<{row?:string}>;
}) {
  const [{locale,childId},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(session.activePersona!=="guardian"||!z.uuid().safeParse(childId).success)notFound();
  return <AttendanceHistory locale={locale} childId={childId} rowId={z.uuid().safeParse(query.row).data}/>;
}
