"use client";

import { useState } from "react";
import type { Locale } from "@madrasty/contracts";
import { dictionary } from "@/i18n";

export function formatSchoolDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

export function formatMoney(minorUnits: number, currency: string, locale: Locale) {
  const format = new Intl.NumberFormat(locale, { style: "currency", currency });
  return format.format(minorUnits / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
}

export function ConfirmedAt({ locale, value }: { locale: Locale; value: string }) {
  const formatted = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  return <small className="status">{dictionary(locale).confirmedAt} <time dateTime={value}><bdi>{formatted}</bdi></time></small>;
}

export function CopyValue({ locale, label, value, display }: {
  locale: Locale; label: string; value: string; display?: string;
}) {
  const text = dictionary(locale);
  const [feedback, setFeedback] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${text.copied} · ${label}`);
    } catch {
      setFeedback(text.copyFailed);
    }
  };
  return (
    <div className="copy-value">
      <span>{label}</span>
      <bdi dir="ltr">{feedback === text.copyFailed ? value : display ?? value}</bdi>
      <button type="button" className="plain-button" onClick={copy} aria-label={`${text.copy} ${label}`}>{text.copy}</button>
      <span role="status" className="status">{feedback}</span>
    </div>
  );
}
