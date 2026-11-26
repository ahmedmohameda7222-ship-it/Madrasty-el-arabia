import { displayParams } from "@/server/identity/display-locale";
import {notFound,redirect} from "next/navigation";
import type {Locale} from "@madrasty/contracts";
import {ReportQueue} from "@/features/comms/ReportQueue";
import {mayManageMessageReports} from "@/server/comms/moderation";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function MessageReportsPage({params}:{params:Promise<{locale:Locale}>}){
  const [{locale},session]=await Promise.all([displayParams(params),webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(!await mayManageMessageReports(session))notFound();
  return <ReportQueue locale={locale}/>;
}
