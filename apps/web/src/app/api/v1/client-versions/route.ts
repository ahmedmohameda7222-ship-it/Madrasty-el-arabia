import {androidRelease} from "@/server/release/android";
import {api,ApiError,data} from "@/server/http";

export const GET=api(async()=>{
  const release=androidRelease();
  if(!release)throw new ApiError("unavailable");
  return data(release.versions);
});
