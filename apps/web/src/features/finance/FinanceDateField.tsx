"use client";

import {useId,type ComponentPropsWithoutRef} from "react";
import type {Locale} from "@madrasty/contracts";
import css from "./FinanceWorkspace.module.css";

type Props=Omit<ComponentPropsWithoutRef<"input">,"type"|"value"|"className"|"aria-label"|"aria-describedby"|"lang"|"dir">&{
  locale:Locale;label:string;type:"date"|"month";value:string;className?:string;
};

/** The browser owns the picker and ISO value; its visible locale may follow the OS. */
export function FinanceDateField({locale,label,type,value,className,...props}:Props){
  const id="finance-date-"+useId().replace(/[^a-zA-Z0-9_-]/g,"");
  const language=locale==="ar"?"ar-EG":"de-DE";
  const date=new Date(type==="month"?value+"-01T00:00:00Z":value+"T00:00:00Z");
  const selected=!!value&&!Number.isNaN(date.getTime());
  const context=selected
    ?new Intl.DateTimeFormat(language,type==="month"
      ?{month:"long",year:"numeric",timeZone:"UTC"}
      :{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(date)
    :type==="month"?(locale==="ar"?"اختر الشهر والسنة":"Monat und Jahr wählen")
      :(locale==="ar"?"اختر التاريخ من التقويم":"Datum im Kalender wählen");
  return <label className={className}>{label}
    <input {...props} type={type} value={value} dir="ltr" lang={language} aria-label={label} aria-describedby={id}/>
    <small id={id} className={css.dateContext}><bdi>{context}</bdi></small>
  </label>;
}
