import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { webSchoolSession } from "@/server/identity/web-session";
import { mayManageAccess, mayUse } from "@/server/access/capabilities";
import { Children, Families } from "@/features/school/Families";
import { dictionary } from "@/i18n";
import { SessionControls } from "@/features/identity/SessionControls";

const tabs = ["home", "students", "attendance", "children", "messages", "more"] as const;
type Tab = typeof tabs[number];

export default async function SchoolPage({ params }: { params: Promise<{ locale: Locale; tab: string }> }) {
  const [{ locale, tab }, session] = await Promise.all([params, webSchoolSession()]);
  if (!(tabs as readonly string[]).includes(tab)) notFound();
  if (!session) redirect(`/${locale}/account/sign-in?next=${encodeURIComponent(`/${locale}/school/${tab}`)}`);

  const specific = { admin: "students", teacher: "attendance", guardian: "children" } as const;
  if (!["home", "messages", "more", specific[session.activePersona]].includes(tab)) notFound();
  const text = dictionary(locale);
  const [access, calendar, placement] = tab === "more"
    ? await Promise.all([mayManageAccess(session), mayUse(session, "school.manage"), mayUse(session, "students.manage")])
    : [false, false, false];
  const families = tab === "students" && await mayUse(session, "students.manage");
  if (tab === "students" && !families) notFound();
  return (
    <>
      <h1>{text[tab as Tab]}</h1>
      {tab === "home" && <p>{text[session.activePersona]}</p>}
      {families && <Families locale={locale} />}
      {tab === "children" && <Children locale={locale} />}
      {(calendar || placement) && <Link className="plain-button" href={`/${locale}/school/more/classes`}>{locale === "ar" ? "الفصول وقيد الطلبة" : "Klassen und Einschreibungen"}</Link>}
      {calendar && <Link className="plain-button" href={`/${locale}/school/more/calendar`}>{locale === "ar" ? "السنة الدراسية والتقويم" : "Schuljahr und Kalender"}</Link>}
      {access && <Link className="plain-button" href={`/${locale}/staff/access`}>{locale === "ar" ? "صلاحيات الموظفين" : "Zugriff für Mitarbeitende"}</Link>}
      {tab === "more" && <><Link className="plain-button" href={`/${locale}/account/security`}>{locale === "ar" ? "أمان الحساب" : "Kontosicherheit"}</Link><SessionControls locale={locale} session={session} /></>}
    </>
  );
}
