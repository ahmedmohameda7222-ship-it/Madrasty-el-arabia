import "server-only";
import {communicationPayloadSchema,eventSchema} from "@madrasty/contracts";
import {withDeliveryWorker} from "@/server/db/scoped";

export function projectSchoolNotifications(){
  return withDeliveryWorker(async(tx)=>{
    const events=await tx<{id:string;type:string;raw:unknown}[]>`
      select e.id,e.type,jsonb_build_object('id',e.id,'type',e.type,'occurredAt',to_char(e.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'actorId',e.actor_id,'aggregateId',e.aggregate_id,'payload',e.payload) as raw
      from app.pending_notification_events(16) e`;
    let projected=0;
    for(const row of events){
      const event=eventSchema.safeParse(row.raw);
      const valid=event.success&&communicationPayloadSchema(row.type)?.safeParse(event.data.payload).success===true;
      const [result]=await tx<{state:string}[]>`select app.consume_notification_event(${row.id},${valid}) as state`;
      if(result.state==="projected")projected++;
    }
    const [scheduled]=await tx<{chatWindows:number;invoiceReminders:number;absenceCorrections:number}[]>`
      select app.sweep_chat_episodes(12) as "chatWindows",app.materialize_due_invoice_reminders(18) as "invoiceReminders",
        app.materialize_absence_corrections(18) as "absenceCorrections"`;
    const [metrics]=await tx<{retryCount:number;invalidCount:number;oldestLagSeconds:number}[]>`
      select retry_count as "retryCount",invalid_count as "invalidCount",oldest_lag_seconds as "oldestLagSeconds"
      from app.notification_projection_metrics()`;
    return {projected,...scheduled,...metrics};
  });
}
