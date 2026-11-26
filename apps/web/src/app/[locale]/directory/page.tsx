import { presentationParams } from "@/server/identity/ui-locale";
import { redirect } from "next/navigation";
import { directoryIdSchema, type Locale } from "@madrasty/contracts";
import { ContactDirectory } from "@/features/identity/ContactDirectory";
import { webSchoolSession } from "@/server/identity/web-session";
import { schoolPreferences } from "@/server/identity/preferences";
import { SchoolShell } from "@/ui/Shell";
import { mayUse } from "@/server/access/capabilities";

export default async function DirectoryPage({ params, searchParams }: {
  params: Promise<{ locale: Locale }>; searchParams: Promise<{ contact?: string }>;
}) {
  const [{ locale }, { contact }, session] = await Promise.all([presentationParams(params),searchParams,webSchoolSession()]);
  if (!session) redirect(`/${locale}/account/sign-in`);
  if (session.activePersona === "admin" && session.assurance !== "aal2") redirect(`/${locale}/account/security`);
  const [settings,mayManageStudents] = await Promise.all([schoolPreferences(session,locale),mayUse(session,"students.manage")]);
  const selected = directoryIdSchema.safeParse(contact);
  return <SchoolShell actor={{accountId:session.accountId,sessionId:session.sessionId,persona:session.activePersona}} locale={locale}
    theme={settings.theme} mayManageStudents={mayManageStudents}>
    <ContactDirectory locale={locale} contact={selected.data} />
  </SchoolShell>;
}
