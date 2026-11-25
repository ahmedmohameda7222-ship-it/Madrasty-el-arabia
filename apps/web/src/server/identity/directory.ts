import "server-only";
import { directoryEntrySchema, directoryTargetSchema, type DirectoryTarget, type directoryQuerySchema } from "@madrasty/contracts";
import type { z } from "zod";
import { withActor, type ActorContext, type Transaction } from "@/server/db/scoped";
import { ApiError } from "@/server/http";

const fields = (tx: Transaction) => tx`id, display_name as "displayName", role, title_ar as "titleAr", title_de as "titleDe",
  work_email as "workEmail", work_phone as "workPhone", contexts,
  jsonb_build_object('kind', case when account_id is null then 'office' else 'person' end, 'id',id) as target`;

export function listDirectory(actor: ActorContext, input: z.infer<typeof directoryQuerySchema>) {
  return withActor(actor, async (tx) => {
    const query = input.query?.toLowerCase() ?? "";
    const rows = directoryEntrySchema.array().parse(input.view ? await tx`
      with contacts as (
        select d.*, case when d.role='teacher' then 0 when d.role='guardian' then 2 else 1 end as sort_group,
          lower(coalesce(d.display_name,d.title_de)) collate "C" as sort_name
        from app.directory_contacts() d
        where d.account_id is not null
          and (${input.role ?? null}::text is null or d.role=${input.role ?? null})
          and (${query}='' or strpos(lower(concat_ws(' ',d.display_name,d.title_ar,d.title_de)),${query})>0)
          and (${input.view}='all' or d.target_persona='admin'
            or (${actor.persona}='guardian' and d.target_persona='teacher' and jsonb_array_length(d.contexts)>0)
            or (${actor.persona}='teacher' and d.target_persona='guardian' and jsonb_array_length(d.contexts)>0)
            or (${actor.persona}='admin' and d.target_persona='teacher'))
      )
      select ${fields(tx)} from contacts
      where (${input.cursor ?? null}::text is null or (sort_group,sort_name,id collate "C") >
        (select sort_group,sort_name,id collate "C" from contacts where id=${input.cursor ?? null}))
      order by sort_group,sort_name,id collate "C" limit ${input.limit + 1}` : await tx`
      select ${fields(tx)} from app.directory_contacts()
      where (${input.cursor ?? null}::text is null or id collate "C" > (${input.cursor ?? null}::text collate "C"))
        and (${input.role ?? null}::text is null or role = ${input.role ?? null})
        and (${query} = '' or strpos(lower(concat_ws(' ',display_name,title_ar,title_de)),${query}) > 0)
      order by id collate "C" limit ${input.limit + 1}`);
    return { rows: rows.slice(0,input.limit), nextCursor: rows.length > input.limit ? rows[input.limit - 1]?.id : undefined };
  });
}

export function readDirectoryEntry(actor: ActorContext, id: string) {
  return withActor(actor, async (tx) => {
    const [row] = await tx`select ${fields(tx)}, app.direct_thread_for_contact(id) as "directThreadId" from app.directory_contacts() where id = ${id}`;
    if (!row) throw new ApiError("not_found");
    return directoryEntrySchema.parse(row);
  });
}

export async function resolveDirectoryTarget(tx: Transaction, descriptor: DirectoryTarget) {
  const target = directoryTargetSchema.parse(descriptor);
  const [result] = await tx<{ accountId: string | null; persona: "guardian" | "teacher" | "admin" | null }[]>`
    select account_id as "accountId", target_persona as persona from app.directory_contacts()
    where id = ${target.id} and (account_id is null) = ${target.kind === "office"}
  `;
  if (!result) throw new ApiError("not_found");
  return result;
}
