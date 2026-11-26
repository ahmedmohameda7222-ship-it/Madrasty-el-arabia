import { displayParams } from "@/server/identity/display-locale";
import {notFound,redirect} from "next/navigation";
import type {Locale} from "@madrasty/contracts";
import {z} from "zod";
import {schoolResourceLanding} from "@/features/school/resourceDestination";

export default async function OpenSchoolNotice({params}:{params:Promise<{locale:Locale;id:string}>}){
  const {locale,id}=await displayParams(params);
  const notice=z.uuid().safeParse(id);
  if(!notice.success)notFound();
  redirect(schoolResourceLanding(locale,{kind:"notice",id:notice.data}));
}
