import {billingOptionsQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {financeBillingOptions} from "@/server/finance/feeSettings";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>
  data(await financeBillingOptions(await requireActor(request,context),academicQuery(request,billingOptionsQuery).period)));
