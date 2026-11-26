import type {Locale} from "@madrasty/contracts";

// Only the display setting is persisted. No form, credential, session or draft
// values are copied into browser storage, cookies or URLs.
export function setDisplayLocale(locale:Locale){
  document.cookie=`madrasty-ui-locale=${locale}; Path=/; SameSite=Lax; Max-Age=31536000${location.protocol==="https:"?"; Secure":""}`;
}
