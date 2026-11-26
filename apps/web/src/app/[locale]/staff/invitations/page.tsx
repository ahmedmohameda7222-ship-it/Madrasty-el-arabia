import { displayParams } from "@/server/identity/display-locale";
import { redirect } from "next/navigation";
import { localeSchema } from "@madrasty/contracts";
import { notFound } from "next/navigation";
import { z } from "zod";

/** Legacy deep links resolve to the integrated family workspace. */
export default async function FormerInvitationPage({params,searchParams}:{
  params:Promise<{locale:string}>;
  searchParams:Promise<{batchId?:string;invite?:string}>;
}) {
  const [{locale},query]=await Promise.all([displayParams(params),searchParams]);
  const accepted=localeSchema.safeParse(locale);
  if(!accepted.success)notFound();
  const paramsOut=new URLSearchParams();
  if(z.uuid().safeParse(query.batchId).success)paramsOut.set("batchId",query.batchId!);
  if(z.uuid().safeParse(query.invite).success)paramsOut.set("invite",query.invite!);
  redirect(`/${accepted.data}/school/students${paramsOut.size?"?"+paramsOut:""}`);
}
