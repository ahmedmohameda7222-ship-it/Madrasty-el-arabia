import { homeworkGradeBulkInput } from "@madrasty/contracts";
import { readHomeworkGrades,saveBulkHomeworkGrades } from "@/server/academics/gradebook";
import { academicId,type AcademicIdRoute } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const POST=api(async(request,context,route:AcademicIdRoute)=>{
  const actor=await requireActor(request,context),id=await academicId(route);
  const input=await readHomeworkGrades(request,homeworkGradeBulkInput);
  return data(await saveBulkHomeworkGrades(actor,id,request.headers.get("idempotency-key"),input));
});
