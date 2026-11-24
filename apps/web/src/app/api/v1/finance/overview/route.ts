import {billingMonth} from "@madrasty/contracts";
import {api,data,ApiError} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
import {withActor} from "@/server/db/scoped";
export const GET=api(async(request,context)=>{
 const actor=await requireActor(request,context),raw=new URL(request.url).searchParams.get("month");
 const parsed=billingMonth.safeParse(raw);
 if(raw!==null&&!parsed.success)throw new ApiError("validation");
 return data(await withActor(actor,async tx=>{
  const [scope]=await tx<{allowed:boolean;month:string}[]>`select app.finance_receipt_staff() as allowed,to_char(app.billing_school_month(),'YYYY-MM') as month`;
  if(!scope.allowed)throw new ApiError("forbidden");
  const month=parsed.data??scope.month;
  const [row]=await tx`select to_char(school_month,'YYYY-MM') as "schoolMonth",currency,active::float8 as active,paused::float8 as paused,months from app.finance_overview(${month+"-01"}::date)`;
  if(!row)throw new ApiError("validation");
  return {...row,month};
 }));
});
