import { notFound, redirect } from "next/navigation";
import { auditQuery, type Locale } from "@madrasty/contracts";
import { z } from "zod";
import { Audit } from "@/features/school/Audit";
import { mayUse } from "@/server/access/capabilities";
import { webSchoolSession } from "@/server/identity/web-session";

export default async function AuditPage({params,searchParams}:{
  params:Promise<{locale:Locale}>;searchParams:Promise<Record<string,string|undefined>>;
}){
  const [{locale},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(session.activePersona==="admin"&&session.assurance!=="aal2")redirect(`/${locale}/account/security`);
  if(!await mayUse(session,"audit.read"))notFound();
  const parsed=auditQuery.safeParse(query);
  const filters=parsed.success?parsed.data:undefined;
  return <Audit locale={locale} entry={z.uuid().safeParse(query.entry).data}
    initial={{from:filters?.from??"",to:filters?.to??"",actorId:filters?.actorId??"",action:filters?.action??"",resourceKind:filters?.resourceKind??""}}/>;
}
