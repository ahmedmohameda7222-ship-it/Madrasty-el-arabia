-- Run only after automated issuance acceptance tests and production migration.
-- Job performs no work until a finance administrator explicitly enables it.
select cron.schedule('madrasty-monthly-billing','15 * * * *','select app.run_monthly_billing()');
