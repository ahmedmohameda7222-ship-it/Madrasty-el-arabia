import { notFound, redirect } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { z } from "zod";
import { webSchoolSession } from "@/server/identity/web-session";
import { mayUse } from "@/server/access/capabilities";
import { SchoolHeader } from "@/ui/Shell";
import { InviteWorkspace } from "@/features/identity/Invitations";

export default async function StaffInvitations({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ batchId?: string }>;
}) {
  const [route, search, session] = await Promise.all([params, searchParams, webSchoolSession()]);
  const locale = localeSchema.safeParse(route.locale);
  if (!locale.success) notFound();
  if (!session) redirect(`/${locale.data}/account/sign-in`);
  const [guardians, teachers] = await Promise.all([
    mayUse(session, "students.manage"), mayUse(session, "applications.manage"),
  ]);
  if (!guardians && !teachers) notFound();
  const batch = z.uuid().safeParse(search.batchId);
  return <main className="public-page"><SchoolHeader locale={locale.data} />
    <InviteWorkspace locale={locale.data} guardians={guardians} teachers={teachers} batchId={guardians && batch.success ? batch.data : undefined} />
  </main>;
}
