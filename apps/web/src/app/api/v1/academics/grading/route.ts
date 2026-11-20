import { gradingInboxQuery } from "@madrasty/contracts";
import { gradingInbox } from "@/server/academics/gradebook";
import { academicQuery } from "@/server/academics/route-params";
import { api,data } from "@/server/http";
import { requireActor } from "@/server/identity/actor";

export const GET=api(async(request,context)=>{
  const page=await gradingInbox(await requireActor(request,context),academicQuery(request,gradingInboxQuery));
  return data(page.items,200,{nextCursor:page.nextCursor});
});
