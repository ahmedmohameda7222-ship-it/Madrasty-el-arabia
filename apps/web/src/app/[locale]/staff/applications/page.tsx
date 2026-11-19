import { notFound, redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { webSchoolSession } from "@/server/identity/web-session";
import { mayUse } from "@/server/access/capabilities";
import { SchoolHeader } from "@/ui/Shell";
import { ApplicationReview } from "@/features/identity/TeacherApplications";

export default async function Applications({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const session = await webSchoolSession();
  if (!session) redirect(`/${locale}/account/sign-in`);
  if (!await mayUse(session, "applications.manage")) notFound();
  return <main className="public-page"><SchoolHeader locale={locale} /><ApplicationReview locale={locale} /></main>;
}
