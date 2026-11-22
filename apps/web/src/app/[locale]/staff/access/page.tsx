import { notFound, redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { webSchoolSession } from "@/server/identity/web-session";
import { mayManageAccess } from "@/server/access/capabilities";
import { SchoolHeader } from "@/ui/Shell";
import { MoreBackLink } from "@/ui/MoreBackLink";
import { StaffAccess } from "@/features/identity/StaffAccess";

export default async function StaffAccessPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const [{ locale }, session] = await Promise.all([params, webSchoolSession()]);
  if (!session) redirect(`/${locale}/account/sign-in`);
  if (!await mayManageAccess(session)) notFound();
  return <main className="public-page"><SchoolHeader locale={locale} />
    <MoreBackLink locale={locale} />
    <StaffAccess locale={locale} ownAccount={session.accountId} />
  </main>;
}
