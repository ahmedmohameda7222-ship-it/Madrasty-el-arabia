import { notFound, redirect } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { z } from "zod";
import { webSchoolSession } from "@/server/identity/web-session";
import { mayUse, mayProvisionAdmin } from "@/server/access/capabilities";
import { StaffAssignments } from "@/features/school/StaffAssignments";
import { StaffProvisionOnly } from "@/features/school/StaffProvisionOnly";

export default async function AssignmentPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ year?:string; class?:string }>;
}) {
  const [route, query, session] = await Promise.all([params, searchParams, webSchoolSession()]);
  const locale = localeSchema.safeParse(route.locale);
  if (!locale.success) notFound();
  if (!session) redirect(`/${locale.data}/account/sign-in`);
  const [office, academic, staffManagement] = await Promise.all([
    mayUse(session, "school.manage"), mayUse(session, "academics.supervise"), mayUse(session, "staff.invite")
  ]);
  if (!office && !academic && !staffManagement) notFound();
  // Invitation managers can provision a teacher, not manage assignments or school data.
  if (!office && !academic) return <StaffProvisionOnly locale={locale.data} />;
  const canCreateAdmin = await mayProvisionAdmin(session);
  return <StaffAssignments locale={locale.data} canCreateAdmin={canCreateAdmin} initialYear={z.uuid().safeParse(query.year).data} initialClass={z.uuid().safeParse(query.class).data} />;
}
