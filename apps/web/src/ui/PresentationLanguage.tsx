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
export function LanguageButton({locale}:{locale:Locale}){
 const {select,pending}=usePresentationLanguage();
 const target=locale==="ar"?"de":"ar";
 return <button type="button" className="plain-button" lang={target} disabled={pending} aria-busy={pending}
   onClick={()=>select(target)}>{target==="ar"?"العربية":"Deutsch"}</button>;
}
