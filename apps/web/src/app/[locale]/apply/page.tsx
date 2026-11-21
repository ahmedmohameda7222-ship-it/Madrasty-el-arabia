import type { Locale } from "@madrasty/contracts";
import { SchoolHeader } from "@/ui/Shell";
import { ApplicantPortal } from "@/features/identity/TeacherApplications";

export default async function Apply({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  return <main className="public-page"><SchoolHeader locale={locale} /><ApplicantPortal locale={locale} /></main>;
}
