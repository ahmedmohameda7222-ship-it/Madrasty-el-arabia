-- Enforce the payer scope in the ledger, not just in the picker.
create or replace function app.allocate_finance_receipt(target uuid,expected integer,lines jsonb)
returns table(receipt_id uuid,receipt_number text,remainder_minor bigint,revision integer,posting jsonb)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare r app.finance_receipt%rowtype;
declare m record;
declare entry record;
declare posting_id uuid;
declare targets uuid[];
declare total_amount numeric;
begin
  if not app.has_capability('finance.post') then raise exception 'Receipt posting unavailable' using errcode='42501'; end if;
  perform app.lock_school_calendar();
  select stored.* into r from app.finance_receipt stored where stored.id=target for update;
  if not found then raise exception 'Receipt unavailable' using errcode='42501'; end if;
  select * into m from app.receipt_money(target,'infinity'::timestamptz);
  if m.revision<>expected then return; end if;
  select array_agg(distinct i."invoiceId"),sum(i."amountMinor") into targets,total_amount
    from jsonb_to_recordset(lines) i("invoiceId" uuid,"amountMinor" bigint,"invoiceRevision" integer);
  if m.voided or coalesce(cardinality(targets),0) not between 1 and 100 or cardinality(targets)<>jsonb_array_length(lines)
    or total_amount>m.remainder_minor-app.finance_refunded_minor(target,'infinity'::timestamptz) then raise exception 'Invalid receipt allocation' using errcode='23514'; end if;

  perform app.lock_receipt_invoices(targets);
  for entry in
    select i.*,j.id,j.revision,j.cancelled_at,j.currency,
      app.invoice_collectible_minor(j.id,'infinity'::timestamptz)-app.invoice_allocated_minor(j.id) as balance
    from jsonb_to_recordset(lines) i("invoiceId" uuid,"amountMinor" bigint,"invoiceRevision" integer)
    left join app.invoice j on j.id=i."invoiceId" order by i."invoiceId"
  loop
    if entry.id is null then raise exception 'Invoice unavailable' using errcode='42501'; end if;
    if entry.revision<>entry."invoiceRevision" then return; end if;
    if entry.cancelled_at is not null or entry.currency<>r.currency or not app.invoice_accepts_allocations(entry.id) or
      entry."amountMinor" not between 1 and entry.balance or entry."amountMinor" is null then
      raise exception 'Invoice balance or currency unavailable' using errcode='23514';
    end if;
  end loop;

  -- Bind the entire receipt history to a single immutable payer account.
  -- Reversed allocations still establish the payer of the original receipt.
  if (select count(distinct j.payer_account_id) from app.invoice j
      where j.id=any(targets) or j.id=r.suggested_invoice_id
        or exists(select 1 from app.receipt_allocation a where a.receipt_id=target and a.invoice_id=j.id)) > 1 then
    raise exception 'Receipt invoices must belong to the same payer' using errcode='23514';
  end if;

  insert into app.receipt_posting as p(receipt_id,kind,revision,actor_id,posted_at)
  values(target,'allocate',expected+1,app.actor_account(),clock_timestamp()) returning p.id into posting_id;
  for entry in select i.* from jsonb_to_recordset(lines) i("invoiceId" uuid,"amountMinor" bigint) order by i."invoiceId" loop
    perform app.receipt_add_allocation(target,posting_id,entry."invoiceId",entry."amountMinor");
  end loop;
  return query select r.id,r.receipt_number,current_money.remainder_minor-app.finance_refunded_minor(target,'infinity'::timestamptz),current_money.revision,app.receipt_posting_event(posting_id)
    from app.receipt_money(r.id,'infinity'::timestamptz) current_money;
end
$$;
