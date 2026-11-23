import "server-only";
import { assignmentActions, directStaffAccountSchema, type directStaffAccountInput } from "@madrasty/contracts";
import { type z } from "zod";
import { ApiError } from "@/server/http";
import { withActor, type ActorContext } from "@/server/db/scoped";
import { appendAudit } from "@/server/db/outbox";
import { authProvider } from "./provider";

/** Verify authorization BEFORE any external Auth operation; repeat inside DB transaction. */
export async function provisionStaffAccount(ctx: ActorContext, input: z.infer<typeof directStaffAccountInput>) {
  const [preflight] = await withActor(ctx, tx => tx<{ allowed: boolean }[]>`
    select app.can_provision_staff_account(${input.role}) as allowed
  `);
  if (!preflight?.allowed) throw new ApiError("forbidden");
  if (input.assignment) {
    const [editor] = await withActor(ctx, tx => tx<{allowed:boolean}[]>`
      select app.staff_editor() as allowed
    `);
    if (!editor?.allowed) throw new ApiError("forbidden");
  }

  const provider = authProvider(true);
  const { data, error } = await provider.admin.createUser({
    email: input.email, password: input.password, email_confirm: true,
  });
  if (error) throw new ApiError(error.status === 429 ? "throttled" : (error.status ?? 0) >= 500 ? "unavailable" : "conflict");
  const providerId = data.user?.id;
  if (!providerId) throw new ApiError("unavailable");

  try {
    const [record] = await withActor(ctx, async tx => {
      const rows = await tx<{ account_id: string; staff_id: string }[]>`
        select * from app.provision_staff_account(
          ${providerId}::uuid,${input.displayName},${input.email},${input.workPhone ?? null},
          ${input.role},${input.correspondenceLocale},${tx.array(input.capabilities)}::text[]
        )
      `;
      if (!rows[0]) throw new ApiError("unavailable");
      // Account, staff profile and any selected class/subject use one PostgreSQL
      // transaction. If a class placement fails, no partial school account remains.
      if (input.assignment) {
        const assignment = input.assignment;
        const [perm] = await tx<{allowed:boolean}[]>`select app.staff_editor() as allowed`;
        if (!perm?.allowed) throw new ApiError("forbidden");
        const [classroom] = await tx<{startsOn:string;endsExclusive:string;state:string}[]>`
          select y.starts_on::text as "startsOn",y.ends_exclusive::text as "endsExclusive",y.state
          from app.school_class c join app.school_year y on y.id=c.year_id
          where c.id=${assignment.classId}
        `;
        const [clock] = await tx<{today:string}[]>`select app.school_today()::text as today`;
        if (!classroom || !clock?.today || classroom.state==="closed") throw new ApiError("validation");
        const from=clock.today>classroom.startsOn?clock.today:classroom.startsOn;
        if (from>=classroom.endsExclusive) throw new ApiError("validation");
        const addAssignment=async (kind:"primary"|"subject", subjectId:string|null) => {
          let offeringId:string|null=null;
          if(subjectId){
            const [offer] = await tx<{id:string}[]>`
              insert into app.class_subject(class_id,subject_id)
              values (${assignment.classId},${subjectId}::uuid)
              on conflict(class_id,subject_id) do update set subject_id=excluded.subject_id
              returning id
            `;
            offeringId=offer.id;
          }
          const permissions=kind==="primary"
            ? [...assignmentActions]
            : assignmentActions.filter(cap=>cap!=="attendance.mark" && cap!=="attendance.approve");
          const [row]=await tx<{id:string}[]>`
            insert into app.teaching_assignment
              (class_id,offering_id,staff_id,kind,effective_from,effective_until,capabilities)
            values(${assignment.classId},${offeringId}::uuid,${rows[0].staff_id}::uuid,${kind},
              ${from}::date,${classroom.endsExclusive}::date,${tx.array(permissions)}::text[])
            returning id
          `;
          await appendAudit(tx,{action:"school.assignment_created",aggregateId:row.id});
        };
        if(assignment.kind==="primary"){
          await addAssignment("primary",null);
          if(assignment.subjectId) await addAssignment("subject",assignment.subjectId);
        }else{
          await addAssignment("subject",assignment.subjectId ?? null);
        }
      }
      await appendAudit(tx, { action:"school.staff_created", aggregateId:rows[0].staff_id });
      return rows;
    });
    return directStaffAccountSchema.parse({
      accountId: record.account_id, staffId: record.staff_id, role: input.role,
    });
  } catch (cause) {
    // Auth Admin and PostgreSQL are separate transactional systems. Roll back
    // only the provider identity created by this request when DB save fails.
    await provider.admin.deleteUser(providerId).catch(() => undefined);
    throw cause;
  }
}
