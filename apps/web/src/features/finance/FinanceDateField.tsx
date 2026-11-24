"use client";

import {useEffect,useId,useState,type ComponentPropsWithoutRef} from "react";
import type {Locale} from "@madrasty/contracts";
import css from "./FinanceWorkspace.module.css";

type Props=Omit<ComponentPropsWithoutRef<"input">,"type"|"value"|"className"|"aria-label"|"aria-describedby"|"lang"|"dir">&{
  locale:Locale;label:string;type:"date"|"month";value:string;className?:string;
};

export function financeDate(value:string,locale:Locale,type:"date"|"month"="date"){
  if(!value)return "";
  const date=new Date(type==="month"?value+"-01T00:00:00Z":value+"T00:00:00Z");
  if(Number.isNaN(date.getTime()))return value;
  return new Intl.DateTimeFormat(locale==="ar"?"ar-EG":"de-DE",type==="month"
    ?{month:"long",year:"numeric",timeZone:"UTC"}
    :{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(date);
}

/** Keep the real native input and its ISO value, but own the bounded localized display.
 * Browsers without a native month picker retain a visible editable ISO text fallback. */
export function FinanceDateField({locale,label,type,value,className,...props}:Props){
  const id="finance-date-"+useId().replace(/[^a-zA-Z0-9_-]/g,"");
  const language=locale==="ar"?"ar-EG":"de-DE";
  const [native,setNative]=useState(true);
  useEffect(()=>{const probe=document.createElement("input");probe.type=type;setNative(probe.type===type);},[type]);
  const prompt=type==="month"?(locale==="ar"?"اختر الشهر والسنة":"Monat wählen")
    :(locale==="ar"?"اختر التاريخ":"Datum wählen");
  const context=financeDate(value,locale,type)||prompt;
  return <label className={[css.dateField,className].filter(Boolean).join(" ")}>{label}
    <span className={native?css.dateControl:css.dateFallback} data-empty={!value}>
      <input {...props} type={type} value={value} dir="ltr" lang={language} aria-label={label} aria-describedby={id}
        placeholder={native?undefined:type==="month"?"YYYY-MM":"YYYY-MM-DD"}/>
      <span id={id} className={css.dateContext}><bdi>{native?context:prompt+" · "+(type==="month"?"YYYY-MM":"YYYY-MM-DD")}</bdi></span>
      {native&&<svg className={css.dateIcon} aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>}
    </span>
  </label>;
}
