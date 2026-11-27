import {FinanceNavigation} from "@/features/finance/FinanceNavigation";
import { presentationParams } from "@/server/identity/ui-locale";
import {notFound,redirect} from "next/navigation";
import type {Locale} from "@madrasty/contracts";
import {BankSettings} from "@/features/finance/BankSettings";
import {mayUseMany} from "@/server/access/capabilities";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function SchoolBankPage({params}:{params:Promise<{locale:Locale}>}){
  const [{locale},session]=await Promise.all([presentationParams(params),webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  const [bank,read,post,issue]=await mayUseMany(session,["bank.configure","finance.read","finance.post","finance.issue"]);
  if(!bank)notFound();
  return <><FinanceNavigation locale={locale} section="settings" read={read} post={post} issue={issue} bank={bank}/><BankSettings locale={locale}/></>;
}
