import { notFound, redirect } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { mayUse } from "@/server/access/capabilities";
import { webSchoolSession } from "@/server/identity/web-session";
import { FamilyImport } from "@/features/school/FamilyImport";

export default async function FamilyImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const [route, session] = await Promise.all([params, webSchoolSession()]);
  const locale = localeSchema.safeParse(route.locale);
  if (!locale.success) notFound();
  if (!session) redirect(`/${locale.data}/account/sign-in`);
  if (!await mayUse(session, "students.manage")) notFound();
  return <FamilyImport locale={locale.data} />;
}
