import {schoolResourceLinkSchema} from "@madrasty/contracts";
import {readSchoolResource} from "@/server/identity/resourceLinks";
import {api,ApiError,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

type ResourceRoute={params:Promise<{kind:string;id:string}>};
export const GET=api(async(request,context,route:ResourceRoute)=>{
  const actor=await requireActor(request,context);
  const {kind,id}=await route.params;
  const query=new URL(request.url).searchParams;
  if([...query.keys()].some((name)=>name!=="child"&&name!=="date")||
    query.getAll("child").length>1||query.getAll("date").length>1)throw new ApiError("not_found");
  const parsed=schoolResourceLinkSchema.safeParse({kind,id,childId:query.get("child")??undefined,date:query.get("date")??undefined});
  if(!parsed.success)throw new ApiError("not_found");
  return data(await readSchoolResource(actor,parsed.data));
});
