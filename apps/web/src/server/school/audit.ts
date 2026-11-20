import "server-only";
import {
  auditEntrySchema, auditFiltersSchema,
  type auditFiltersQuery, type auditQuery, type AuditEntry, type Locale, type Persona,
} from "@madrasty/contracts";
import { z } from "zod";
import { requireCapability } from "@/server/access/policies";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";

const position = z.object({id:z.uuid(),occurredAt:z.iso.datetime()});
const actorLabel: Record<Locale,Record<Persona,string>> = {
  ar:{admin:"موظف إدارة",teacher:"مدرس",guardian:"ولي أمر"},
  de:{admin:"Verwaltungskraft",teacher:"Lehrkraft",guardian:"Sorgeberechtigte"},
};
type Row = Omit<AuditEntry,"actorDisplay"|"permittedResourceLink"> & {
  actorPersona:Persona; actorDisplay:string|null; permittedResourceLink:unknown;
};

const columns=(tx:Transaction)=>tx`
  id,to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "occurredAt",
  actor_persona as "actorPersona",actor_display as "actorDisplay",action,resource_kind as "resourceKind",
  change_category as "changeCategory",request_id as "requestId",resource_link as "permittedResourceLink"
`;
function serialize(row:Row, locale:Locale) {
  return auditEntrySchema.parse({...row,actorDisplay:row.actorDisplay??actorLabel[locale][row.actorPersona],
    permittedResourceLink:row.permittedResourceLink??undefined});
}

function decodeCursor(cursor?:string) {
  if(!cursor)return null;
  try{
    if(!/^[A-Za-z0-9_-]+$/.test(cursor))throw new Error("cursor");
    return position.parse(JSON.parse(Buffer.from(cursor,"base64url").toString("utf8")));
  }catch{
    throw new ApiError("validation",{cursor:"error.validation"});
  }
}

export function readSchoolAudit(actor:ActorContext,input:z.infer<typeof auditQuery>) {
  return withActor(actor,async(tx)=>{
    await requireCapability(tx,actor,"audit.read");
    const after=decodeCursor(input.cursor);
    const rows=await tx<Row[]>`
      select ${columns(tx)} from app.school_audit_projection(
        ${input.from??null}::date,${input.to??null}::date,${input.action??null}::text,${input.actorId??null}::uuid,null::uuid
      )
      where (${input.resourceKind??null}::text is null or resource_kind=${input.resourceKind??null})
        and (${after?.id??null}::uuid is null or (occurred_at,id)<(${after?.occurredAt??null}::timestamptz,${after?.id??null}::uuid))
      order by occurred_at desc,id desc limit ${input.limit+1}`;
    const entries=rows.slice(0,input.limit).map((row)=>serialize(row,input.locale));
    const end=entries.at(-1);
    return {entries,nextCursor:rows.length>input.limit&&end
      ? Buffer.from(JSON.stringify(position.parse(end))).toString("base64url") : undefined};
  });
}

export function readAuditEntry(actor:ActorContext,id:string,locale:Locale){
  return withActor(actor,async(tx)=>{
    await requireCapability(tx,actor,"audit.read");
    const [row]=await tx<Row[]>`select ${columns(tx)} from app.school_audit_projection(null,null,null,null,${id}::uuid)`;
    if(!row)throw new ApiError("not_found");
    return serialize(row,locale);
  });
}

export function readAuditFilters(actor:ActorContext,input:z.infer<typeof auditFiltersQuery>){
  return withActor(actor,async(tx)=>{
    await requireCapability(tx,actor,"audit.read");
    const query=(input.actorQuery??"").toLowerCase();
    const rows=tx`app.school_audit_projection(${input.from??null}::date,${input.to??null}::date,null,null,null)`;
    const actions=await tx`select distinct action,resource_kind as "resourceKind",change_category as "changeCategory" from ${rows}
      order by action`;
    const actors=await tx<{id:string;name:string|null;persona:Persona}[]>`
      with actors as (
        select distinct on(actor_id) actor_id,actor_display as name,actor_persona as persona
        from ${rows}
        order by actor_id,(actor_display is not null) desc,occurred_at desc
      )
      select actor_id as id,name,persona from actors
      where (${query}='' or strpos(lower(coalesce(name,'')),${query})>0 or actor_id::text=${query})
      order by name nulls last,actor_id limit 50`;
    const [info]=await tx<{timezone:string}[]>`select timezone from app.timetable_week_info(null)`;
    return auditFiltersSchema.parse({timezone:info?.timezone??"UTC",actions,
      actors:actors.map(({id,name,persona})=>({id,displayName:name??actorLabel[input.locale][persona]}))});
  });
}
