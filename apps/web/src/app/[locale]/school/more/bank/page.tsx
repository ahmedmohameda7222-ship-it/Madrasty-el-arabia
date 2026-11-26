import { presentationParams } from "@/server/identity/ui-locale";
import {notFound,redirect} from "next/navigation";
import type {Locale} from "@madrasty/contracts";
import {BankSettings} from "@/features/finance/BankSettings";
import {mayUse} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function SchoolBankPage({params}:{params:Promise<{locale:Locale}>}){
  const [{locale},session]=await Promise.all([presentationParams(params),webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(!await mayUse(session,"bank.configure"))notFound();
  return <BankSettings locale={locale}/>;
}
