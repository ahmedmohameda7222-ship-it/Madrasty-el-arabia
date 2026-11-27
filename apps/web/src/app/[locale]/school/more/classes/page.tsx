import { presentationParams } from "@/server/identity/ui-locale";
import { notFound, redirect } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { webSchoolSession } from "@/server/identity/web-session";
import { mayUseMany } from "@/server/access/capabilities";
import { ClassWorkspace } from "@/features/school/Enrollments";
import { z } from "zod";

export default async function ClassesPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ student?: string }>;
}) {
  const [route, session, query] = await Promise.all([presentationParams(params), webSchoolSession(), searchParams]);
  const locale = localeSchema.safeParse(route.locale);
  if (!locale.success) notFound();
  if (!session) redirect(`/${locale.data}/account/sign-in`);
  const [manageClasses, manageEnrollment, manageAcademic, manageAttendance] = await mayUseMany(session,["school.manage","students.manage","academics.supervise","attendance.supervise"]);
  if (!manageClasses && !manageEnrollment && !manageAcademic) notFound();
  const student = manageEnrollment ? z.uuid().safeParse(query.student).data : undefined;
  return <ClassWorkspace locale={locale.data} manageClasses={manageClasses} manageEnrollment={manageEnrollment} manageTeachers={manageClasses || manageAcademic}
    canMonitor={session.activePersona==="admin"&&manageAcademic&&manageAttendance} student={student} />;
}
