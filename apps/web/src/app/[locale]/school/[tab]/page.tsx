import { notFound, redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { webSchoolSession } from "@/server/identity/web-session";
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
  return (
    <>
      <h1>{text[tab as Tab]}</h1>
      {tab === "home" && <p>{text[session.activePersona]}</p>}
      {tab === "more" && <SessionControls locale={locale} session={session} />}
    </>
  );
}
