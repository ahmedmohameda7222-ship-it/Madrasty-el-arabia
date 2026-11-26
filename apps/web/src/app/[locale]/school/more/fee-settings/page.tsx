import { presentationParams } from "@/server/identity/ui-locale";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import type {Locale} from "@madrasty/contracts";
import {AutomaticBilling} from "@/features/finance/AutomaticBilling";
import css from "@/features/finance/FinanceWorkspace.module.css";
import {FeeSettings} from "@/features/finance/FeeSettings";
import {mayUse} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function FeeSettingsPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{student?:string}>;
}){
  const [{locale},query,session]=await Promise.all([presentationParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const [billing,bank]=await Promise.all([mayUse(session,"finance.issue"),mayUse(session,"bank.configure")]);
  if(!billing&&!bank)notFound();
  return <div className={`${css.workspace} ${css.narrowForm} auth-form`}>
    <h1>{locale==="ar"?"إعدادات الحسابات":"Buchhaltung – Einstellungen"}</h1>
    {bank&&<Link className="plain-button" href={`/${locale}/school/more/bank`}>{locale==="ar"?"حساب التحصيل":"Zahlungskonto"}</Link>}
    {billing&&<><AutomaticBilling locale={locale}/><FeeSettings key={query.student??"settings"} locale={locale} student={z.uuid().safeParse(query.student).data}/></>}
  </div>;
}
