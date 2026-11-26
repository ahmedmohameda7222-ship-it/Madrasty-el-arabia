import { presentationParams } from "@/server/identity/ui-locale";
import { redirect } from "next/navigation";
import type { Locale } from "@madrasty/contracts";
import { webSchoolSession } from "@/server/identity/web-session";
import { schoolPreferences } from "@/server/identity/preferences";
import { schoolProfile } from "@/server/identity/profile";
import { mayUse } from "@/server/access/capabilities";
import { SchoolShell } from "@/ui/Shell";
import { ProfileEditor } from "@/features/identity/ProfileEditor";

export default async function ProfilePage({params}:{params:Promise<{locale:Locale}>}){
  const [{locale},session]=await Promise.all([presentationParams(params),webSchoolSession()]);
  if(!session)redirect(`/${locale}/account/sign-in`);
  if(session.activePersona==="admin"&&session.assurance!=="aal2")redirect(`/${locale}/account/security`);
  const [settings,profile,mayManageStudents]=await Promise.all([schoolPreferences(session,locale),schoolProfile(session),mayUse(session,"students.manage")]);
  return <SchoolShell actor={{accountId:session.accountId,sessionId:session.sessionId,persona:session.activePersona}}
    locale={locale} theme={settings.theme} mayManageStudents={mayManageStudents}>
    <ProfileEditor locale={locale} initial={profile}/>
  </SchoolShell>;
}
