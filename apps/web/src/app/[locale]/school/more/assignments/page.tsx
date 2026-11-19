import { notFound, redirect } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { webSchoolSession } from "@/server/identity/web-session";
import { mayUse } from "@/server/access/capabilities";
import { StaffAssignments } from "@/features/school/StaffAssignments";

export default async function AssignmentPage({ params }: { params: Promise<{ locale: string }> }) {
  const [route, session] = await Promise.all([params, webSchoolSession()]);
  const locale = localeSchema.safeParse(route.locale);
  if (!locale.success) notFound();
  if (!session) redirect(`/${locale.data}/account/sign-in`);
  const [office, academic] = await Promise.all([mayUse(session, "school.manage"), mayUse(session, "academics.supervise")]);
  if (!office && !academic) notFound();
  return <StaffAssignments locale={locale.data} />;
}
