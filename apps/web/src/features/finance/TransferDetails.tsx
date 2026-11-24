"use client";

import type {Locale,TransferInstructions} from "@madrasty/contracts";
import {CopyValue,formatMoney} from "@/ui/RecordValues";
import css from "./FinanceWorkspace.module.css";

export const transferCopy={
  ar:{title:"بيانات التحويل البنكي",beneficiary:"اسم المستفيد",iban:"آيبان (IBAN)",amount:"المبلغ",reference:"مرجع التحويل (Verwendungszweck)",
    changed:"حساب التحصيل اتغيّر بعد إصدار الفاتورة. استخدم البيانات المحدّثة للتحويل.",external:"نفّذ التحويل من تطبيق البنك."},
  de:{title:"Überweisungsdaten",beneficiary:"Name des Zahlungsempfängers",iban:"IBAN",amount:"Betrag",reference:"Verwendungszweck",
    changed:"Das Zahlungskonto wurde nach der Rechnungsstellung geändert. Verwende die aktualisierten Daten.",
    external:"Führe die Überweisung in deiner Banking-App aus."},
} as const;

export function displayIban(iban:string){return iban.match(/.{1,4}/g)?.join(" ")??iban;}

function plainAmount(amount:number,currency:string){
  const digits=new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits??2;
  const divisor=10n**BigInt(digits);
  const value=BigInt(amount);
  if(!digits)return value.toString();
  return (value/divisor).toString()+"."+(value%divisor).toString().padStart(digits,"0");
}

export function TransferDetails({locale,details,showTitle=true,guidance=true}:{locale:Locale;details:TransferInstructions;showTitle?:boolean;guidance?:boolean}){
  const text=transferCopy[locale],amount=plainAmount(details.amountMinor,details.currency);
  return <section className={css.transferRows}>
    {showTitle&&<h2>{text.title}</h2>}
    {details.bankChanged&&<p className="notice" role="status">{text.changed}</p>}
    <CopyValue compact locale={locale} label={text.beneficiary} value={details.beneficiary}/>
    <CopyValue compact locale={locale} label={text.iban} value={details.iban} display={displayIban(details.iban)}/>
    <CopyValue compact locale={locale} label={text.amount} value={amount} display={formatMoney(details.amountMinor,details.currency,locale)}/>
    <CopyValue compact locale={locale} label={text.reference} value={details.reference}/>
    {guidance&&<p className={css.secondary}>{text.external}</p>}
  </section>;
}
