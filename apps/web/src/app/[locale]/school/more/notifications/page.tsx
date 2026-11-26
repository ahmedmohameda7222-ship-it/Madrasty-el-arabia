import { presentationParams } from "@/server/identity/ui-locale";
import type {Locale} from "@madrasty/contracts";
import {z} from "zod";
import {NotificationCenter} from "@/features/comms/NotificationCenter";

export default async function NotificationsPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{notice?:string}>;
}){
  const [{locale},{notice}]=await Promise.all([presentationParams(params),searchParams]);
  return <NotificationCenter locale={locale} selected={z.uuid().safeParse(notice).data}/>;
}
