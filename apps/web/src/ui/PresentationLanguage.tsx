"use client";
import { useLayoutEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { UI_LOCALE_COOKIE } from "@/i18n/presentation";

export function usePresentationLanguage(){
 const router=useRouter();
 const [pending,startTransition]=useTransition();
 function select(locale:Locale){
  // Persist only the language code. Keep the current route, form instances,
  // query, history and authentication untouched.
  document.cookie=UI_LOCALE_COOKIE+"="+locale+"; Path=/; Max-Age=31536000; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"");
  startTransition(()=>router.refresh());
 }
 return {select,pending};
}
export function PresentationDocument({locale}:{locale:Locale}){
 useLayoutEffect(()=>{
  document.documentElement.lang=locale;
  document.documentElement.dir=locale==="ar"?"rtl":"ltr";
 },[locale]);
 return null;
}
export function LanguageSettings({locale}:{locale:Locale}){
 const {select,pending}=usePresentationLanguage();
 const label=locale==="ar"?"لغة التطبيق":"App-Sprache";
 return <section className="app-language-settings" aria-label={label}>
  <h3>{label}</h3>
  <div className="app-language-options" role="group" aria-label={label}>
   {(["ar","de"] as const).map(language=><button key={language} type="button" className="plain-button"
    lang={language} aria-pressed={language===locale} disabled={pending} onClick={()=>{if(language!==locale)select(language);}}>
    {language==="ar"?"العربية":"Deutsch"}
   </button>)}
  </div>
 </section>;
}
