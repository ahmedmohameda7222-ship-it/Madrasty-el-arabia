import { displayParams } from "@/server/identity/display-locale";
import { notFound, redirect } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { z } from "zod";
import { mayUse } from "@/server/access/capabilities";
import { webSchoolSession } from "@/server/identity/web-session";
import { FamilyImport } from "@/features/school/FamilyImport";

export default async function FamilyImportPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ job?:string }>;
}) {
  const [route, query, session] = await Promise.all([displayParams(params), searchParams, webSchoolSession()]);
  const locale = localeSchema.safeParse(route.locale);
  if (!locale.success) notFound();
  if (!session) redirect(`/${locale.data}/account/sign-in`);
  if (!await mayUse(session, "students.manage")) notFound();
  return <FamilyImport locale={locale.data} job={z.uuid().safeParse(query.job).data} />;
}
