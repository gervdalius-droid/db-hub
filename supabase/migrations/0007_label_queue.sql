-- apps_15: label printing queue for Nesting (a label PC with the local print server prints
-- jobs sent from any computer of the same workshop).
create table if not exists public.label_stations (
  workshop_id uuid not null default public.current_workshop() references public.workshops(id) on delete cascade,
  id text not null,
  printer text,
  last_seen timestamptz not null default now(),
  primary key (workshop_id, id)
);
create table if not exists public.label_print_jobs (
  id bigint generated always as identity primary key,
  workshop_id uuid not null default public.current_workshop() references public.workshops(id) on delete cascade,
  file_key text, file_name text, sheet text, cell_range text, part_name text, requested_by text,
  copies int not null default 1 check (copies between 1 and 50), printer text,
  status text not null default 'queued' check (status in ('queued', 'printing', 'printed', 'failed', 'cancelled')),
  error text, station text,
  created_at timestamptz not null default now(), claimed_at timestamptz, done_at timestamptz
);
create index if not exists label_jobs_queue on public.label_print_jobs (workshop_id, status, created_at);
alter table public.label_stations enable row level security;
alter table public.label_print_jobs enable row level security;
create policy label_stations_member on public.label_stations for all to authenticated
  using (workshop_id = (select public.current_workshop()) and public.workshop_can('nesting'))
  with check (workshop_id = (select public.current_workshop()) and public.workshop_can('nesting'));
create policy label_jobs_member on public.label_print_jobs for all to authenticated
  using (workshop_id = (select public.current_workshop()) and public.workshop_can('nesting'))
  with check (workshop_id = (select public.current_workshop()) and public.workshop_can('nesting'));
grant select, insert, update, delete on public.label_stations, public.label_print_jobs to authenticated;

create or replace function public.label_claim_job(p_station text)
 returns setof public.label_print_jobs language sql security definer set search_path to ''
as $$
  update public.label_print_jobs j set status = 'printing', station = p_station, claimed_at = now()
   where j.id = (select id from public.label_print_jobs
                  where workshop_id = public.current_workshop() and status = 'queued' and created_at > now() - interval '5 minutes'
                  order by created_at limit 1 for update skip locked)
     and public.workshop_can('nesting')
  returning j.*;
$$;
revoke all on function public.label_claim_job(text) from public, anon;
grant execute on function public.label_claim_job(text) to authenticated;
