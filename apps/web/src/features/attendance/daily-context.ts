export type DailyAttendanceContext={classId:string;date:string};

export function readDailyAttendanceContext(params:Pick<URLSearchParams,"get">):DailyAttendanceContext {
  return {classId:params.get("class")??"",date:params.get("date")??""};
}

export function writeDailyAttendanceContext(params:URLSearchParams,patch:Partial<DailyAttendanceContext>):URLSearchParams {
  const next=new URLSearchParams(params);
  if(patch.classId!==undefined){
    if(patch.classId)next.set("class",patch.classId);
    else next.delete("class");
  }
  if(patch.date!==undefined){
    if(patch.date)next.set("date",patch.date);
    else next.delete("date");
  }
  return next;
}
