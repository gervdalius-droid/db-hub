-- 0010 nightly retention job (03:15 UTC = 05:15 in Vilnius).
-- private.retention_run() deletes only when billing_settings.enforce is on; otherwise it logs a report.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'worxmax-retention';
select cron.schedule('worxmax-retention', '15 3 * * *', $$select private.retention_run()$$);
