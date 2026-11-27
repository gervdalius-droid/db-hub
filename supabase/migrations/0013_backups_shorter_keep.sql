-- 0012 backups and shorter keeping.
--
-- worxmax keeps finished work for a shorter time and asks people to keep their own copies:
--   projects: 6 months after the last change on single apps and bundles, 12 on the full suite,
--   the licence and the trial; ShopFlow parts lists of finished orders: 3 months.
-- Every app gets a Backup button (hub/shared/wx.js). It calls public.app_export(app), which
-- returns that app's data as one file and notes the time in private.backup_log, so
-- public.backup_status() can remind people when nothing has been saved for a while or
-- when work is due for removal.

update private.billing_settings
   set keep_months = keep_months || '{"apps": 6, "suite": 12, "trial": 12, "office": 6, "workshop": 6, "complete": 12}'::jsonb,
       parts_months = 3, terms_version = '2026-11-27c', updated_at = now();
alter table private.billing_settings alter column keep_months set default '{"apps":6,"suite":12,"trial":12,"office":6,"workshop":6,"complete":12}';
alter table private.billing_settings alter column parts_months set default 3;

create table if not exists private.backup_log (
  id bigserial primary key,
  workshop_id uuid not null,
  app text not null,              -- studio, offers, nesting, crm, invoices, shopflow, or 'all'
  user_id uuid,
  at timestamptz not null default now()
);
create index if not exists backup_log_ws on private.backup_log (workshop_id, app, at desc);
revoke all on private.backup_log from public, anon, authenticated;

-- the signed-in person's workshop and role (null when not an active member)
create or replace function private.me_member()
returns table(workshop_id uuid, role text) language sql stable security definer set search_path = '' as $$
  select m.workshop_id, m.role from public.workshop_members m
   where m.user_id = (select auth.uid()) and m.active limit 1;
$$;

-- app → the access area that decides who in the workshop may open it
create or replace function private.area_of_app(p_app text) returns text
language sql immutable set search_path = '' as $$
  select case p_app when 'studio' then 'builder' else p_app end;
$$;

-- ---------------------------------------------------------------- one app's data as a file
create or replace function public.app_export(p_app text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me record; w public.workshops; d jsonb;
begin
  select * into me from private.me_member();
  if me.workshop_id is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into w from public.workshops where id = me.workshop_id;
  if private.workshop_access(w) = 'none' then raise exception 'This workshop has no access.' using errcode = '42501'; end if;
  if p_app not in ('studio', 'offers', 'nesting', 'crm', 'invoices', 'shopflow') then
    raise exception 'This app keeps no data on the server to back up.' using errcode = '22023';
  end if;
  if not public.workshop_can(private.area_of_app(p_app)) then
    raise exception 'Only managers can back up this app.' using errcode = '42501';
  end if;

  d := case p_app
    when 'studio' then jsonb_build_object(
      'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'updated_at', updated_at, 'data', data) order by updated_at desc), '[]')
                     from public.builder_projects where workshop_id = w.id and not deleted),
      'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at, 'data', data)), '[]')
                     from public.workspaces where workshop_id = w.id and id like 'builder-%' and id not like 'builder-ver-%'))
    when 'offers' then jsonb_build_object(
      'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'updated_at', updated_at, 'data', data) order by updated_at desc), '[]')
                     from public.quote_projects where workshop_id = w.id))
    when 'nesting' then jsonb_build_object(
      'projects', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'updated_at', updated_at, 'data', data) order by updated_at desc), '[]')
                     from public.fabflow_projects where workshop_id = w.id))
    when 'crm' then jsonb_build_object(
      'items', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'updated_at', updated_at, 'data', data)), '[]')
                  from public.crm_items where workshop_id = w.id and not deleted),
      'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at, 'data', data)), '[]')
                  from public.workspaces where workshop_id = w.id and id = 'dedes-baldai-crm'))
    when 'invoices' then jsonb_build_object(
      'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at, 'data', data)), '[]')
                  from public.workspaces where workshop_id = w.id and id like 'dedes-baldai-invoices%'))
    when 'shopflow' then jsonb_build_object(
      'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at, 'data', data)), '[]')
                  from public.workspaces where workshop_id = w.id
                   and (id = 'dedes-baldai' or id like 'dedes-cechas%' or id like 'dedes-apzvalga%' or id like 'dedes-prasymai%')),
      'shopfloor_days', (select coalesce(jsonb_agg(to_jsonb(t) - 'workshop_id'), '[]') from public.cechas_days t where t.workshop_id = w.id),
      'shopfloor_fixes', (select coalesce(jsonb_agg(to_jsonb(t) - 'workshop_id'), '[]') from public.cechas_fixes t where t.workshop_id = w.id),
      'files', (select coalesce(jsonb_agg(jsonb_build_object('path', name, 'size', metadata ->> 'size', 'updated_at', updated_at)), '[]')
                  from storage.objects where bucket_id = 'shopflow' and (storage.foldername(name))[1] = w.id::text))
  end;
  insert into private.backup_log (workshop_id, app, user_id) values (w.id, p_app, (select auth.uid()));
  return jsonb_build_object('format', 'worxmax-backup-1', 'app', p_app, 'exported_at', now(),
    'workshop', jsonb_build_object('id', w.id, 'name', w.name), 'keep_months', private.keep_months(w), 'data', d);
end $$;
revoke all on function public.app_export(text) from public, anon;
grant execute on function public.app_export(text) to authenticated;

-- ---------------------------------------------------------------- what to remind about
-- per app: when it was last backed up, and how much is due for removal in the next warn_days
create or replace function public.backup_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me record; w public.workshops; s private.billing_settings := private.bset();
begin
  select * into me from private.me_member();
  if me.workshop_id is null then return null; end if;
  select * into w from public.workshops where id = me.workshop_id;
  return jsonb_build_object(
    'role', me.role, 'keep_months', private.keep_months(w), 'parts_months', s.parts_months, 'warn_days', s.warn_days,
    'last_all', (select max(at) from private.backup_log where workshop_id = w.id and app = 'all'),
    'apps', (select coalesce(jsonb_object_agg(a.app, jsonb_build_object(
        'last_backup', (select max(at) from private.backup_log b where b.workshop_id = w.id and b.app in (a.app, 'all')),
        'due', coalesce(r.n, 0), 'first_removal', r.first,
        'has_data', a.has_data)), '{}')
      from (values
        ('studio', exists (select 1 from public.builder_projects where workshop_id = w.id and not deleted)),
        ('offers', exists (select 1 from public.quote_projects where workshop_id = w.id)),
        ('nesting', exists (select 1 from public.fabflow_projects where workshop_id = w.id)),
        ('crm', exists (select 1 from public.crm_items where workshop_id = w.id and not deleted)),
        ('invoices', exists (select 1 from public.workspaces where workshop_id = w.id and id like 'dedes-baldai-invoices%')),
        ('shopflow', exists (select 1 from public.workspaces where workshop_id = w.id and id = 'dedes-baldai'))) a(app, has_data)
      left join (
        select case x.app when 'Cabinet Studio' then 'studio' when 'Offers' then 'offers' when 'Nesting' then 'nesting'
                          when 'CRM' then 'crm' when 'ShopFlow' then 'shopflow' end as app,
               count(*) as n, min(x.removes_on) as first
          from private.retention_items(w, make_interval(days => s.warn_days)) x group by 1) r on r.app = a.app));
end $$;
revoke all on function public.backup_status() from public, anon;
grant execute on function public.backup_status() to authenticated;

-- the owner's "download everything" also counts as a backup of every app
create or replace function public.workshop_export()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.workshops;
begin
  select ws.* into w from public.workshops ws join public.workshop_members m on m.workshop_id = ws.id
   where m.user_id = (select auth.uid()) and m.active and m.role = 'admin';
  if w.id is null then raise exception 'Only the workshop owner can download everything.' using errcode = '42501'; end if;
  insert into private.backup_log (workshop_id, app, user_id) values (w.id, 'all', (select auth.uid()));
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
