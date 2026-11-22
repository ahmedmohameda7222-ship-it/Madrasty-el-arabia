-- Day-exception resets are available only to the scoped application role.
-- Authorization remains enforced by the school.manage policy on app.day_exception
-- and by requireCapability() in the DELETE command handler.
-- Do not grant DELETE to anon, authenticated, or service_role.
grant delete on app.day_exception to app_runtime;
