import { resolveUiLocale } from "@/server/identity/ui-locale";
import { PresentationDocument } from "@/ui/PresentationLanguage";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import "../school.css";

export const metadata: Metadata = {
  title: "مدرستي العربية · Madrasty El Arabia",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "مدرستي العربية", statusBarStyle: "default" },
  icons: { apple: "/school-180.png", icon: "/school-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F9FC" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export function generateStaticParams() {
  return localeSchema.options.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children, params,
}: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const result = localeSchema.safeParse((await params).locale);
  if (!result.success) notFound();

  const locale=await resolveUiLocale(result.data);
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body><PresentationDocument locale={locale}/>{children}</body>
    </html>
  );
}
