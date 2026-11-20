import { attendanceNoticeQuery, attendanceNoticePosition } from "@madrasty/contracts";
import { ApiError, api, data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";
import { attendanceClassDay, type AttendanceClassRoute } from "@/server/attendance/route-params";
import { readRowNotices } from "@/server/attendance/changes";

export const maxDuration=25;

export const GET=api(async(request,context,route:AttendanceClassRoute)=>{
  const actor=await requireActor(request,context);
  const {classId,date}=await attendanceClassDay(route);
  const parsed=attendanceNoticeQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!parsed.success)throw new ApiError("validation");
  const stream=parsed.data.stream==="1";
  const position=attendanceNoticePosition.safeParse(request.headers.get("Last-Event-ID")).data??parsed.data.after;
  const first=await readRowNotices(actor,classId,date,position);
  if(!stream)return data(first);

  const encode=new TextEncoder();
  let active=true;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let resume:(()=>void)|undefined;
  const stop=()=>{
    active=false;
    if(timer)clearTimeout(timer);
    resume?.();
  };
  const response=new ReadableStream({
    start(controller){
      const finish=()=>{if(active)controller.close();stop();};
      request.signal.addEventListener("abort",stop,{once:true});
      const send=(message:string)=>{if(active)controller.enqueue(encode.encode(message));};
      const notice=(event:string,batch:typeof first)=>send(`id: ${batch.cursor}\nevent: ${event}\ndata: ${JSON.stringify(batch)}\n\n`);
      const tick=async()=>{
        try{
          if(request.signal.aborted)return;
          send("retry: 1500\n\n");
          notice(position===undefined?"snapshot":"rows",first);
          const until=Date.now()+16_500;
          let after=first.cursor;
          while(active&&Date.now()<until){
            await new Promise<void>((resolve)=>{resume=resolve;timer=setTimeout(resolve,2_500);});
            resume=undefined;
            if(!active)break;
            const batch=await readRowNotices(actor,classId,date,after);
            if(batch.rows.length){notice("rows",batch);after=batch.cursor;}
            else send(": heartbeat\n\n");
          }
        }catch(error){
          if(error instanceof ApiError&&["forbidden","not_found","unauthenticated"].includes(error.code)){
            send("event: forbidden\ndata: {}\n\n");
          }
        }finally{
          request.signal.removeEventListener("abort",stop);
          finish();
        }
      };
      void tick();
    },
    cancel:stop,
  });
  return new Response(response,{headers:{"Content-Type":"text/event-stream; charset=utf-8","X-Accel-Buffering":"no"}});
});
