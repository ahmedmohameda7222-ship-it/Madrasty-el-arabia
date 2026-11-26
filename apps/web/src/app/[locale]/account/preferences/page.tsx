import { displayParams } from "@/server/identity/display-locale";
import { redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { AccountPreferences } from "@/features/identity/AccountPreferences";
import { webSchoolSession } from "@/server/identity/web-session";
import { schoolPreferences } from "@/server/identity/preferences";
import { SchoolShell } from "@/ui/Shell";
import { mayUse } from "@/server/access/capabilities";

export default async function PreferencesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const [{ locale }, session] = await Promise.all([displayParams(params),webSchoolSession()]);
  if (!session) redirect(`/${locale}/account/sign-in`);
  if (session.activePersona === "admin" && session.assurance !== "aal2") redirect(`/${locale}/account/security`);
  const [settings,mayManageStudents] = await Promise.all([schoolPreferences(session,locale),mayUse(session,"students.manage")]);
  return <SchoolShell actor={{accountId:session.accountId,sessionId:session.sessionId,persona:session.activePersona}} locale={locale}
    theme={settings.theme} mayManageStudents={mayManageStudents}>
    <AccountPreferences locale={locale} initial={settings} />
  </SchoolShell>;
}
