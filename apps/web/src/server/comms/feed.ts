import "server-only";
import {communicationFeedEntry,communicationFeedKind,type communicationFeedQuery} from "@madrasty/contracts";
import {z} from "zod";
import {withActor,type ActorContext} from "@/server/db/scoped";
import {ApiError} from "@/server/http";
const position=z.object({id:z.uuid(),kind:communicationFeedKind,publishedAt:z.iso.datetime()});
function readCursor(value?:string){
  if(!value)return null;
  try{if(!/^[A-Za-z0-9_-]{1,400}$/.test(value))throw Error("cursor");return position.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")));}
  catch{throw new ApiError("validation",{cursor:"error.validation"});}
}
export function communicationFeed(actor:ActorContext,input:z.infer<typeof communicationFeedQuery>){
  return withActor(actor,async tx=>{
    const cursor=readCursor(input.cursor);
    const rows=communicationFeedEntry.array().parse(await tx`
      with broadcasts as (
        select id,published_at,copy,false as can_manage from app.received_school_broadcasts(null)
        union all select id,published_at,copy,true from app.sent_school_broadcasts() where ${actor.persona!=="guardian"}
      ), dedup as (select distinct on (id) * from broadcasts order by id,can_manage desc),
      feed as (
        select 'announcement'::text as kind,id,published_at,copy->${input.locale}::text->>'title' as title,
          copy->${input.locale}::text->>'body' as body,can_manage from dedup
        union all
        select 'news'::text,id,published_at,coalesce(copy->${input.locale}::text,copy->source_locale)->>'title',
          coalesce(copy->${input.locale}::text,copy->source_locale)->>'body',can_edit
        from app.school_publishing_rows('news','feed',null,null,null) where published_at is not null
      )
      select id,kind,title,body,to_char(published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "publishedAt",can_manage as "canManage"
      from feed where (${input.filter}='all' or kind=${input.filter}) and
      (${cursor?.id??null}::uuid is null or (published_at,kind,id)<(${cursor?.publishedAt??null}::timestamptz,${cursor?.kind??null}::text,${cursor?.id??null}::uuid))
      order by published_at desc,kind desc,id desc limit ${input.limit+1}`);
    const items=rows.slice(0,input.limit),last=items.at(-1);
    return {items,nextCursor:rows.length>input.limit&&last?Buffer.from(JSON.stringify(position.parse(last))).toString("base64url"):undefined};
  });
}
