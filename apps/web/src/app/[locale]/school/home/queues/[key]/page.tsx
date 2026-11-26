import { displayParams } from "@/server/identity/display-locale";
import { notFound, redirect } from "next/navigation";
import { schoolDateSchema, workQueueKeySchema, type Locale } from "@madrasty/contracts";
import { WorkQueue } from "@/features/school/WorkQueues";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function WorkQueuePage({params,searchParams}:{
  params:Promise<{locale:Locale;key:string}>;searchParams:Promise<{asOf?:string}>;
}){
  const [route,query,session]=await Promise.all([displayParams(params),searchParams,webSchoolSession()]);
  if(!session)redirect(`/${route.locale}/account/sign-in`);
  if(session.activePersona!=="admin")notFound();
  const key=workQueueKeySchema.safeParse(route.key);
  if(!key.success)notFound();
  return <WorkQueue locale={route.locale} queue={key.data} asOf={schoolDateSchema.safeParse(query.asOf).data}/>;
}
