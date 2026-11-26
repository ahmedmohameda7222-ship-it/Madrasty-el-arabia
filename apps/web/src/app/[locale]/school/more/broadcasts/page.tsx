import { displayParams } from "@/server/identity/display-locale";
import {redirect} from "next/navigation";
import type {Locale} from "@madrasty/contracts";
import {z} from "zod";
import {BroadcastHub} from "@/features/comms/BroadcastComposer";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function BroadcastPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{announcement?:string}>;
}){
  const [{locale},{announcement},session]=await Promise.all([displayParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  return <BroadcastHub locale={locale} selected={z.uuid().safeParse(announcement).data}/>;
}
