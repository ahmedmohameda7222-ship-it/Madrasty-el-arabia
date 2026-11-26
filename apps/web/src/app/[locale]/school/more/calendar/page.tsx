import { presentationParams } from "@/server/identity/ui-locale";
import { notFound, redirect } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { webSchoolSession } from "@/server/identity/web-session";
import { mayUse } from "@/server/access/capabilities";
import { SchoolCalendar } from "@/features/school/Calendar";

export default async function CalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const [route, session] = await Promise.all([presentationParams(params), webSchoolSession()]);
  const locale = localeSchema.safeParse(route.locale);
  if (!locale.success) notFound();
  if (!session) redirect(`/${locale.data}/account/sign-in`);
  if (!await mayUse(session, "school.manage")) notFound();
  return <SchoolCalendar locale={locale.data} />;
}
