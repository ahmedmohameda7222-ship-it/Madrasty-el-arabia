"use client";

import { useSearchParams } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { dictionary } from "@/i18n";
import { Icon } from "./Icon";
import { SchoolLink } from "./SchoolLink";

export function MoreBackLink({ locale }: { locale: Locale }) {
  return (
    <SchoolLink className="plain-button more-back-link" href={`/${locale}/school/more`} replace>
      <Icon name="back" />
      {dictionary(locale).backToMore}
    </SchoolLink>
  );
}

export function ApplicationMoreBackLink({ locale }: { locale: Locale }) {
  const source = useSearchParams().get("from");
  return source === "more" ? <MoreBackLink locale={locale} /> : null;
}
