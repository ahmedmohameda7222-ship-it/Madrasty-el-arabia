import { redirect } from "next/navigation";
import { directoryIdSchema, type Locale } from "@madrasty/contracts";
import { ContactDirectory } from "@/features/identity/ContactDirectory";
import { webSchoolSession } from "@/server/identity/web-session";
import { schoolPreferences } from "@/server/identity/preferences";
import { SchoolShell } from "@/ui/Shell";

export default async function DirectoryPage({ params, searchParams }: {
  params: Promise<{ locale: Locale }>; searchParams: Promise<{ contact?: string }>;
}) {
  const [{ locale }, { contact }, session] = await Promise.all([params,searchParams,webSchoolSession()]);
  if (!session) redirect(`/${locale}/account/sign-in`);
  if (session.activePersona === "admin" && session.assurance !== "aal2") redirect(`/${locale}/account/security`);
  const settings = await schoolPreferences(session,locale);
  const selected = directoryIdSchema.safeParse(contact);
  return <SchoolShell actor={{accountId:session.accountId,sessionId:session.sessionId,persona:session.activePersona}} locale={locale}
    theme={settings.theme}>
    <ContactDirectory locale={locale} contact={selected.data} />
  </SchoolShell>;
}
