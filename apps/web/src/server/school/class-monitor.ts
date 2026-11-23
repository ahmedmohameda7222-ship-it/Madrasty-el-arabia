import "server-only";
import {adminMonitorClass,adminMonitorDashboard,adminMonitorStudent,
  type AdminMonitorClass,type AdminMonitorDashboard,type AdminMonitorStudent} from "@madrasty/contracts";
import {withActor,type ActorContext,type Transaction} from "@/server/db/scoped";
import {ApiError} from "@/server/http";

async function requireMonitor(tx:Transaction,actor:ActorContext){
  if(actor.persona!=="admin")throw new ApiError("forbidden");
  const [allowed]=await tx<{authorized:boolean}[]>`
    select app.has_capability('academics.supervise')
      and app.has_capability('attendance.supervise') as authorized`;
  if(!allowed?.authorized)throw new ApiError("forbidden");
}

export function adminClasses(actor:ActorContext,year:string):Promise<AdminMonitorClass[]>{
  if(actor.persona!=="admin")throw new ApiError("forbidden");
  return withActor(actor,async tx=>{
    await requireMonitor(tx,actor);
    const rows=await tx`select * from app.admin_monitor_classes(${year}::uuid)`;
    return adminMonitorClass.array().parse(rows);
  });
}
export function adminClass(actor:ActorContext,id:string):Promise<AdminMonitorDashboard>{
  if(actor.persona!=="admin")throw new ApiError("forbidden");
  return withActor(actor,async tx=>{
    await requireMonitor(tx,actor);
    const [row]=await tx<{value:unknown}[]>`select app.admin_class_monitor(${id}::uuid) as value`;
    if(!row?.value)throw new ApiError("not_found");
    return adminMonitorDashboard.parse(row.value);
  });
}
export function adminStudent(actor:ActorContext,classId:string,studentId:string):Promise<AdminMonitorStudent>{
  if(actor.persona!=="admin")throw new ApiError("forbidden");
  return withActor(actor,async tx=>{
    await requireMonitor(tx,actor);
    const [row]=await tx<{value:unknown}[]>`select app.admin_student_monitor(${classId}::uuid,${studentId}::uuid) as value`;
    if(!row?.value)throw new ApiError("not_found");
    return adminMonitorStudent.parse(row.value);
  });
}
