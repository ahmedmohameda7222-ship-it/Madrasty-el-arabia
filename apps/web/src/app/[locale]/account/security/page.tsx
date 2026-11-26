import { displayParams } from "@/server/identity/display-locale";
import { redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { webSchoolSession } from "@/server/identity/web-session";
import { SchoolHeader } from "@/ui/Shell";
import { MoreBackLink } from "@/ui/MoreBackLink";
import { AccountSecurity } from "@/features/identity/SecurityForms";

export default async function SecurityPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const [{ locale }, session] = await Promise.all([displayParams(params), webSchoolSession()]);
  if (!session) redirect(`/${locale}/account/sign-in`);
  return (
    <main className="public-page"><SchoolHeader locale={locale} />
      {(session.activePersona !== "admin" || session.assurance === "aal2") && <MoreBackLink locale={locale} />}
      <AccountSecurity locale={locale} persona={session.activePersona} assured={session.assurance === "aal2"} />
    </main>
  );
}
