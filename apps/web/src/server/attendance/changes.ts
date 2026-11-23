import "server-only";
import { attendanceNoticeBatch } from "@madrasty/contracts";
import { withActor, type ActorContext } from "@/server/db/scoped";
import { ApiError } from "@/server/http";

export function readRowNotices(actor:ActorContext,classId:string,day:string,after?:string){
  if(actor.persona==="admin")throw new ApiError("forbidden");
  return withActor(actor,async(tx)=>{
    const [scope]=await tx<{allowed:boolean}[]>`
      select app.attendance_scope(${classId},${day}::date,'attendance.read') as allowed`;
    if(!scope.allowed)throw new ApiError("not_found");
    const [sheet]=await tx<{id:string}[]>`
      select id from app.attendance_sheet where class_id=${classId} and school_date=${day}::date`;
    if(!sheet)return attendanceNoticeBatch.parse({cursor:after??"0",rows:[]});
    if(after===undefined){
      const [latest]=await tx<{cursor:string}[]>`
        select coalesce(max(sequence),0)::text as cursor from app.attendance_row_notice where sheet_id=${sheet.id}`;
      return attendanceNoticeBatch.parse({cursor:latest.cursor,rows:[]});
    }
    const rows=await tx<{cursor:string;sheetId:string;rowId:string;revision:number}[]>`
      select sequence::text as cursor,sheet_id as "sheetId",row_id as "rowId",revision from app.attendance_row_notice
      where sheet_id=${sheet.id} and sequence>${after}::bigint order by sequence limit 100`;
    return attendanceNoticeBatch.parse({cursor:rows.at(-1)?.cursor??after,rows});
  });
}
