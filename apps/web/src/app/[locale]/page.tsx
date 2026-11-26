import { displayParams } from "@/server/identity/display-locale";
import Link from "next/link";
import type { Locale } from "@madrasty/contracts";
import { dictionary } from "@/i18n";
import { SchoolHeader } from "@/ui/Shell";

export default async function Welcome({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await displayParams(params);
  return (
    <main className="public-page">
      <SchoolHeader locale={locale} />
      <h1>{dictionary(locale).school}</h1>
      <Link className="primary-button" href={`/${locale}/account/sign-in`}>{locale === "ar" ? "تسجيل الدخول" : "Anmelden"}</Link>
      <Link className="plain-button" href={`/${locale}/install`}>{locale === "ar" ? "تثبيت مدرستي العربية" : "App installieren"}</Link>
    </main>
  );
}
