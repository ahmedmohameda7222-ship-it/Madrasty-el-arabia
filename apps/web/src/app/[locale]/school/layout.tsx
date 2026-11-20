import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { webSchoolSession } from "@/server/identity/web-session";
import { schoolPreferences } from "@/server/identity/preferences";
import { SchoolShell } from "@/ui/Shell";

export default async function SchoolLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const [route, session] = await Promise.all([params, webSchoolSession()]);
  const parsed = localeSchema.safeParse(route.locale);
  if (!parsed.success) notFound();
  const locale = parsed.data;
  if (!session) redirect(`/${locale}/account/sign-in`);
  if (session.activePersona === "admin" && session.assurance !== "aal2") redirect(`/${locale}/account/security`);
  const actor = { accountId: session.accountId, sessionId: session.sessionId, persona: session.activePersona };
  const settings = await schoolPreferences(session, locale);
  return <SchoolShell actor={actor} locale={locale} theme={settings.theme}>{children}</SchoolShell>;
}
