-- 0011 per-app plans: a workshop buys single apps, bundles or the full suite.
--
-- Sellable apps (workshops.apps): studio, shopflow, nesting, offers, dxf, invoices, crm.
-- ShopFlow includes Project Overview, Shopfloor plan and Requests (they only work with it).
-- plan: 'trial' (all apps), 'suite' (all apps), 'apps' (the apps listed in workshops.apps).
-- The old tiers 'office', 'workshop', 'complete' still work for workshops that bought them.
--
-- Writing needs full access (paid, see 0009) AND the app in the plan. Reading stays open,
-- so data of an app that was dropped can still be opened and downloaded.

alter table public.workshops drop constraint if exists workshops_plan_check;
alter table public.workshops add constraint workshops_plan_check
  check (plan in ('trial', 'apps', 'suite', 'office', 'workshop', 'complete'));
alter table public.workshops drop constraint if exists workshops_billing_check;
alter table public.workshops add constraint workshops_billing_check
  check (billing in ('none', 'monthly', 'yearly', 'one_time', 'licence'));
alter table public.workshops add column if not exists apps text[];

update private.billing_settings
   set keep_months = keep_months || '{"apps": 24, "suite": 36}'::jsonb,
       terms_version = '2026-11-27b', updated_at = now();

create or replace function private.all_apps() returns text[]
language sql immutable set search_path = '' as $$
  select array['studio', 'shopflow', 'nesting', 'offers', 'dxf', 'invoices', 'crm'];
$$;

create or replace function private.workshop_apps(w public.workshops) returns text[]
language sql stable set search_path = '' as $$
  select case
    when w.plan in ('trial', 'suite', 'complete') then private.all_apps()
    when w.plan = 'office' then array['crm', 'offers', 'invoices']
    when w.plan = 'workshop' then array['crm', 'offers', 'invoices', 'shopflow', 'nesting', 'dxf']
    else coalesce(w.apps, '{}'::text[]) end;
$$;

-- which app owns a document area (workshop_docs.area)
create or replace function private.app_of_area(p_area text) returns text
language sql immutable set search_path = '' as $$
  select case p_area
    when 'builder' then 'studio'
    when 'shopflow' then 'shopflow' when 'apzvalga' then 'shopflow' when 'cechas' then 'shopflow'
    when 'cechas_mgr' then 'shopflow' when 'prasymai' then 'shopflow'
    when 'crm' then 'crm' when 'invoices' then 'invoices' when 'nesting' then 'nesting' when 'offers' then 'offers'
    else null end;   -- shared settings: any paid workshop
$$;

-- may the signed-in person's workshop change data of this app right now? (null app: any)
-- (public.workshop_can(area) from earlier is a different check: who in the workshop may open an area)
create or replace function public.workshop_app_ok(p_app text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.workshop_access(w) = 'full' and (p_app is null or p_app = any(private.workshop_apps(w)))
    from public.workshops w join public.workshop_members m on m.workshop_id = w.id
    where m.user_id = (select auth.uid()) and m.active), false);
$$;
create or replace function public.workshop_doc_ok(p_doc text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.workshop_app_ok((select private.app_of_area(d.area) from public.workshop_docs d where d.id = p_doc));
$$;
revoke all on function public.workshop_app_ok(text), public.workshop_doc_ok(text) from public, anon;
grant execute on function public.workshop_app_ok(text), public.workshop_doc_ok(text) to authenticated;

-- ---------------------------------------------------------------- table rules, per app
do $$
declare r record;
begin
  for r in select * from (values ('builder_projects', 'studio'), ('crm_items', 'crm'), ('fabflow_projects', 'nesting'),
                                 ('quote_projects', 'offers'), ('label_stations', 'nesting'), ('label_print_jobs', 'nesting')) v(t, app) loop
    execute format('drop policy if exists wx_paid_ins on public.%I', r.t);
    execute format('drop policy if exists wx_paid_upd on public.%I', r.t);
    execute format('drop policy if exists wx_paid_del on public.%I', r.t);
    execute format('create policy wx_paid_ins on public.%I as restrictive for insert to authenticated with check ((select public.workshop_app_ok(%L)))', r.t, r.app);
    execute format('create policy wx_paid_upd on public.%I as restrictive for update to authenticated using ((select public.workshop_app_ok(%L))) with check ((select public.workshop_app_ok(%L)))', r.t, r.app, r.app);
    execute format('create policy wx_paid_del on public.%I as restrictive for delete to authenticated using ((select public.workshop_app_ok(%L)))', r.t, r.app);
  end loop;
end $$;

drop policy if exists wx_paid_ins on public.workspaces;
drop policy if exists wx_paid_upd on public.workspaces;
drop policy if exists wx_paid_del on public.workspaces;
create policy wx_paid_ins on public.workspaces as restrictive for insert to authenticated with check (public.workshop_doc_ok(id));
create policy wx_paid_upd on public.workspaces as restrictive for update to authenticated using (public.workshop_doc_ok(id)) with check (public.workshop_doc_ok(id));
create policy wx_paid_del on public.workspaces as restrictive for delete to authenticated using (public.workshop_doc_ok(id));

drop policy if exists wx_paid_files_ins on storage.objects;
drop policy if exists wx_paid_files_upd on storage.objects;
drop policy if exists wx_paid_files_del on storage.objects;
create policy wx_paid_files_ins on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'shopflow' or (select public.workshop_app_ok('shopflow')));
create policy wx_paid_files_upd on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'shopflow' or (select public.workshop_app_ok('shopflow')))
  with check (bucket_id <> 'shopflow' or (select public.workshop_app_ok('shopflow')));
create policy wx_paid_files_del on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'shopflow' or (select public.workshop_app_ok('shopflow')));

-- Shopfloor plan tables are saved through functions that skip table rules: check in a trigger
create or replace function private.guard_app() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.workshop_app_ok(tg_argv[0]) then
    raise exception 'This app is read-only for your workshop: add it to your plan to make changes.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
do $$
declare t text;
begin
  foreach t in array array['cechas_days', 'cechas_fixes', 'cechas_sync'] loop
    execute format('drop trigger if exists wx_guard on public.%I', t);
    execute format('create trigger wx_guard before insert or update or delete on public.%I for each row execute function private.guard_app(%L)', t, 'shopflow');
  end loop;
end $$;

-- ---------------------------------------------------------------- workshop_me: plus the apps
drop function if exists public.workshop_me();
create function public.workshop_me()
returns table(display_name text, role text, areas text[], workshop_id uuid, workshop_name text, plan text,
              trial_ends_at timestamptz, access text, access_ends_at timestamptz, delete_after timestamptz,
              billing text, paid_until date, sub_status text, cancel_at timestamptz, keep_months int, has_stripe boolean,
              apps text[])
language sql stable security definer set search_path = 'public' as $$
  select m.display_name, m.role,
         array(select a.area from public.workshop_areas a where not a.managers_only or m.role in ('admin','manager') order by a.area),
         w.id, w.name, w.plan, w.trial_ends_at,
         private.workshop_access(w), private.workshop_access_ends(w), private.workshop_delete_after(w),
         w.billing, w.paid_until, w.sub_status, w.cancel_at, private.keep_months(w), w.stripe_customer_id is not null,
         private.workshop_apps(w)
  from public.workshop_members m join public.workshops w on w.id = m.workshop_id
  where m.user_id = auth.uid() and m.active and w.status = 'active';
$$;
revoke all on function public.workshop_me() from public, anon;
grant execute on function public.workshop_me() to authenticated;

-- ---------------------------------------------------------------- admin: set apps by hand, see them
create or replace function public.admin_save_workshop(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.workshops set
    name          = case when p ? 'name' then btrim(p->>'name') else name end,
    plan          = case when p ? 'plan' then p->>'plan' else plan end,
    apps          = case when p ? 'apps' then (select array_agg(x order by x) from jsonb_array_elements_text(p->'apps') x
                                                where x = any(private.all_apps())) else apps end,
    status        = case when p ? 'status' then p->>'status' else status end,
    suspended_at  = case when p ? 'status' then case when p->>'status' = 'suspended' then coalesce(suspended_at, now()) end else suspended_at end,
    trial_ends_at = case when p ? 'trial_ends_at' then (p->>'trial_ends_at')::timestamptz else trial_ends_at end,
    billing       = case when p ? 'billing' then p->>'billing' else billing end,
    price_eur     = case when p ? 'price_eur' then nullif(p->>'price_eur', '')::numeric else price_eur end,
    paid_until    = case when p ? 'paid_until' then nullif(p->>'paid_until', '')::date else paid_until end,
    contact_email = case when p ? 'contact_email' then nullif(lower(btrim(p->>'contact_email')), '') else contact_email end,
    contact_phone = case when p ? 'contact_phone' then nullif(btrim(p->>'contact_phone'), '') else contact_phone end,
    country       = case when p ? 'country' then nullif(btrim(p->>'country'), '') else country end,
    notes         = case when p ? 'notes' then nullif(btrim(p->>'notes'), '') else notes end
  where id = p_id;
  if not found then raise exception 'no such workshop' using errcode = 'P0002'; end if;
end $$;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.admin_overview()'::regprocedure);
  if position('''apps'', apps' in d) = 0 then
    d := replace(d, '''plan'', plan, ''billing'', billing,', '''plan'', plan, ''apps'', apps, ''billing'', billing,');
    execute d;
  end if;
end $$;
