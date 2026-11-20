import { redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { AccountPreferences } from "@/features/identity/AccountPreferences";
import { webSchoolSession } from "@/server/identity/web-session";
import { schoolPreferences } from "@/server/identity/preferences";
import { SchoolShell } from "@/ui/Shell";

export default async function PreferencesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const [{ locale }, session] = await Promise.all([params,webSchoolSession()]);
  if (!session) redirect(`/${locale}/account/sign-in`);
  if (session.activePersona === "admin" && session.assurance !== "aal2") redirect(`/${locale}/account/security`);
  const settings = await schoolPreferences(session,locale);
  return <SchoolShell actor={{accountId:session.accountId,sessionId:session.sessionId,persona:session.activePersona}} locale={locale}
    theme={settings.theme}>
    <AccountPreferences locale={locale} initial={settings} />
  </SchoolShell>;
}
