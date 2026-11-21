import {noticeQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {listNotices} from "@/server/comms/notifications";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await listNotices(await requireActor(request,context),academicQuery(request,noticeQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
