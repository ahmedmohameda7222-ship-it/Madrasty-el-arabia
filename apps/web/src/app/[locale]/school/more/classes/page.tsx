import { notFound, redirect } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { webSchoolSession } from "@/server/identity/web-session";
import { mayUse } from "@/server/access/capabilities";
import { ClassWorkspace } from "@/features/school/Enrollments";

export default async function ClassesPage({ params }: { params: Promise<{ locale: string }> }) {
  const [route, session] = await Promise.all([params, webSchoolSession()]);
  const locale = localeSchema.safeParse(route.locale);
  if (!locale.success) notFound();
  if (!session) redirect(`/${locale.data}/account/sign-in`);
  const [manageClasses, manageEnrollment] = await Promise.all([
    mayUse(session, "school.manage"), mayUse(session, "students.manage"),
  ]);
  if (!manageClasses && !manageEnrollment) notFound();
  return <ClassWorkspace locale={locale.data} manageClasses={manageClasses} manageEnrollment={manageEnrollment} />;
}
