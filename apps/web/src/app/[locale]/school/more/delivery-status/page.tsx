import {notFound,redirect} from "next/navigation";
import type {Locale} from "@madrasty/contracts";
import {DeliveryStatus} from "@/features/comms/DeliveryStatus";
import {mayViewDeliveryStatus} from "@/server/comms/delivery-status";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function DeliveryStatusPage({params}:{params:Promise<{locale:Locale}>}){
  const [{locale},session]=await Promise.all([params,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(!await mayViewDeliveryStatus(session))notFound();
  return <DeliveryStatus locale={locale}/>;
}
