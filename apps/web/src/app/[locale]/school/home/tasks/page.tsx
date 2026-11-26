import { displayParams } from "@/server/identity/display-locale";
import { notFound,redirect } from "next/navigation";
import { schoolDateSchema,type Locale } from "@madrasty/contracts";
import { AdminWork } from "@/features/school/WorkQueues";
import { webSchoolSession } from "@/server/identity/web-session";
export default async function TasksPage({params,searchParams}:{params:Promise<{locale:Locale}>;searchParams:Promise<{asOf?:string}>}){
 const [{locale},query,session]=await Promise.all([displayParams(params),searchParams,webSchoolSession()]);
 if(!session)redirect(`/${locale}/account/sign-in`);
 if(session.activePersona!=="admin")notFound();
 return <><h1>{locale==="ar"?"مهام المدرسة":"Aufgaben der Schule"}</h1><AdminWork locale={locale} initialDay={schoolDateSchema.safeParse(query.asOf).data} tasksOnly/></>;
}
