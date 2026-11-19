import type { Metadata } from "next";
import type { Locale } from "@madrasty/contracts";
import { SchoolHeader } from "@/ui/Shell";
import { ApplicantVerify } from "@/features/identity/TeacherApplications";

export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function Verify({ params, searchParams }: {
  params: Promise<{ locale: Locale }>; searchParams: Promise<{ token_hash?: string }>;
}) {
  const [{ locale }, { token_hash }] = await Promise.all([params, searchParams]);
  return <main className="public-page"><SchoolHeader locale={locale} />
    <ApplicantVerify locale={locale} proof={typeof token_hash === "string" ? token_hash : undefined} />
  </main>;
}
