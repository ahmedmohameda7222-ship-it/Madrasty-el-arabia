import type {Locale} from "@madrasty/contracts";
import {z} from "zod";
import {SchoolPublishing} from "@/features/comms/SchoolPublishing";

export default async function PublishingPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<{item?:string;create?:string}>;
}){
  const [{locale},{item,create}]=await Promise.all([params,searchParams]);
  return <SchoolPublishing locale={locale} kind="news" selected={z.uuid().safeParse(item).data} create={create==="1"}/>;
}
