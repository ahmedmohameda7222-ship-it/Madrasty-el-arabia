import { displayParams } from "@/server/identity/display-locale";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { SchoolHeader } from "@/ui/Shell";
import { InvitationLanding } from "@/features/identity/Invitations";

export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function Invite({ params }: { params: Promise<{ locale: string }> }) {
  const locale = localeSchema.safeParse((await displayParams(params)).locale);
  if (!locale.success) notFound();
  return <main className="public-page"><SchoolHeader locale={locale.data} /><InvitationLanding locale={locale.data} /></main>;
}
