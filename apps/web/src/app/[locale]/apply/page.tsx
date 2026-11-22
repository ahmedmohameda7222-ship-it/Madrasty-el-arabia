import { Suspense } from "react";
import type { Locale } from "@madrasty/contracts";
import { SchoolHeader } from "@/ui/Shell";
import { ApplicationMoreBackLink } from "@/ui/MoreBackLink";
import { ApplicantPortal } from "@/features/identity/TeacherApplications";

export default async function Apply({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  return <main className="public-page"><SchoolHeader locale={locale} />
    <Suspense fallback={null}><ApplicationMoreBackLink locale={locale} /></Suspense>
    <ApplicantPortal locale={locale} />
  </main>;
}
