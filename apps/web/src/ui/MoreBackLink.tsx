"use client";

import { useSearchParams } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { dictionary } from "@/i18n";
import { Icon } from "./Icon";
import { SchoolLink } from "./SchoolLink";

export function MoreBackLink({ locale, child, schoolClass, communication }: { locale: Locale; child?: string; schoolClass?: { year:string; id:string }; communication?: "chat"|"feed"|"calendar" }) {
  const base = `/${locale}/school`;
  const search=useSearchParams();
  const returnParams=new URLSearchParams();
  if(communication){returnParams.set("section",communication);if(communication==="calendar")for(const key of ["month","day","classId","view"]){const value=search.get(key);if(value)returnParams.set(key,value);}}
  const href = communication ? `${base}/messages?${returnParams}` : child ? `${base}/children?child=${child}` : schoolClass
    ? `${base}/more/classes?year=${schoolClass.year}&class=${schoolClass.id}` : `${base}/more`;
  const label = communication ? (locale==="ar"?"رجوع للتواصل":"Zurück zu Kontakt") : child ? (locale === "ar" ? "رجوع لملف الطفل" : "Zurück zum Kinderprofil") : schoolClass
    ? (locale === "ar" ? "رجوع للفصل" : "Zurück zur Klasse") : dictionary(locale).backToMore;
  return (
    <SchoolLink className="plain-button more-back-link" href={href} replace>
      <Icon name="back" />
      {label}
    </SchoolLink>
  );
}

export function ApplicationMoreBackLink({ locale }: { locale: Locale }) {
  const source = useSearchParams().get("from");
  return source === "more" ? <MoreBackLink locale={locale} /> : null;
}
