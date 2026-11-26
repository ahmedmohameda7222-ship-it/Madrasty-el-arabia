import { presentationParams } from "@/server/identity/ui-locale";
import { redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";

// Compatibility for old event links and notification deep links.
export default async function PublishingPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<Record<string,string|string[]|undefined>>;
}){
  const [{locale},search]=await Promise.all([presentationParams(params),searchParams]);
  const query=new URLSearchParams();
  for(const key of ["item","add","month","day","classId","view"]){const value=search[key];if(typeof value==="string"&&value)query.set(key,value);}
  redirect(`/${locale}/school/calendar${query.size?"?"+query:""}`);
}
