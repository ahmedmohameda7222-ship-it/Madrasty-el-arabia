import type {Locale} from "@madrasty/contracts";
import {z} from "zod";
import {SchoolPublishing} from "@/features/comms/SchoolPublishing";

export default async function PublishingPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{item?:string;add?:string}>;
}){
  const [{locale},{item,add}]=await Promise.all([params,searchParams]);
  return <SchoolPublishing locale={locale} kind="event" selected={z.uuid().safeParse(item).data} create={add === "1"}/>;
}
