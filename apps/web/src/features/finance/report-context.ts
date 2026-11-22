import {billingMonth,financeReportQuery,financeReportStatus,schoolDateSchema,type FinanceReportQuery} from "@madrasty/contracts";
import {z} from "zod";

const queryKeys={
  period:"period",classId:"class",studentId:"student",status:"status",asOf:"asOf",
  receivedFrom:"receivedFrom",receivedThrough:"receivedThrough",
} as const;
type PersistedKey=keyof typeof queryKeys;

export function readFinanceReportContext(params:Pick<URLSearchParams,"get">):FinanceReportQuery {
  const candidate={
    period:billingMonth.safeParse(params.get("period")).data,
    classId:z.uuid().safeParse(params.get("class")).data,
    studentId:z.uuid().safeParse(params.get("student")).data,
    status:financeReportStatus.safeParse(params.get("status")).data,
    asOf:schoolDateSchema.safeParse(params.get("asOf")).data,
    receivedFrom:schoolDateSchema.safeParse(params.get("receivedFrom")).data,
    receivedThrough:schoolDateSchema.safeParse(params.get("receivedThrough")).data,
  };
  const parsed=financeReportQuery.safeParse(candidate);
  return parsed.success?parsed.data:{...candidate,receivedFrom:undefined,receivedThrough:undefined};
}

export function writeFinanceReportContext(params:URLSearchParams,filters:FinanceReportQuery):URLSearchParams {
  const next=new URLSearchParams(params);
  for(const [field,key] of Object.entries(queryKeys) as [PersistedKey,string][]){
    const value=filters[field];
    if(value)next.set(key,value);
    else next.delete(key);
  }
  next.delete("cutoff");
  return n¶»§q«^