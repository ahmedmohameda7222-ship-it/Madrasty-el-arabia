import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import type {Locale} from "@madrasty/contracts";
import Link from "next/link";
import {MonthlyBillingSettings} from "@/features/finance/MonthlyBillingSettings";
import {BankSettings} from "@/features/finance/BankSettings";
import {FeeSettings} from "@/features/finance/FeeSettings";
import {mayUse} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function FeeSettingsPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{student?:string;view?:string}>;
}){
  const [{locale},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const [fees,bank]=await Promise.all([mayUse(session,"finance.issue"),mayUse(session,"bank.configure")]);
  if(!fees&&!bank)notFound();
  const root=`/${locale}/school/more/fee-settings`;
  const showBank=bank&&(!fees||query.view==="bank");
  return <><h1>{locale==="ar"?"إعدادات الحسابات":"Einstellungen"}</h1><div className="header-actions">
    {fees&&<Link className="plain-button" href={root}>{locale==="ar"?"الرسوم":"Gebühren"}</Link>}
    {bank&&<Link className="plain-button" href={`${root}?view=bank`}>{locale==="ar"?"حساب التحصيل":"Zahlungskonto"}</Link>}
  </div>{showBank?<BankSettings locale={locale}/>:<><FeeSettings locale={locale} student={z.uuid().safeParse(query.student).data}/><MonthlyBillingSettings locale={locale}/></>}</>;
}
