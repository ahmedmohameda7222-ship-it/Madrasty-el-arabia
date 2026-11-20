import "server-only";
import {z} from "zod";
import {ApiError} from "@/server/http";

export type UploadRoute={params:Promise<{id:string;uploadId:string}>};
export type MediaRoute={params:Promise<{id:string;mediaId:string}>};

export async function mediaParams<C extends "uploadId"|"mediaId">(
  route:{params:Promise<{id:string}&Record<C,string>>},key:C,
){
  const params=await route.params;
  const routeId=z.uuid().safeParse(params.id),objectId=z.uuid().safeParse(params[key]);
  if(!routeId.success||!objectId.success)throw new ApiError("not_found");
  return {id:routeId.data,objectId:objectId.data};
}
