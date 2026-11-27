-- Participation pause: one future calendar month, no current-month adjustment.
-- Monthly fees and independent additional charges are distinct.
create or replace function app.declare_enrollment_stop(pupil uuid,last_attended date,term text,explanation text)
returns table(id uuid,effects jsonb)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare target uuid;
declare entry app.enrollment_stop%rowtype;
begin
  perform app.lock_school_calendar();
  if last_attended is distinct from app.billing_school_month() or term is distinct from 'one_month' then
    raise exception 'Pause must cover the next school month only' using errcode='23514';
  end if;
  target:=app.create_enrollment_stop(pupil,last_attended,term,explanation);
  update app.enrollment_stop s set state='approved',revision=2,resolved_at=clock_timestamp(),
    resolved_by=app.actor_account()
    where s.id=target and s.state='pending' and s.requester_id=app.actor_account()
    returning s.* into entry;
  if not found then raise exception 'Pause declaration unavailable' using errcode='42501'; end if;
  perform app.apply_approved_stop_enrollment(entry);
  return query select target,app.apply_approved_stop_charges(entry);
end
$$;

create or replace function app.apply_approved_stop_charges(request app.enrollment_stop) returns jsonb
language plpgsql volatile set search_path=pg_catalog
as $$
declare j app.invoice%rowtype;
declare old_paid bigint;
declare review_id uuid;
declare result jsonb:='[]'::jsonb;
begin
  for j in select current.* from app.invoice current where current.student_id=request.student_id
      and current.kind='monthly' and current.period<@daterange(request.start_month,request.end_month,'[)') and current.cancelled_at is null
      and not exists(select 1 from app.stop_review z where z.invoice_id=current.id)
    order by current.id for update
  loop
    old_paid:=app.invoice_allocated_minor(j.id);
    if old_paid=0 then
      update app.invoice x set cancelled_at=clock_timestamp(),revision=x.revision+1 where x.id=j.id;
      result:=result||jsonb_build_array(jsonb_build_object('invoiceId',j.id,'effect','cancelled','reviewId',null));
    else
      insert into app.stop_review as r(stop_id,invoice_id,original_allocated_minor)
        values(request.id,j.id,old_paid) returning r.id into review_id;
      insert into app.stop_review_fund(review_id,allocation_id,receipt_id,amount_minor)
        select review_id,a.id,a.receipt_id,a.amount_minor from app.receipt_allocation a
        where a.invoice_id=j.id and not exists(select 1 from app.receipt_reversal x where x.allocation_id=a.id);
      update app.invoice x set revision=x.revision+1 where x.id=j.id;
      result:=result||jsonb_build_array(jsonb_build_object('invoiceId',j.id,'effect','review','reviewId',review_id));
    end if;
  end loop;
  return result;
end
$$;


create or replace function app.finance_reminder_held(target uuid) returns boolean
language sql stable set search_path=pg_catalog
as $$
  select exists(select 1 from app.invoice j join app.enrollment_stop s on s.student_id=j.student_id
    and j.period<@daterange(s.start_month,s.end_month,'[)')
    left join app.stop_review r on r.invoice_id=j.id
    where j.id=target and ((j.kind='monthly' and s.state in ('pending','approved')) or (j.kind='manual' and s.state='approved' and r.state in ('open','waived'))))
$$;


-- Reconcile only legacy OPEN reviews for genuinely unpaid monthly charges
-- in an approved pause period, without changing any receipt or allocation.
-- Keep historic/paid cases and all financial evidence intact.
do $$
begin
  perform app.lock_school_calendar();
  with eligible as (
    select r.id as review_id,j.id as invoice_id
      from app.stop_review r
      join app.invoice j on j.id=r.invoice_id
      join app.enrollment_stop s on s.id=r.stop_id and s.student_id=j.student_id
      where r.state='open' and s.state='approved'
        and j.kind='monthly' and j.cancelled_at is null
        and j.period>=app.billing_school_month()
        and j.period<@daterange(s.start_month,s.end_month,'[)')
        and r.original_allocated_minor=0 and app.invoice_allocated_minor(j.id)=0
        and not exists(select 1 from app.stop_review_fund f where f.review_id=r.id)
        and not exists(select 1 from app.stop_cash_refund f where f.review_id=r.id)
        and not exists(select 1 from app.stop_disposition f where f.review_id=r.id)
        and not exists(select 1 from app.stop_charge_adjustment f where f.review_id=r.id)
      for update of r,j
  ), cancelled as (
    update app.invoice j set cancelled_at=clock_timestamp(),revision=j.revision+1
      from eligible e where j.id=e.invoice_id returning e.review_id
  )
  update app.stop_review r set state='waived',reason='Automatic correction: unpaid monthly fee during participation pause',
    resolved_at=clock_timestamp(),resolved_by=null,revision=r.revision+1
    from cancelled c where r.id=c.review_id;
end
$$;
