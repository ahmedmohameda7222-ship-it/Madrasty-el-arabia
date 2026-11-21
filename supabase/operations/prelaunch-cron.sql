-- Apply only to the linked Madrasty school pre-launch project.
-- Both jobs are inactive on creation. Bind the Vercel worker bearer in Vault
-- as madrasty_prelaunch_worker before activating either job.
begin;

create extension if not exists pg_cron;
create extension if not exists http with schema extensions;

select cron.schedule_in_database(
  job_name := job.name,
  schedule := job.schedule,
  database := current_database(),
  active := false,
  command := format($job$
    do $worker$
    declare
      bearer text;
      response_status integer;
    begin
      select decrypted_secret into strict bearer
      from vault.decrypted_secrets
      where name = 'madrasty_prelaunch_worker';

      if nullif(bearer, '') is null then
        raise exception 'School worker bearer is missing';
      end if;

      perform set_config('http.curlopt_timeout_ms', '95000', true);
      perform set_config('http.curlopt_connecttimeout_ms', '10000', true);

      begin
        select status into strict response_status
        from extensions.http((
          'POST', %L,
          array[extensions.http_header('Authorization', 'Bearer ' || bearer)],
          'application/json', '{}'
        )::extensions.http_request);
      exception
        when others then raise exception 'School worker request failed';
      end;

      if response_status < 200 or response_status >= 300 then
        raise exception 'School worker responded with HTTP %%', response_status;
      end if;
    end
    $worker$;
  $job$, 'https://madrastyelarabia.vercel.app/api/v1/internal/' || job.path)
)
from (values
  ('madrasty-prelaunch-dispatch', '*/2 * * * *', 'dispatch'),
  ('madrasty-prelaunch-media-cleanup', '15 * * * *', 'chat-media/cleanup')
) as job(name, schedule, path);

commit;

select jobid, jobname, schedule, active
from cron.job
where jobname in ('madrasty-prelaunch-dispatch', 'madrasty-prelaunch-media-cleanup')
order by jobname;
