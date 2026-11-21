import {androidRelease} from "@/server/release/android";
import {api,ApiError} from "@/server/http";

export const GET=api(async()=>{
  const release=androidRelease();
  if(!release)throw new ApiError("unavailable");
  return new Response(null,{
    status:302,headers:{Location:release.artifact,"X-Content-Type-Options":"nosniff"},
  });
});
