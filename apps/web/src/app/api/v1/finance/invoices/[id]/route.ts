import {academicId,type AcademicIdRoute} from "@/server/academics/route-params";
import {loadInvoice} from "@/server/finance/invoices";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context,route:AcademicIdRoute)=>
  data(await loadInvoice(await requireActor(request,context),await academicId(route))));
