import "server-only";
import {schoolResourceLinkSchema,type SchoolResourceLink,type SchoolSession} from "@madrasty/contracts";
import {withActor,type ActorContext} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

export function readSchoolResource(actor:ActorContext,value:SchoolResourceLink){
  const target=schoolResourceLinkSchema.parse(value);
  return withActor(actor,async(tx)=>{
    const [row]=await tx<{allowed:boolean}[]>`select app.open_school_resource(${tx.json(target)}) as allowed`;
    if(!row.allowed)throw new ApiError("not_found");
    return target;
  });
}

export function readWebSchoolResource(session:SchoolSession,target:SchoolResourceLink){
  return readSchoolResource({
    accountId:session.accountId,sessionId:session.sessionId,persona:session.activePersona,assurance:session.assurance,requestId:crypto.randomUUID(),
  },target);
}
