-- Cash is the school's default collection method; keep bank payments available.
alter table app.receipt_configuration alter column cash_enabled set default true;
update app.receipt_configuration set cash_enabled=true where singleton;
