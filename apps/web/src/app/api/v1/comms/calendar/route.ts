import {communicationCalendarQuery} from "@madrasty/contracts";
import {academicQuery} from "@/server/academics/route-params";
import {communicationCalendar} from "@/server/comms/schoolPublishing";
import {api,data} from "@/server/http";
import {requireActor} from "@/server/identity/actor";
export const GET=api(async(request,context)=>data(await communicationCalendar(await requireActor(request,context),academicQuery(request,communicationCalendarQuery))));
