import {dispatchSchoolDelivery} from "@/server/comms/dispatch";
import {requireSchoolWorker} from "@/server/comms/worker-auth";
import {api,data} from "@/server/http";

export const maxDuration=90;
export const POST=api(async(request)=>{
  requireSchoolWorker(request);
  return data(await dispatchSchoolDelivery());
});
