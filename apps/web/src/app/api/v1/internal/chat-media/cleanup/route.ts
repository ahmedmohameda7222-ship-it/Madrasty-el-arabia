import {cleanupChatMedia} from "@/server/comms/media";
import {requireSchoolWorker} from "@/server/comms/worker-auth";
import {api,data} from "@/server/http";

export const POST=api(async(request)=>{
  requireSchoolWorker(request);
  return data(await cleanupChatMedia());
});
