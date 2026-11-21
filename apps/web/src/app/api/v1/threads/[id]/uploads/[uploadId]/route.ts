import {mediaUploadAction} from "@madrasty/contracts";
import {updateMediaUpload} from "@/server/comms/media";
import {mediaParams,type UploadRoute} from "@/server/comms/media-params";
import {api,data,readJson} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const POST=api(async(request,context,route:UploadRoute)=>{
  const actor=await requireActor(request,context),{id,objectId}=await mediaParams(route,"uploadId");
  const {action}=await readJson(request,mediaUploadAction,2048);
  return data(await updateMediaUpload(actor,id,objectId,action,request.headers.get("idempotency-key")));
});
