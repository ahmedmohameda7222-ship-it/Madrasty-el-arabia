import { displayParams } from "@/server/identity/display-locale";
import { SchoolLink as Link } from "@/ui/SchoolLink";
import { notFound, redirect } from "next/navigation";
import { schoolDateSchema, type Locale } from "@madrasty/contracts";
import { z } from "zod";
import { SchoolHome } from "@/features/school/SchoolHome";
import { schoolProfile } from "@/server/identity/profile";
import { webSchoolSession } from "@/server/identity/web-session";
import { schoolMenuAccess, mayUse } from "@/server/access/capabilities";
import { mayManageStops } from "@/server/finance/stops";
import { DailyAttendance } from "@/features/attendance/DailySheet";
import { Children, Families } from "@/features/school/Families";
import { InviteWorkspace } from "@/features/identity/Invitations";
import { dictionary } from "@/i18n";
import { CommunicationHub } from "@/features/comms/CommunicationHub";
import { SessionControls } from "@/features/identity/SessionControls";
import { MoreGroup } from "@/ui/MoreGroup";

const tabs = ["home", "students", "attendance", "children", "messages", "more"] as const;
type Tab = typeof tabs[number];

export default async function SchoolPage({ params, searchParams }: {
  params: Promise<{ locale: Locale; tab: string }>;
  searchParams: Promise<{ asOf?: string; guardian?: string; student?:string; link?: string; child?: string; class?:string; date?:string; thread?:string; section?:string; batchId?:string; invite?:string }>;
}) {
  const [{ locale, tab }, search, session] = await Promise.all([displayParams(params), searchParams, webSchoolSession()]);
  if (!(tabs as readonly string[]).includes(tab)) notFound();
  if (!session) redirect(`/${locale}/account/sign-in?next=${encodeURIComponent(`/${locale}/school/${tab}`)}`);

  const specific = { admin: "students", teacher: "attendance", guardian: "children" } as const;
  if (!["home", "messages", "more", specific[session.activePersona]].includes(tab)) notFound();
  const text = dictionary(locale);
  const menuKeys = ["access.manage","school.manage","students.manage","staff.invite","academics.supervise","attendance.supervise","bank.configure","finance.issue","finance.read","finance.post"] as const;
  const { capabilities, moderation, stopManager } = tab === "more"
    ? await schoolMenuAccess(session, menuKeys)
    : { capabilities: [], moderation: false, stopManager: false };
  const [access, calendar, placement, teacherInvites, academic, attendance, bank, billing, finance, posting] = menuKeys.map(key => capabilities.includes(key));
  const invites = teacherInvites || placement;
  const families = tab === "students" && await mayUse(session, "students.manage");
  if (tab === "students" && !families) notFound();
  const familyAccess=families?await Promise.all([mayUse(session,"finance.issue"),mayUse(session,"finance.read"),mayUse(session,"finance.post"),mayUse(session,"attendance.supervise"),mayUse(session,"academics.supervise"),mayManageStops(session)]):[false,false,false,false,false,false];
  const welcome=tab==="home"?await schoolProfile(session).catch(()=>null):null;
  return (
    <>
      {tab!=="messages"&&tab!=="students"&&<h1>{tab==="home" ? <>{locale==="ar"?"مرحبًا":"Hallo"}{welcome?.displayName&&<>{locale==="ar"?"، ":", "}<bdi>{welcome.displayName}</bdi></>}</> : text[tab as Tab]}</h1>}
      {tab==="messages"&&<CommunicationHub locale={locale} thread={z.uuid().safeParse(search.thread).data} section={search.section}/>}
      {tab === "home" && <SchoolHome locale={locale} asOf={schoolDateSchema.safeParse(search.asOf).data} />}
      {families && <><Families locale={locale} access={{financeIssue:familyAccess[0],financeRead:familyAccess[0]||familyAccess[1]||familyAccess[2],oversight:familyAccess[3]&&familyAccess[4],stops:familyAccess[5]}}/>
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
        {(placement || calendar || academic || stopManager || session.activePersona==="guardian") && <MoreGroup group="admissions"><summary>{locale==="ar"?"القيد وشؤون الطلبة":"Aufnahme und Schulverwaltung"}</summary><div className="more-rows">
            {(calendar || placement || academic) && <Link className="more-row" href={`/${locale}/school/more/classes`}>{locale === "ar" ? "الفصول وقيد الطلبة" : "Klassen und Einschreibungen"}</Link>}
            {calendar && <Link className="more-row" href={`/${locale}/school/more/calendar`}>{locale === "ar" ? "السنة الدراسية والتقويم" : "Schuljahr und Kalender"}</Link>}
            {(stopManager||session.activePersona==="guardian")&&<Link className="more-row" href={`/${locale}/school/more/enrollment-stops`}>{locale==="ar"?"التوقف المؤقت":"Teilnahmepausen"}</Link>}
          </div>
        </MoreGroup>}
        {(finance||billing||posting||bank||session.activePersona==="guardian")&&<MoreGroup group="finance">
          <summary>{locale==="ar"?"الحسابات":"Buchhaltung"}</summary>
          <div className="more-rows">
            {(finance||posting||session.activePersona==="guardian")&&<Link className="more-row" href={`/${locale}/school/more/finance-reports`}>{session.activePersona==="guardian"?(locale==="ar"?"مدفوعاتي":"Meine Zahlungen"):(locale==="ar"?"نظرة مالية":"Finanzübersicht")}</Link>}
            {(finance||billing||posting||session.activePersona==="guardian")&&<Link className="more-row" href={`/${locale}/school/more/invoices`}>{locale==="ar"?"الفواتير":"Rechnungen"}</Link>}
            {(finance||posting)&&<Link className="more-row" href={`/${locale}/school/more/receipts`}>{locale==="ar"?"المدفوعات":"Zahlungen"}</Link>}
            {(billing||bank)&&<Link className="more-row" href={`/${locale}/school/more/fee-settings`}>{locale==="ar"?"إعدادات الحسابات":"Einstellungen"}</Link>}
          </div>
        </MoreGroup>}
        {(access || moderation) && <MoreGroup group="permissions">
          <summary>{locale === "ar" ? "الصلاحيات" : "Berechtigungen"}</summary>
          <div className="more-rows">
            {access && <Link className="more-row" href={`/${locale}/staff/access`}>{locale === "ar" ? "إدارة الصلاحيات" : "Berechtigungen verwalten"}</Link>}
            {moderation&&<Link className="more-row" href={`/${locale}/school/more/message-reports`}>{locale==="ar"?"بلاغات الرسائل":"Gemeldete Nachrichten"}</Link>}
          </div>
        </MoreGroup>}
        <MoreGroup group="account">
          <summary>{locale === "ar" ? "الحساب والجهاز" : "Konto und Gerät"}</summary>
          <div className="more-rows">
            <Link className="more-row" href={`/${locale}/account/profile`}>{locale==="ar"?"الملف الشخصي":"Profil"}</Link>
            <Link className="more-row" href={`/${locale}/account/preferences`}>{locale === "ar" ? "تفضيلات الحساب والإشعارات" : "Konto und Benachrichtigungen"}</Link>
            <Link className="more-row" href={`/${locale}/account/security`}>{locale === "ar" ? "الأمان والاسترجاع" : "Sicherheit und Wiederherstellung"}</Link>
          </div>
          <SessionControls locale={locale} session={session} />
        </MoreGroup>
      </div>}
    </>
  );
}
