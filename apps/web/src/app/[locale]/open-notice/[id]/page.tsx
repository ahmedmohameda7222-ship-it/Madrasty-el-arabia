import {redirect} from "next/navigation";
import type {Locale} from "@madrasty/contracts";
import {z} from "zod";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function OpenSchoolNotice({params}:{params:Promise<{locale:Locale;id:string}>}){
  const [{locale,id},session]=await Promise.all([params,webSchoolSession()]);
  const notice=z.uuid().safeParse(id);
  const inbox=`/${locale}/school/more/notifications`;
  const next=notice.success?`${inbox}?notice=${notice.data}`:inbox;
  if(!session)redirect(`/${locale}/account/sign-in?next=${encodeURIComponent(next)}`);
  redirect(next);
}
