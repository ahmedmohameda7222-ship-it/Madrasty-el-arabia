import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { schoolDateSchema, type Locale } from "@madrasty/contracts";
import { z } from "zod";
import { SchoolHome } from "@/features/school/SchoolHome";
import { webSchoolSession } from "@/server/identity/web-session";
import { mayManageAccess, mayUse } from "@/server/access/capabilities";
import { TeachingSummary } from "@/features/school/StaffAssignments";
import { Children, Families } from "@/features/school/Families";
import { dictionary } from "@/i18n";
import { SessionControls } from "@/features/identity/SessionControls";

const tabs = ["home", "students", "attendance", "children", "messages", "more"] as const;
type Tab = typeof tabs[number];

export default async function SchoolPage({ params, searchParams }: {
  params: Promise<{ locale: Locale; tab: string }>;
  searchParams: Promise<{ asOf?: string; guardian?: string; student?:string; link?: string; child?: string; class?:string }>;
}) {
  const [{ locale, tab }, search, session] = await Promise.all([params, searchParams, webSchoolSession()]);
  if (!(tabs as readonly string[]).includes(tab)) notFound();
  if (!session) redirect(`/${locale}/account/sign-in?next=${encodeURIComponent(`/${locale}/school/${tab}`)}`);

  const specific = { admin: "students", teacher: "attendance", guardian: "children" } as const;
  if (!["home", "messages", "more", specific[session.activePersona]].includes(tab)) notFound();
  const text = dictionary(locale);
  const [access, calendar, placement, invites, academic, audit] = tab === "more"
    ? await Promise.all([mayManageAccess(session), mayUse(session, "school.manage"), mayUse(session, "students.manage"), mayUse(session, "applications.manage"), mayUse(session, "academics.supervise"), mayUse(session,"audit.read")])
    : [false, false, false, false, false, false];
  const families = tab === "students" && await mayUse(session, "students.manage");
  if (tab === "students" && !families) notFound();
  return (
    <>
      <h1>{text[tab as Tab]}</h1>
      {tab === "home" && <SchoolHome locale={locale} asOf={schoolDateSchema.safeParse(search.asOf).data} />}
      {families && <><Link className="plain-button" href={`/${locale}/school/students/import`}>{locale === "ar" ? "استيراد الأسر" : "Familien importieren"}</Link><Families locale={locale} initialStudent={z.uuid().safeParse(search.student).data} initialGuardian={z.uuid().safeParse(search.guardian).data} initialLink={z.uuid().safeParse(search.link).data} /></>}
      {tab === "children" && <Children locale={locale} initialChild={z.uuid().safeParse(search.child).data} />}
      {tab === "attendance" && session.activePersona === "teacher" && <TeachingSummary locale={locale} classId={z.uuid().safeParse(search.class).data} />}
      {tab === "more" && <div className="calendar-layout">
        <section className="auth-card">
          <h2>{locale === "ar" ? "الحساب والجهاز" : "Konto und Gerät"}</h2>
          <div className="header-actions">
            <Link className="plain-button" href={`/${locale}/account/preferences`}>{locale === "ar" ? "تفضيلات الحساب والإشعارات" : "Konto und Benachrichtigungen"}</Link>
            <Link className="plain-button" href={`/${locale}/account/security`}>{locale === "ar" ? "الأمان والاسترجاع" : "Sicherheit und Wiederherstellung"}</Link>
            <Link className="plain-button" href={`/${locale}/directory`}>{locale === "ar" ? "دليل التواصل" : "Kontaktverzeichnis"}</Link>
          </div>
          <SessionControls locale={locale} session={session} />
        </section>
        {(session.activePersona !== "admin" || calendar || placement || invites || academic) && <section className="auth-card">
          <h2>{locale === "ar" ? "إدارة المدرسة" : "Schulverwaltung"}</h2>
          <div className="header-actions">
            {(calendar || academic) && <Link className="plain-button" href={`/${locale}/school/more/assignments`}>{locale === "ar" ? "الموظفون والتكليفات" : "Mitarbeitende und Einsätze"}</Link>}
            {(session.activePersona !== "admin" || calendar || academic) && <Link className="plain-button"
              href={`/${locale}/school/more/timetable`}>{locale === "ar" ? "الجدول الأسبوعي" : "Wochenplan"}</Link>}
            {invites && <Link className="plain-button" href={`/${locale}/staff/applications`}>{locale === "ar" ? "طلبات المدرسين" : "Bewerbungen von Lehrkräften"}</Link>}
            {(placement || invites) && <Link className="plain-button" href={`/${locale}/staff/invitations`}>{locale === "ar" ? "الدعوات" : "Einladungen"}</Link>}
            {(calendar || placement) && <Link className="plain-button" href={`/${locale}/school/more/classes`}>{locale === "ar" ? "الفصول وقيد الطلبة" : "Klassen und Einschreibungen"}</Link>}
            {calendar && <Link className="plain-button" href={`/${locale}/school/more/calendar`}>{locale === "ar" ? "السنة الدراسية والتقويم" : "Schuljahr und Kalender"}</Link>}
            {session.activePersona === "guardian" && <Link className="plain-button" href={`/${locale}/apply`}>{locale === "ar" ? "طلب مدرس" : "Als Lehrkraft bewerben"}</Link>}
          </div>
        </section>}
        {(access || audit) && <section className="auth-card">
          <h2>{locale === "ar" ? "الصلاحيات والتدقيق" : "Berechtigungen und Protokoll"}</h2>
          <div className="header-actions">
            {access && <Link className="plain-button" href={`/${locale}/staff/access`}>{locale === "ar" ? "صلاحيات الموظفين" : "Zugriff für Mitarbeitende"}</Link>}
            {audit && <Link className="plain-button" href={`/${locale}/school/more/audit`}>{locale === "ar" ? "سجل التدقيق" : "Änderungsprotokoll"}</Link>}
          </div>
        </section>}
      </div>}
    </>
  );
}
