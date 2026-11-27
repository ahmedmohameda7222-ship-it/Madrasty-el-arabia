import { presentationParams } from "@/server/identity/ui-locale";
import {notFound,redirect} from "next/navigation";
import {localeSchema} from "@madrasty/contracts";
import {webSchoolSession} from "@/server/identity/web-session";
import { mayUseMany} from "@/server/access/capabilities";
import {AdminClassMonitor} from "@/features/school/AdminClassMonitor";

export default async function OversightPage({params}:{params:Promise<{locale:string}>}){
 const result=localeSchema.safeParse((await presentationParams(params)).locale);
 if(!result.success)notFound();
 const session=await webSchoolSession();
 if(!session)redirect(`/${result.data}/account/sign-in`);
 if(session.activePersona!=="admin")notFound();
 const [attendance,academics]=await mayUseMany(session,["attendance.supervise","academics.supervise"]);
 if(!attendance||!academics)notFound();
 return <AdminClassMonitor locale={result.data}/>;
}
