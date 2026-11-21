import type { Locale } from "@madrasty/contracts";
import ar from "./ar.json";
import de from "./de.json";

const messages = { ar, de } satisfies Record<Locale, typeof ar>;
export type MessageKey = keyof typeof ar;

export function dictionary(locale: Locale) {
  return messages[locale];
}

export function localizedError(locale: Locale, key: string) {
  const text = messages[locale];
  return Object.hasOwn(text, key) ? text[key as MessageKey] : text["error.internal"];
}
