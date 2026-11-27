-- Scoped lookup by immutable named-payer account, not by names or organizational membership.
-- No guardian IDs or account IDs are returned to the client.
create function app.finance_same_payer_invoices(anchor uuid)
returns table(invoice_id uuid)
language sql stable security definer set search_path=pg_catalog
as $$
  select j.id
  from app.invoice a join app.invoice j on j.payer_account_id=a.payer_account_id and j.currency=a.currency
  where a.id=anchor and app.has_capability('finance.post')
    and app.finance_invoice_visible(a.id) and app.finance_invoice_visible(j.id)
$$;
revoke all on function app.finance_same_payer_invoices(uuid) from public,anon,authenticated,service_role,app_runtime;
grant execute on function app.finance_same_payer_invoices(uuid) to app_runtime;
