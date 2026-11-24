import "server-only";
import { accountProfileSchema, type AccountProfilePatch, type SchoolSession } from "@madrasty/contracts";
import { withActor, type ActorContext } from "@/server/db/scoped";
import { commitCommand, hashCommand } from "@/server/db/commands";
import { ApiError } from "@/server/http";

export function readProfile(actor:ActorContext) {
  return withActor(actor,async tx=>{
    const [row]=await tx<{profile:unknown}[]>`select app.self_profile() as profile`;
    if(!row?.profile)throw new ApiError("not_found");
    return accountProfileSchema.parse(row.profile);
  });
}
export function schoolProfile(session:SchoolSession) {
  return readProfile({accountId:session.accountId,sessionId:session.sessionId,persona:session.activePersona,
    assurance:session.assurance,requestId:crypto.randomUUID()});
}
export function saveProfile(actor:ActorContext,key:string|null,input:AccountProfilePatch) {
  return commitCommand(actor,"account.profile",key,hashCommand(input),{
    authorize:async tx=>{
      if(actor.persona!=="guardian")throw new ApiError("forbidden");
      if(input.kind==="child"){
        const [row]=await tx<{allowed:boolean}[]>`select app.has_child_link(${input.id}::uuid) and exists(select 1 from app.student where id=${input.id} and state='active') as allowed`;
        if(!row?.allowed)throw new ApiError("not_found");
      }
    },
    mutate:async tx=>{
      const [row]=await tx<{revision:number|null}[]>`select app.update_self_profile(${input.kind},${input.kind==="child"?input.id:null}::uuid,
        ${input.revision},${input.birthDate}::date,${input.kind==="child"?input.displayName:null},
        ${input.kind==="guardian"?input.phone:null},${input.kind==="guardian"?input.emergencyAddress:null}) as revision`;
      if(row?.revision==null)throw new ApiError("stale_revision");
      return {revision:row.revision};
    },
  });
}
