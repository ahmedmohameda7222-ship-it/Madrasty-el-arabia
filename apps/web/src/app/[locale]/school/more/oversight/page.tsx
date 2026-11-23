import {notFound,redirect} from "next/navigation";
import {localeSchema} from "@madrasty/contracts";
import {webSchoolSession} from "@/server/identity/web-session";
import {mayUse} from "@/server/access/capabilities";
import {AdminTeachingOverview} from "@/features/school/AdminTeachingOverview";

export default async function OversightPage({params}:{params:Promise<{locale:string}>}){
 const result=localeSchema.safeParse((await params).locale);
 if(!result.success)notFound();
 const session=await webSchoolSession();
 if(!session)redirect(`/${result.data}/account/sign-in`);
 if(session.activePersona!=="admin")notFound();
 const [attendance,academics]=await Promise.all([
   mayUse(session,"attendance.supervise"),mayUse(session,"academics.supervise"),
 ]);
 if(!attendance&&!academics)notFound();
 return <AdminTeachingOverview locale={result.data}/>;
}
