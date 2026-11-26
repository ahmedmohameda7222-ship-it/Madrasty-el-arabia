import { presentationParams } from "@/server/identity/ui-locale";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { webSchoolSession } from "@/server/identity/web-session";
import { schoolPreferences } from "@/server/identity/preferences";
import { SchoolShell } from "@/ui/Shell";
import { schoolMenuAccess } from "@/server/access/capabilities";

export default async function SchoolLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const [route, session] = await Promise.all([presentationParams(params), webSchoolSession()]);
  const parsed = localeSchema.safeParse(route.locale);
  if (!parsed.success) notFound();
  const locale = parsed.data;
  if (!session) redirect(`/${locale}/account/sign-in`);
  if (session.activePersona === "admin" && session.assurance !== "aal2") redirect(`/${locale}/account/security`);
  const actor = { accountId: session.accountId, sessionId: session.sessionId, persona: session.activePersona, expiresAt:session.expiresAt };
  const [settings, access] = await Promise.all([
    schoolPreferences(session, locale),
    session.activePersona === "admin" ? schoolMenuAccess(session, ["students.manage","school.manage","attendance.supervise","finance.read","finance.post"]) : null,
  ]);
  const capabilities = new Set(access?.capabilities);
  const base = `/${locale}/school/more`;
  const ar = locale === "ar";
  const secondary = [
    {show:capabilities.has("school.manage"), href:`${base}/calendar`, label:ar?"السنة الدراسية":"Schuljahr"},
    {show:capabilities.has("students.manage")||capabilities.has("school.manage"), href:`${base}/classes`, label:ar?"الفصول والقيد":"Klassen und Einschreibungen"},
    {show:capabilities.has("attendance.supervise"), href:`${base}/attendance`, label:ar?"مراجعة الحضور":"Anwesenheit prüfen"},
    {show:capabilities.has("finance.read")||capabilities.has("finance.post"), href:`${base}/finance-reports`, label:ar?"كشف الحساب":"Gebührenübersicht"},
  ].filter(item=>item.show);
  return <SchoolShell actor={actor} locale={locale} theme={settings.theme} mayManageStudents={capabilities.has("students.manage")}
    secondary={secondary.length ? secondary : undefined}>{children}</SchoolShell>;
}
