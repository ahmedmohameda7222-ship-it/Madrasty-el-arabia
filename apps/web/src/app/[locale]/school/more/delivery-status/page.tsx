import {notFound,redirect} from "next/navigation";
import {z} from "zod";
import type {Locale} from "@madrasty/contracts";
import {DeliveryStatus} from "@/features/comms/DeliveryStatus";
import {mayViewDeliveryStatus} from "@/server/comms/delivery-status";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function DeliveryStatusPage({params,searchParams}:{params:Promise<{locale:Locale}>;searchParams:Promise<{job?:string}>}){
  const [{locale},session,query]=await Promise.all([params,webSchoolSession(),searchParams]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(!await mayViewDeliveryStatus(session))notFound();
  return <DeliveryStatus locale={locale} job={z.uuid().safeParse(query.job).data}/>;
}
