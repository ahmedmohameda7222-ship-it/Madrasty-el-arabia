import "server-only";
import { z } from "zod";
import { ApiError } from "@/server/http";

export type AcademicIdRoute={params:Promise<{id:string}>};
export async function academicId(route:AcademicIdRoute){
  const result=z.uuid().safeParse((await route.params).id);
  if(!result.success)throw new ApiError("not_found");
  return result.data;
}
export type AcademicPupilRoute={params:Promise<{id:string;studentId:string}>};
export async function academicPupil(route:AcademicPupilRoute){
  const result=z.object({id:z.uuid(),studentId:z.uuid()}).safeParse(await route.params);
  if(!result.success)throw new ApiError("not_found");
  return result.data;
}
export function academicQuery<T>(request:Request,schema:z.ZodType<T>){
  const parsed=schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!parsed.success)throw new ApiError("validation",Object.fromEntries(parsed.error.issues.map(({path})=>[path.join(".")||"_","error.validation"])));
  return parsed.data;
}
