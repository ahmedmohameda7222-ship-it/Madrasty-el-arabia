import { presentationParams } from "@/server/identity/ui-locale";
import { notFound, redirect } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { z } from "zod";
import { webSchoolSession } from "@/server/identity/web-session";
import { mayUse, mayProvisionAdmin } from "@/server/access/capabilities";
import { StaffAssignments } from "@/features/school/StaffAssignments";
import { StaffWorkspace } from "@/features/school/StaffWorkspace";
import { StaffProvisionOnly } from "@/features/school/StaffProvisionOnly";

export default async function AssignmentPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ year?:string; class?:string; advanced?:string }>;
}) {
  const [route, query, session] = await Promise.all([presentationParams(params), searchParams, webSchoolSession()]);
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
  const classId = z.uuid().safeParse(query.class).data;
  const yearId = z.uuid().safeParse(query.year).data;
  if (query.advanced === "1" && classId)
    return <StaffAssignments locale={locale.data} canCreateAdmin={canCreateAdmin} initialYear={yearId} initialClass={classId} />;
  // Existing class links now resolve to the class itself; avoid duplicate workflows.
  if (classId) redirect(`/${locale.data}/school/more/classes?year=${yearId??""}&class=${classId}`);
  return <StaffWorkspace locale={locale.data} canCreateAdmin={canCreateAdmin} />;
}
