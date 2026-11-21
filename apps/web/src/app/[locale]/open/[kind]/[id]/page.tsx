import {notFound,redirect} from "next/navigation";
import {schoolResourceLinkSchema,type Locale} from "@madrasty/contracts";
import {schoolResourceDestination,schoolResourceLanding} from "@/features/school/resourceDestination";
import {ApiError} from "@/server/http";
import {readWebSchoolResource} from "@/server/identity/resourceLinks";
import {webSchoolSession} from "@/server/identity/web-session";

export default async function SchoolResourceLanding({params,searchParams}:{
  params:Promise<{locale:Locale;kind:string;id:string}>;
  searchParams:Promise<{child?:string;date?:string}>;
}){
  const [{locale,kind,id},query,session]=await Promise.all([params,searchParams,webSchoolSession()]);
  const parsed=schoolResourceLinkSchema.safeParse({kind,id,childId:query.child,date:query.date});
  if(!parsed.success)notFound();
  if(!session)redirect(`/${locale}/account/sign-in?next=${encodeURIComponent(schoolResourceLanding(locale,parsed.data))}`);
  try{await readWebSchoolResource(session,parsed.data);}
  catch(problem){if(problem instanceof ApiError&&["not_found","forbidden"].includes(problem.code))notFound();throw problem;}
  redirect(schoolResourceDestination(locale,parsed.data));
}
