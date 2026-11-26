-- 0009 billing: Stripe subscriptions, access by payment, data retention, export.
--
-- Access (private.workshop_access):
--   full  trial running, paid (paid_until + grace), or set free by the worxmax admin
--   read  trial ended / unpaid / cancelled: people can open, look and download, not change
--   none  suspended by the worxmax admin, or the data has been deleted
-- Retention (private.retention_run, nightly): old finished work is removed per plan, and
-- workshops that stay read-only past the keep window are wiped. Nothing is deleted until
-- private.billing_settings.enforce is switched on in the admin page; until then the job
-- only records what it would remove.

-- ---------------------------------------------------------------- workshops: billing fields
alter table public.workshops
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text,
  add column if not exists sub_status text,            -- Stripe: active, trialing, past_due, canceled, unpaid…
  add column if not exists sub_price text,              -- lookup key of the plan price, e.g. wx_workshop_yearly
  add column if not exists cancel_at timestamptz,       -- set when the customer cancelled at period end
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists data_deleted_at timestamptz;

-- ---------------------------------------------------------------- settings (one row)
create table if not exists private.billing_settings (
  id boolean primary key default true check (id),
  grace_days int not null default 7,                  -- after a missed payment, before read-only
  trial_keep_days int not null default 30,            -- read-only after a trial ends, then deleted
  closed_keep_days int not null default 60,           -- read-only after cancel/unpaid, then deleted
  keep_months jsonb not null default '{"office":12,"workshop":24,"complete":36,"trial":36}',
  parts_months int not null default 6,                -- ShopFlow: parts lists of finished orders
  warn_days int not null default 30,                  -- show upcoming removals this far ahead
  enforce boolean not null default false,             -- false: only report, delete nothing
  terms_version text not null default '2026-11-26b',
  updated_at timestamptz not null default now()
);
insert into private.billing_settings (id) values (true) on conflict do nothing;
revoke all on private.billing_settings from public, anon, authenticated;

create table if not exists private.retention_log (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  applied boolean not null,
  workshop_id uuid,
  kind text not null,
  detail jsonb
);
revoke all on private.retention_log from public, anon, authenticated;

-- Stripe webhook events: idempotency and a trail for support questions
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  workshop_id uuid,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  payload jsonb
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- ---------------------------------------------------------------- access and dates
create or replace function private.bset() returns private.billing_settings
language sql stable security definer set search_path = '' as $$
  select s from private.billing_settings s where s.id;
$$;

-- when full access ends (or ended); null = no end (free / manual)
create or replace function private.workshop_access_ends(w public.workshops)
returns timestamptz language sql stable set search_path = '' as $$
  select case
    when w.plan = 'trial' then w.trial_ends_at
    when w.billing = 'none' then null
    when w.paid_until is null then w.created_at
    else (w.paid_until + make_interval(days => (private.bset()).grace_days + 1))::timestamptz
  end;
$$;

create or replace function private.workshop_access(w public.workshops)
returns text language sql stable set search_path = '' as $$
  select case
    when w.data_deleted_at is not null or w.status in ('suspended', 'closed') then 'none'
    when private.workshop_access_ends(w) is null then 'full'
    when private.workshop_access_ends(w) > now() then 'full'
    else 'read' end;
$$;

-- when a read-only workshop's data is deleted
create or replace function private.workshop_delete_after(w public.workshops)
returns timestamptz language sql stable set search_path = '' as $$
  select case when private.workshop_access(w) <> 'read' then null
    else private.workshop_access_ends(w) + make_interval(days =>
      case when w.plan = 'trial' then (private.bset()).trial_keep_days else (private.bset()).closed_keep_days end)
  end;
$$;

create or replace function private.keep_months(w public.workshops)
returns int language sql stable set search_path = '' as $$
  select coalesce(((private.bset()).keep_months ->> w.plan)::int, 24);
$$;

-- may the signed-in person's workshop change data right now?
create or replace function public.workshop_writable()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.workshop_access(w) = 'full'
    from public.workshops w join public.workshop_members m on m.workshop_id = w.id
    where m.user_id = (select auth.uid()) and m.active), false);
$$;
grant execute on function public.workshop_writable() to authenticated;

create or replace function private.require_writable()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.workshop_writable() then
    raise exception 'This workshop is read-only: choose a plan to make changes again.' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------- read-only when not paid
-- Restrictive policies are ANDed with the existing ones: reading stays as it is,
-- adding / changing / removing needs full access.
do $$
declare t text;
begin
  foreach t in array array['builder_projects','crm_items','fabflow_projects','quote_projects','workspaces',
                           'label_stations','label_print_jobs'] loop
    execute format('drop policy if exists wx_paid_ins on public.%I', t);
    execute format('drop policy if exists wx_paid_upd on public.%I', t);
    execute format('drop policy if exists wx_paid_del on public.%I', t);
    execute format('create policy wx_paid_ins on public.%I as restrictive for insert to authenticated with check ((select public.workshop_writable()))', t);
    execute format('create policy wx_paid_upd on public.%I as restrictive for update to authenticated using ((select public.workshop_writable())) with check ((select public.workshop_writable()))', t);
    execute format('create policy wx_paid_del on public.%I as restrictive for delete to authenticated using ((select public.workshop_writable()))', t);
  end loop;
end $$;

drop policy if exists wx_paid_files_ins on storage.objects;
drop policy if exists wx_paid_files_upd on storage.objects;
drop policy if exists wx_paid_files_del on storage.objects;
create policy wx_paid_files_ins on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'shopflow' or (select public.workshop_writable()));
create policy wx_paid_files_upd on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'shopflow' or (select public.workshop_writable()))
  with check (bucket_id <> 'shopflow' or (select public.workshop_writable()));
create policy wx_paid_files_del on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'shopflow' or (select public.workshop_writable()));

-- ---------------------------------------------------------------- workshop_me: plus access and billing
drop function if exists public.workshop_me();
create function public.workshop_me()
returns table(display_name text, role text, areas text[], workshop_id uuid, workshop_name text, plan text,
              trial_ends_at timestamptz, access text, access_ends_at timestamptz, delete_after timestamptz,
              billing text, paid_until date, sub_status text, cancel_at timestamptz, keep_months int, has_stripe boolean)
language sql stable security definer set search_path = 'public' as $$
  select m.display_name, m.role,
         array(select a.area from public.workshop_areas a where not a.managers_only or m.role in ('admin','manager') order by a.area),
         w.id, w.name, w.plan, w.trial_ends_at,
         private.workshop_access(w), private.workshop_access_ends(w), private.workshop_delete_after(w),
         w.billing, w.paid_until, w.sub_status, w.cancel_at, private.keep_months(w), w.stripe_customer_id is not null
  from public.workshop_members m join public.workshops w on w.id = m.workshop_id
  where m.user_id = auth.uid() and m.active and w.status = 'active';
$$;
revoke all on function public.workshop_me() from public, anon;
grant execute on function public.workshop_me() to authenticated;

-- ---------------------------------------------------------------- the save functions that skip table rules
create or replace function private.guard_writable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- the service role (Stripe webhook, nightly job) and the database owner are not people
  if (select auth.uid()) is not null then perform private.require_writable(); end if;
  return coalesce(new, old);
end $$;
do $$
declare t text;
begin
  foreach t in array array['cechas_days','cechas_fixes','cechas_sync'] loop
    execute format('drop trigger if exists wx_guard on public.%I', t);
    execute format('create trigger wx_guard before insert or update or delete on public.%I for each row execute function private.guard_writable()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- ShopFlow: trim finished orders
-- remove finished orders older than p_remove; drop the parts lists of those older than p_parts
create or replace function private.shopflow_trim(p_data jsonb, p_remove timestamptz, p_parts timestamptz)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_data -> 'orders') <> 'array' then p_data else
    jsonb_set(p_data, '{orders}', coalesce((
      select jsonb_agg(case
          when fin is not null and fin < p_parts and o ? 'parts' then o - 'parts' || jsonb_build_object('partsRemovedAt', (extract(epoch from now()) * 1000)::bigint)
          else o end order by ord)
      from (select o, ord,
              case when coalesce((o ->> 'archived')::boolean, (o ->> 'shipped')::boolean, false)
                   then to_timestamp(coalesce(nullif(o ->> 'archivedAt', '')::numeric, nullif(o ->> 'shippedAt', '')::numeric, 0) / 1000)
              end as fin
            from jsonb_array_elements(p_data -> 'orders') with ordinality as x(o, ord)) s
      where fin is null or fin >= p_remove), '[]'::jsonb))
  end;
$$;

-- ---------------------------------------------------------------- what will be removed (owners see it)
create or replace function private.retention_items(w public.workshops, p_horizon interval)
returns table(app text, item text, last_change timestamptz, removes_on date)
language sql stable set search_path = '' as $$
  with k as (select make_interval(months => private.keep_months(w)) as keep,
                    make_interval(months => (private.bset()).parts_months) as parts)
  select 'Cabinet Studio', b.name, b.updated_at, (b.updated_at + k.keep)::date
    from public.builder_projects b, k where b.workshop_id = w.id and b.updated_at + k.keep < now() + p_horizon
  union all
  select 'Offers', q.name, q.updated_at, (q.updated_at + k.keep)::date
    from public.quote_projects q, k where q.workshop_id = w.id and q.updated_at + k.keep < now() + p_horizon
  union all
  select 'Nesting', f.name, f.updated_at, (f.updated_at + k.keep)::date
    from public.fabflow_projects f, k where f.workshop_id = w.id and f.updated_at + k.keep < now() + p_horizon
  union all
  select 'CRM', coalesce(c.data ->> 'title', c.data ->> 'name', c.id), c.updated_at, (c.updated_at + k.keep)::date
    from public.crm_items c, k where c.workshop_id = w.id and c.kind = 'deal'
     and coalesce(c.data ->> 'stage', c.data ->> 'status', '') in ('won', 'lost')
     and c.updated_at + k.keep < now() + p_horizon
  union all
  select 'ShopFlow', coalesce(o ->> 'product', o ->> 'client', 'Order'), fin,
         (fin + case when fin + k.keep < now() + p_horizon then k.keep else k.parts end)::date
    from public.workspaces s, k,
         lateral jsonb_array_elements(case when jsonb_typeof(s.data -> 'orders') = 'array' then s.data -> 'orders' else '[]' end) o,
         lateral (select to_timestamp(coalesce(nullif(o ->> 'archivedAt', '')::numeric, nullif(o ->> 'shippedAt', '')::numeric, 0) / 1000) as fin) f
   where s.workshop_id = w.id and s.id = 'dedes-baldai'
     and coalesce((o ->> 'archived')::boolean, (o ->> 'shipped')::boolean, false)
     and (fin + k.keep < now() + p_horizon or (o ? 'parts' and fin + k.parts < now() + p_horizon));
$$;

create or replace function public.retention_preview()
returns table(app text, item text, last_change timestamptz, removes_on date)
language plpgsql stable security definer set search_path = '' as $$
declare w public.workshops;
begin
  select ws.* into w from public.workshops ws join public.workshop_members m on m.workshop_id = ws.id
   where m.user_id = (select auth.uid()) and m.active and m.role in ('admin', 'manager');
  if w.id is null then return; end if;
  return query select * from private.retention_items(w, make_interval(days => (private.bset()).warn_days)) r order by r.removes_on, r.app;
end $$;
revoke all on function public.retention_preview() from public, anon;
grant execute on function public.retention_preview() to authenticated;

-- ---------------------------------------------------------------- the nightly job
create or replace function private.wipe_workshop(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n jsonb := '{}'; c int;
begin
  delete from public.builder_projects where workshop_id = p_id; get diagnostics c = row_count; n := n || jsonb_build_object('builder', c);
  delete from public.quote_projects where workshop_id = p_id;   get diagnostics c = row_count; n := n || jsonb_build_object('offers', c);
  delete from public.fabflow_projects where workshop_id = p_id; get diagnostics c = row_count; n := n || jsonb_build_object('nesting', c);
  delete from public.crm_items where workshop_id = p_id;        get diagnostics c = row_count; n := n || jsonb_build_object('crm', c);
  delete from public.workspaces where workshop_id = p_id;       get diagnostics c = row_count; n := n || jsonb_build_object('documents', c);
  delete from public.cechas_days where workshop_id = p_id;
  delete from public.cechas_fixes where workshop_id = p_id;
  delete from public.cechas_sync where workshop_id = p_id;
  delete from public.project_locks where workshop_id = p_id;
  delete from public.label_print_jobs where workshop_id = p_id;
  delete from public.label_stations where workshop_id = p_id;
  delete from public.prasymai_inbox where workshop_id = p_id;
  delete from public.notice_reads where workshop_id = p_id;
  delete from public.notices where workshop_id = p_id;
  delete from public.push_subs where workshop_id = p_id;
  delete from storage.objects where bucket_id = 'shopflow' and (storage.foldername(name))[1] = p_id::text;
  get diagnostics c = row_count; n := n || jsonb_build_object('files', c);
  delete from public.workshop_invites where workshop_id = p_id;
  delete from public.workshop_members where workshop_id = p_id;
  update public.workshops set data_deleted_at = now(), status = 'closed' where id = p_id;
  return n;
end $$;

create or replace function private.retention_run(p_apply boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s private.billing_settings := private.bset();
  apply boolean := coalesce(p_apply, s.enforce);
  w public.workshops; keep interval; parts interval; c int; tot jsonb := '{}';
  wiped int := 0; items int := 0;
begin
  for w in select * from public.workshops where status = 'active' and data_deleted_at is null loop
    -- a workshop read-only past its keep window: everything goes
    if private.workshop_access(w) = 'read' and private.workshop_delete_after(w) < now() then
      if apply then
        insert into private.retention_log (applied, workshop_id, kind, detail) values (true, w.id, 'wipe', private.wipe_workshop(w.id));
      else
        insert into private.retention_log (applied, workshop_id, kind, detail) values (false, w.id, 'wipe', jsonb_build_object('would_delete_after', private.workshop_delete_after(w)));
      end if;
      wiped := wiped + 1;
      continue;
    end if;
    if private.workshop_access(w) <> 'full' then continue; end if;
    -- a working workshop: old finished things only
    select count(*) into c from private.retention_items(w, interval '0');
    if c = 0 then continue; end if;
    items := items + c;
    insert into private.retention_log (applied, workshop_id, kind, detail)
      select apply, w.id, 'items', jsonb_agg(jsonb_build_object('app', r.app, 'item', r.item, 'last_change', r.last_change))
      from private.retention_items(w, interval '0') r;
    if apply then
      keep := make_interval(months => private.keep_months(w)); parts := make_interval(months => s.parts_months);
      delete from public.workspaces where workshop_id = w.id and id like 'builder-ver-%'
        and substr(id, 13) in (select id from public.builder_projects where workshop_id = w.id and updated_at + keep < now());
      delete from public.builder_projects where workshop_id = w.id and updated_at + keep < now();
      delete from public.quote_projects where workshop_id = w.id and updated_at + keep < now();
      delete from public.fabflow_projects where workshop_id = w.id and updated_at + keep < now();
      delete from public.crm_items where workshop_id = w.id and kind = 'deal'
        and coalesce(data ->> 'stage', data ->> 'status', '') in ('won', 'lost') and updated_at + keep < now();
      update public.workspaces set data = private.shopflow_trim(data, now() - keep, now() - parts), updated_by = 'worxmax retention'
        where workshop_id = w.id and id = 'dedes-baldai' and data ? 'orders';
      delete from public.workspaces where workshop_id = w.id and id like 'dedes-cechas-log-%'
        and to_date(substr(id, 18, 7), 'YYYY-MM') + keep < now();
    end if;
  end loop;
  -- housekeeping that loses nothing anyone needs
  delete from public.label_print_jobs where created_at < now() - interval '30 days';
  delete from public.project_locks where beat_at < now() - interval '2 days';
  delete from private.retention_log where ran_at < now() - interval '400 days';
  return jsonb_build_object('applied', apply, 'workshops_due', wiped, 'items_due', items);
end $$;

-- ---------------------------------------------------------------- download everything
create or replace function public.workshop_export()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w public.workshops;
begin
  select ws.* into w from public.workshops ws join public.workshop_members m on m.workshop_id = ws.id
   where m.user_id = (select auth.uid()) and m.active and m.role = 'admin';
  if w.id is null then raise exception 'Only the workshop owner can download everything.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'format', 'worxmax-export-1', 'exported_at', now(), 'workshop', jsonb_build_object('id', w.id, 'name', w.name, 'plan', w.plan),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('name', display_name, 'role', role, 'active', active)), '[]') from public.workshop_members where workshop_id = w.id),
    'cabinet_studio', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'updated_at', updated_at, 'data', data)), '[]') from public.builder_projects where workshop_id = w.id),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'updated_at', updated_at, 'data', data)), '[]') from public.quote_projects where workshop_id = w.id),
    'nesting', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'updated_at', updated_at, 'data', data)), '[]') from public.fabflow_projects where workshop_id = w.id),
    'crm', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'updated_at', updated_at, 'data', data)), '[]') from public.crm_items where workshop_id = w.id and not deleted),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at, 'data', data)), '[]') from public.workspaces where workshop_id = w.id and id not like 'builder-ver-%'),
    'files', (select coalesce(jsonb_agg(jsonb_build_object('path', name, 'size', metadata ->> 'size', 'updated_at', updated_at)), '[]') from storage.objects where bucket_id = 'shopflow' and (storage.foldername(name))[1] = w.id::text)
  );
end $$;
revoke all on function public.workshop_export() from public, anon;
grant execute on function public.workshop_export() to authenticated;

-- ---------------------------------------------------------------- accept the terms before paying
create or replace function public.accept_terms(p_version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.workshops w set terms_accepted_at = now(), terms_version = left(p_version, 40)
   from public.workshop_members m
   where m.workshop_id = w.id and m.user_id = (select auth.uid()) and m.active and m.role = 'admin';
  if not found then raise exception 'Only the workshop owner can do this.' using errcode = '42501'; end if;
end $$;
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- ---------------------------------------------------------------- Stripe secrets in the vault (admin pastes them)
create or replace function public.admin_billing_secret_set(p_name text, p_value text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sid uuid; nm text;
begin
  perform private.require_admin();
  if p_name not in ('stripe_secret_key', 'stripe_webhook_secret') then raise exception 'unknown setting'; end if;
  nm := 'worxmax_' || p_name;
  select id into sid from vault.secrets where name = nm;
  if coalesce(btrim(p_value), '') = '' then
    if sid is not null then delete from vault.secrets where id = sid; end if;
  elsif sid is null then perform vault.create_secret(btrim(p_value), nm, 'worxmax billing');
  else perform vault.update_secret(sid, btrim(p_value), nm, 'worxmax billing'); end if;
  return public.admin_billing_status();
end $$;

create or replace function public.admin_billing_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare k text; h text; s private.billing_settings := private.bset();
begin
  perform private.require_admin();
  select decrypted_secret into k from vault.decrypted_secrets where name = 'worxmax_stripe_secret_key';
  select decrypted_secret into h from vault.decrypted_secrets where name = 'worxmax_stripe_webhook_secret';
  return jsonb_build_object(
    'key_set', k is not null, 'key_hint', case when k is null then null else left(k, 8) || '…' || right(k, 4) end,
    'mode', case when k like '%_live_%' then 'live' when k like '%_test_%' then 'test' else null end,
    'webhook_set', h is not null,
    'settings', to_jsonb(s) - 'id',
    'events', (select coalesce(jsonb_agg(e order by e.received_at desc), '[]') from
               (select id, type, workshop_id, received_at, processed_at, error from public.stripe_events order by received_at desc limit 15) e),
    'retention', (select coalesce(jsonb_agg(r order by r.ran_at desc), '[]') from
               (select ran_at, applied, workshop_id, kind, detail from private.retention_log order by ran_at desc limit 20) r));
end $$;

create or replace function public.admin_billing_settings(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update private.billing_settings set
    grace_days = coalesce((p ->> 'grace_days')::int, grace_days),
    trial_keep_days = coalesce((p ->> 'trial_keep_days')::int, trial_keep_days),
    closed_keep_days = coalesce((p ->> 'closed_keep_days')::int, closed_keep_days),
    keep_months = coalesce(p -> 'keep_months', keep_months),
    parts_months = coalesce((p ->> 'parts_months')::int, parts_months),
    warn_days = coalesce((p ->> 'warn_days')::int, warn_days),
    enforce = coalesce((p ->> 'enforce')::boolean, enforce),
    terms_version = coalesce(p ->> 'terms_version', terms_version),
    updated_at = now()
  where id;
  return public.admin_billing_status();
end $$;

create or replace function public.admin_retention_run()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return private.retention_run(false);   -- a report only; deleting happens in the nightly job when enforce is on
end $$;

-- the Stripe functions (service role) read the key and the settings here
create or replace function public.billing_secret(p_name text)
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'worxmax_' || p_name;
$$;

revoke all on function public.admin_billing_secret_set(text, text), public.admin_billing_status(),
  public.admin_billing_settings(jsonb), public.admin_retention_run(), public.billing_secret(text) from public, anon;
grant execute on function public.admin_billing_secret_set(text, text), public.admin_billing_status(),
  public.admin_billing_settings(jsonb), public.admin_retention_run() to authenticated;   -- each checks the admin itself
revoke all on function public.billing_secret(text) from authenticated;
grant execute on function public.billing_secret(text) to service_role;
