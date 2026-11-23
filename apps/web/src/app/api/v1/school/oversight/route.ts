import {schoolDateSchema} from "@madrasty/contracts";
import {api,data,ApiError} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
import {schoolOversight} from "@/server/school/oversight";

export const GET=api(async(request,ctx)=>{
  const actor=await requireActor(request,ctx);
  const dateValue=new URL(request.url).searchParams.get("date");
  const result=dateValue?schoolDateSchema.safeParse(dateValue):null;
  if(result&&!result.success)throw new ApiError("validation");
  return data(await schoolOversight(actor,result?.data));
});
