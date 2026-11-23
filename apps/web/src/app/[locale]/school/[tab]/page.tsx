import { SchoolLink as Link } from "@/ui/SchoolLink";
import { notFound, redirect } from "next/navigation";
import { schoolDateSchema, type Locale } from "@madrasty/contracts";
import { z } from "zod";
import { SchoolHome } from "@/features/school/SchoolHome";
import { webSchoolSession } from "@/server/identity/web-session";
import { schoolMenuAccess, mayUse } from "@/server/access/capabilities";
import { DailyAttendance } from "@/features/attendance/DailySheet";
import { Children, Families } from "@/features/school/Families";
import { InviteWorkspace } from "@/features/identity/Invitations";
import { dictionary } from "@/i18n";
import { ThreadInbox } from "@/features/comms/ThreadInbox";
import { SessionControls } from "@/features/identity/SessionControls";
import { MoreGroup } from "@/ui/MoreGroup";

const tabs = ["home", "students", "attendance", "children", "messages", "more"] as const;
type Tab = typeof tabs[number];

export default async function SchoolPage({ params, searchParams }: {
  params: Promise<{ locale: Locale; tab: string }>;
  searchParams: Promise<{ asOf?: string; guardian?: string; student?:string; link?: string; child?: string; class?:string; date?:string; thread?:string; batchId?:string; invite?:string }>;
}) {
  const [{ locale, tab }, search, session] = await Promise.all([params, searchParams, webSchoolSession()]);
  if (!(tabs as readonly string[]).includes(tab)) notFound();
  if (!session) redirect(`/${locale}/account/sign-in?next=${encodeURIComponent(`/${locale}/school/${tab}`)}`);

  const specific = { admin: "students", teacher: "attendance", guardian: "children" } as const;
  if (!["home", "messages", "more", specific[session.activePersona]].includes(tab)) notFound();
  const text = dictionary(locale);
  const menuKeys = ["access.manage","school.manage","students.manage","staff.invite","academics.supervise","audit.read","attendance.supervise","bank.configure","finance.issue","finance.read","finance.post"] as const;
  const { capabilities, moderation, delivery, stopManager } = tab === "more"
    ? await schoolMenuAccess(session, menuKeys)
    : { capabilities: [], moderation: false, delivery: false, stopManager: false };
  const [access, calendar, placement, teacherInvites, academic, audit, attendance, bank, billing, finance, posting] = menuKeys.map(key => capabilities.includes(key));
  const invites = teacherInvites || placement;
  const families = tab === "students" && await mayUse(session, "students.manage");
  if (tab === "students" && !families) notFound();
  return (
    <>
      <h1>{tab==="students" ? (locale==="ar"?"الطلاب والأسر":"Schüler und Familien") : text[tab as Tab]}</h1>
      {tab==="messages"&&<ThreadInbox locale={locale} thread={z.uuid().safeParse(search.thread).data}/>}
      {tab === "home" && <SchoolHome locale={locale} asOf={schoolDateSchema.safeParse(search.asOf).data} />}
      {families && <><Link className="plain-button" href={`/${locale}/school/students/import`}>{locale === "ar" ? "استيراد الأسر" : "Familien importieren"}</Link><Families locale={locale} />
        {(search.batchId || search.invite) && <InviteWorkspace locale={locale} guardians={true}
          batchId={z.uuid().safeParse(search.batchId).data} invitationId={z.uuid().safeParse(search.invite).data}/>}
      </>}
      {tab === "children" && <Children locale={locale} initialChild={z.uuid().safeParse(search.child).data} />}
      {tab === "attendance" && session.activePersona === "teacher" && <DailyAttendance locale={locale} initialClass={z.uuid().safeParse(search.class).data} initialDate={schoolDateSchema.safeParse(search.date).data} />}
      {tab === "more" && <div className="more-index">
        {(session.activePersona !== "admin" || calendar || academic || attendance) && <MoreGroup group="learning">
          <summary>{locale === "ar" ? "التعليم والحضور" : "Unterricht und Anwesenheit"}</summary>
          <div className="more-rows">
            {session.activePersona==="admin" && (academic || attendance) &&
              <Link className="more-row" href={`/${locale}/school/more/oversight`}>
                {locale==="ar"?"متابعة الفصول":"Klassen im Blick"}
              </Link>}
            {session.activePersona==="teacher"&&<Link className="more-row" href={`/${locale}/school/more/grading`}>{locale==="ar"?"تصحيح الواجبات":"Hausaufgaben korrigieren"}</Link>}
            {session.activePersona==="teacher"&&<Link className="more-row" href={`/${locale}/school/more/reports`}>{locale==="ar"?"التقرير الأكاديمي":"Lernbericht"}</Link>}
            {session.activePersona==="teacher"&&<Link className="more-row" href={`/${locale}/school/more/exams`}>{locale==="ar"?"الامتحانات":"Prüfungen"}</Link>}
            {session.activePersona==="teacher"&&<Link className="more-row" href={`/${locale}/school/more/evaluations`}>{locale==="ar"?"التقييمات الدورية":"Regelmäßige Beurteilungen"}</Link>}
            {session.activePersona==="teacher"&&<Link className="more-row" href={`/${locale}/school/more/homework`}>{locale==="ar"?"الواجبات":"Hausaufgaben"}</Link>}
            {session.activePersona==="teacher"&&<Link className="more-row" href={`/${locale}/school/more/academics`}>{locale==="ar"?"الشرح والأنشطة":"Unterricht und Aktivitäten"}</Link>}
            {session.activePersona==="teacher"&&<Link className="more-row" href={`/${locale}/school/more/curriculum`}>{locale==="ar"?"المواد والدروس":"Fächer und Unterricht"}</Link>}
            {(calendar || academic || teacherInvites) && <Link className="more-row" href={`/${locale}/school/more/assignments`}>{locale === "ar" ? "المدرسون والإدارة" : "Lehrkräfte und Verwaltung"}</Link>}
            {(session.activePersona !== "admin" || calendar || academic) && <Link className="more-row"
              href={`/${locale}/school/more/timetable`}>{locale === "ar" ? "الجدول الأسبوعي" : "Wochenplan"}</Link>}
            {session.activePersona==="teacher" && <Link className="more-row" href={`/${locale}/school/more/attendance`}>{locale === "ar" ? "مراجعة الحضور" : "Anwesenheit prüfen"}</Link>}
          </div></MoreGroup>}
        {(placement || calendar || academic || session.activePersona==="guardian") && <MoreGroup group="admissions"><summary>{locale==="ar"?"القيد وشؤون الطلبة":"Aufnahme und Schulverwaltung"}</summary><div className="more-rows">
            {(calendar || placement || academic) && <Link className="more-row" href={`/${locale}/school/more/classes`}>{locale === "ar" ? "الفصول وقيد الطلبة" : "Klassen und Einschreibungen"}</Link>}
            {calendar && <Link className="more-row" href={`/${locale}/school/more/calendar`}>{locale === "ar" ? "السنة الدراسية والتقويم" : "Schuljahr und Kalender"}</Link>}
          </div>
        </MoreGroup>}
        {(finance||billing||posting||stopManager||session.activePersona==="guardian")&&<MoreGroup group="finance">
          <summary>{locale==="ar"?"الحسابات":"Buchhaltung"}</summary>
          <div className="more-rows">
            {(finance||billing||posting||session.activePersona==="guardian")&&<Link className="more-row" href={`/${locale}/school/more/invoices`}>{locale==="ar"?"الفواتير":"Rechnungen"}</Link>}
            {(stopManager||session.activePersona==="guardian")&&<Link className="more-row" href={`/${locale}/school/more/enrollment-stops`}>{locale==="ar"?"وقف القيد":"Teilnahmepause"}</Link>}
            {(finance||posting)&&<Link className="more-row" href={`/${locale}/school/more/stop-reviews`}>{locale==="ar"?"تسويات وقف القيد":"Gebühren bei Teilnahmepausen"}</Link>}
            {(finance||posting||session.activePersona==="guardian")&&<Link className="more-row"
              href={`/${locale}/school/more/finance-reports`}>{locale==="ar"?"كشف الحساب":"Gebührenübersicht"}</Link>}
            {(finance||posting)&&<Link className="more-row" href={`/${locale}/school/more/receipts`}>{locale==="ar"?"مطابقة الإيصالات":"Zahlungen abgleichen"}</Link>}
            {posting&&<Link className="more-row" href={`/${locale}/school/more/record-payment`}>{locale==="ar"?"تسجيل سداد":"Zahlung erfassen"}</Link>}
            {billing&&<Link className="more-row" href={`/${locale}/school/more/issue-invoices`}>{locale==="ar"?"إصدار الفواتير":"Rechnungen ausstellen"}</Link>}
            {billing&&<Link className="more-row" href={`/${locale}/school/more/fee-settings`}>{locale==="ar"?"إعدادات الرسوم":"Gebühreneinstellungen"}</Link>}
          </div>
        </MoreGroup>}
        {(access || audit || moderation || delivery || bank) && <MoreGroup group="permissions">
          <summary>{locale === "ar" ? "الصلاحيات والتدقيق" : "Berechtigungen und Protokoll"}</summary>
          <div className="more-rows">
            {access && <Link className="more-row" href={`/${locale}/staff/access`}>{locale === "ar" ? "صلاحيات الموظفين" : "Zugriff für Mitarbeitende"}</Link>}
            {audit && <Link className="more-row" href={`/${locale}/school/more/audit`}>{locale === "ar" ? "سجل التدقيق" : "Änderungsprotokoll"}</Link>}
            {moderation&&<Link className="more-row" href={`/${locale}/school/more/message-reports`}>{locale==="ar"?"بلاغات الرسائل":"Gemeldete Nachrichten"}</Link>}
            {delivery&&<Link className="more-row" href={`/${locale}/school/more/delivery-status`}>{locale==="ar"?"حالة التوصيل":"Zustellstatus"}</Link>}
            {bank&&<Link className="more-row" href={`/${locale}/school/more/bank`}>{locale==="ar"?"حساب التحصيل":"Zahlungskonto"}</Link>}
          </div>
        </MoreGroup>}
        <MoreGroup group="communication"><summary>{locale==="ar"?"التواصل والنشر":"Kommunikation"}</summary><div className="more-rows">
            <Link className="more-row" href={`/${locale}/directory`}>{locale === "ar" ? "دليل التواصل" : "Kontaktverzeichnis"}</Link>
            <Link className="more-row" href={`/${locale}/school/more/broadcasts`}>{locale==="ar"?"إعلانات المدرسة":"Schulmitteilungen"}</Link>
            <Link className="more-row" href={`/${locale}/school/more/news`}>{locale==="ar"?"أخبار المدرسة":"Schulnachrichten"}</Link>
            <Link className="more-row" href={`/${locale}/school/more/events`}>{locale==="ar"?"تقويم الأحداث":"Veranstaltungskalender"}</Link>
        </div></MoreGroup>
        <MoreGroup group="account">
          <summary>{locale === "ar" ? "الحساب والجهاز" : "Konto und Gerät"}</summary>
          <div className="more-rows">
            <Link className="more-row" href={`/${locale}/account/preferences`}>{locale === "ar" ? "تفضيلات الحساب والإشعارات" : "Konto und Benachrichtigungen"}</Link>
            <Link className="more-row" href={`/${locale}/account/security`}>{locale === "ar" ? "الأمان والاسترجاع" : "Sicherheit und Wiederherstellung"}</Link>
          </div>
          <SessionControls locale={locale} session={session} />
        </MoreGroup>
      </div>}
    </>
  );
}
