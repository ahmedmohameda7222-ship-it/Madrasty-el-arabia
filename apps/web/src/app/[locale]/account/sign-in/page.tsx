import { presentationParams } from "@/server/identity/ui-locale";
import { cookies } from "next/headers";
import type { Locale } from "@madrasty/contracts";
import { z } from "zod";
import { SchoolHeader } from "@/ui/Shell";
import { RecoveryLink } from "@/features/identity/SecurityForms";
import {safeSchoolResourceReturn} from "@/features/school/resourceDestination";
import { SignInForm } from "@/features/identity/SessionControls";

export default async function SignIn({ params, searchParams }: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ next?: string; android?: string }>;
}) {
  const [{ locale }, { next, android }, jar] = await Promise.all([presentationParams(params), searchParams, cookies()]);
  const home = `/${locale}/school/home`;
  const safePaths = ["home", "students", "attendance", "children", "messages", "more"];
  const candidate = typeof next === "string" ? next : undefined;
  const noticeInbox = `/${locale}/school/more/notifications`;
  const noticePrefix = noticeInbox + "?notice=";
  const noticeLink = candidate?.startsWith(noticePrefix) && z.uuid().safeParse(candidate.slice(noticePrefix.length)).success;
  const safe = safePaths.some((tab) => candidate === `/${locale}/school/${tab}`) || candidate === noticeInbox || noticeLink;
  const destination = safe && candidate ? candidate : safeSchoolResourceReturn(locale,candidate)??home;
  const refreshable = jar.has("__Host-madrasty-refresh") || jar.has("madrasty-refresh");
  return (
    <main className="public-page">
      <SchoolHeader locale={locale} />
      {android === "1" && <p className="notice">{locale === "ar"
        ? "افتح رابط المتابعة في التطبيق على الجهاز اللي بدأت منه، أو سجّل الدخول هنا."
        : "Öffnen Sie den Link in der App auf dem ursprünglichen Gerät oder melden Sie sich hier an."}</p>}
      <SignInForm locale={locale} destination={destination} refreshable={refreshable} />
      <RecoveryLink locale={locale} />
    </main>
  );
}
