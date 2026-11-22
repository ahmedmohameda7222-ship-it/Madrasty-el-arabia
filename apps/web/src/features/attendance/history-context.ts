export type AttendanceHistoryFilters={from:string;to:string;status:string};

export function readAttendanceHistoryFilters(params:Pick<URLSearchParams,"get">):AttendanceHistoryFilters {
  return {from:params.get("from")??"",to:params.get("to")??"",status:params.get("status")??""};
}

export function writeAttendanceHistoryFilters(params:URLSearchParams,filters:AttendanceHistoryFilters):URLSearchParams {
  const next=new URLSearchParams(params);
  for(const key of ["from","to","status"] as const){
    if(filters[key])next.set(key,filters[key]);
    else next.delete(key);
  }
  return next;
}
