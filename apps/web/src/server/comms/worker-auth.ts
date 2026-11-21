import "server-only";
import {timingSafeEqual} from "node:crypto";
import {ApiError} from "@/server/http";

export function requireSchoolWorker(request:Request){
  const secret=process.env.SCHOOL_WORKER_SECRET;
  if(!secret)throw new ApiError("unavailable");
  const expected=Buffer.from("Bearer "+secret),provided=Buffer.from(request.headers.get("authorization")??"");
  if(expected.length!==provided.length||!timingSafeEqual(expected,provided))throw new ApiError("unauthenticated");
}
