import { presentationParams } from "@/server/identity/ui-locale";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { SchoolHeader } from "@/ui/Shell";
import { EmailAction } from "@/features/identity/SecurityForms";

export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false } };
type Route = { locale: Locale; action: string };

export default async function EmailActionPage({ params, searchParams }: {
  params: Promise<Route>;
  searchParams: Promise<{ token_hash?: string }>;
}) {
  const [{ locale, action }, values] = await Promise.all([presentationParams(params), searchParams]);
  if (action !== "recover" && action !== "email" && action !== "activate") notFound();
  const token = typeof values.token_hash === "string" ? values.token_hash : undefined;
  return (
    <main className="public-page"><SchoolHeader locale={locale} />
      <EmailAction locale={locale} action={action} token={token} />
    </main>
  );
}
