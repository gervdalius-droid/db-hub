-- apps_14: functions the worxmax app copies call, all scoped to the caller's workshop.

-- 1. Project locks: one person edits a project at a time (Cabinet Studio, Nesting, Offers).
create table if not exists public.project_locks (
  workshop_id uuid not null default public.current_workshop() references public.workshops(id) on delete cascade,
  app text not null,
  project text not null,
  user_id uuid not null default auth.uid(),
  name text,
  device text,
  title text,
  since timestamptz not null default now(),
  beat_at timestamptz not null default now(),
  primary key (workshop_id, app, project)
);
alter table public.project_locks enable row level security;
revoke all on public.project_locks from anon, authenticated;

create or replace function private.lock_info(l public.project_locks)
 returns jsonb language sql stable set search_path to ''
as $$
  select jsonb_build_object('ok', false, 'name', l.name, 'self', l.user_id = (select auth.uid()),
    'since', l.since, 'idle_s', floor(extract(epoch from now() - l.beat_at))::int, 'title', l.title);
$$;

create or replace function public.lock_open(p_app text, p_project text, p_device text, p_title text default null, p_force boolean default false)
 returns jsonb language plpgsql security definer set search_path to ''
as $$
declare w uuid := public.current_workshop(); l public.project_locks; nm text;
begin
  if w is null then raise exception 'not a workshop member' using errcode = '42501'; end if;
  select * into l from public.project_locks where workshop_id = w and app = p_app and project = p_project;
  if found and not p_force and l.beat_at > now() - interval '2 minutes'
     and not (l.user_id = auth.uid() and coalesce(l.device, '') = coalesce(p_device, '')) then
    return private.lock_info(l);
  end if;
  select display_name into nm from public.workshop_members where user_id = auth.uid() and workshop_id = w;
  insert into public.project_locks (workshop_id, app, project, user_id, name, device, title, since, beat_at)
  values (w, p_app, p_project, auth.uid(), nm, p_device, p_title, now(), now())
  on conflict (workshop_id, app, project) do update
    set user_id = excluded.user_id, name = excluded.name, device = excluded.device,
        title = coalesce(excluded.title, project_locks.title), since = now(), beat_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.lock_beat(p_app text, p_project text, p_device text)
 returns jsonb language plpgsql security definer set search_path to ''
as $$
declare w uuid := public.current_workshop(); l public.project_locks;
begin
  if w is null then raise exception 'not a workshop member' using errcode = '42501'; end if;
  select * into l from public.project_locks where workshop_id = w and app = p_app and project = p_project;
  if not found then return jsonb_build_object('ok', true); end if;
  if l.user_id = auth.uid() and coalesce(l.device, '') = coalesce(p_device, '') then
    update public.project_locks set beat_at = now() where workshop_id = w and app = p_app and project = p_project;
    return jsonb_build_object('ok', true);
  end if;
  return private.lock_info(l);
end $$;

create or replace function public.lock_close(p_app text, p_project text, p_device text)
 returns void language sql security definer set search_path to ''
as $$
  delete from public.project_locks
   where workshop_id = public.current_workshop() and app = p_app and project = p_project
     and user_id = auth.uid() and coalesce(device, '') = coalesce(p_device, '');
$$;

create or replace function public.lock_list(p_app text)
 returns jsonb language sql stable security definer set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('project', project, 'name', name, 'self', user_id = (select auth.uid()))), '[]'::jsonb)
    from public.project_locks
   where workshop_id = public.current_workshop() and app = p_app and beat_at > now() - interval '2 minutes';
$$;

-- 2. Shopfloor plan time log: anyone in the workshop adds their own sessions; one row per month.
create or replace function private.cechas_month(ms bigint)
 returns text language sql immutable set search_path to ''
as $$ select to_char(to_timestamp(ms / 1000.0) at time zone 'Europe/Vilnius', 'YYYY-MM') $$;

create or replace function private.cechas_log_merge(p_month text, p_new jsonb)
 returns void language plpgsql security definer set search_path to ''
as $$
declare w uuid := public.current_workshop(); old jsonb; keep jsonb;
begin
  select coalesce(data -> 's', '{}'::jsonb) into old from public.workspaces where workshop_id = w and id = 'dedes-cechas-log-' || p_month;
  old := coalesce(old, '{}'::jsonb);
  -- corrections a manager approved (fx) are never overwritten by a device
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into keep from jsonb_each(old) e(k, v) where v ? 'fx';
  insert into public.workspaces (workshop_id, id, data, updated_at, updated_by)
  values (w, 'dedes-cechas-log-' || p_month, jsonb_build_object('s', old || p_new || keep), now(), 'cechas')
  on conflict (workshop_id, id) do update
    set data = coalesce(workspaces.data, '{}'::jsonb) || jsonb_build_object('s', old || p_new || keep), updated_at = now();
end $$;

create or replace function public.cechas_log_put(p_entries jsonb)
 returns void language plpgsql security definer set search_path to ''
as $$
declare r record;
begin
  if not public.workshop_is_member() then raise exception 'not a workshop member' using errcode = '42501'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 500 then raise exception 'bad entries'; end if;
  for r in
    select private.cechas_month((e ->> 'a')::bigint) as m, jsonb_object_agg(e ->> 'id', e) as s
      from jsonb_array_elements(p_entries) e
     where e ? 'id' and e ? 'a'
     group by 1
  loop
    perform private.cechas_log_merge(r.m, r.s);
  end loop;
end $$;

-- 3. Day corrections: a worker asks, a manager approves; approved ones go into the log.
create or replace function private.cechas_fix_apply(f public.cechas_fixes, by_name text)
 returns void language plpgsql security definer set search_path to ''
as $$
declare m text; m2 text; nid text;
begin
  if f.k in ('del', 'edit') then
    m := private.cechas_month((f.o ->> 'a')::bigint);
    if f.k = 'edit' and private.cechas_month((f.v ->> 'a')::bigint) = m then
      perform private.cechas_log_merge(m, jsonb_build_object(f.sid, f.o || f.v || jsonb_build_object('id', f.sid, 'w', f.w, 'n', f.n, 'fx', 1, 'by', by_name)));
    else
      perform private.cechas_log_merge(m, jsonb_build_object(f.sid, jsonb_build_object('id', f.sid, 'w', f.w, 'n', f.n, 'a', f.o -> 'a', 'b', f.o -> 'b', 'del', 1, 'fx', 1)));
      if f.k = 'edit' then
        m2 := private.cechas_month((f.v ->> 'a')::bigint);
        perform private.cechas_log_merge(m2, jsonb_build_object(f.sid || '_m', f.o || f.v || jsonb_build_object('id', f.sid || '_m', 'w', f.w, 'n', f.n, 'fx', 1, 'by', by_name)));
      end if;
    end if;
  else
    m := private.cechas_month((f.v ->> 'a')::bigint);
    nid := f.w || '_fix_' || floor(extract(epoch from f.at) * 1000)::bigint;
    perform private.cechas_log_merge(m, jsonb_build_object(nid, f.v || jsonb_build_object('id', nid, 'w', f.w, 'n', f.n, 'fx', 1, 'by', by_name)));
  end if;
end $$;

create or replace function public.cechas_fix_submit(p jsonb)
 returns setof public.cechas_fixes language plpgsql security definer set search_path to ''
as $$
declare me text; mgr boolean := public.workshop_is_manager(); f public.cechas_fixes;
begin
  if not public.workshop_is_member() then raise exception 'not a workshop member' using errcode = '42501'; end if;
  select display_name into me from public.workshop_members where user_id = auth.uid() and workshop_id = public.current_workshop();
  insert into public.cechas_fixes (id, day, w, n, k, sid, o, v, by_name, by_uid, at, st)
  values ((p ->> 'w') || '_' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
          (p ->> 'day')::date, p ->> 'w', p ->> 'n', p ->> 'k', p ->> 'sid', p -> 'o', p -> 'v', me, auth.uid(), now(), 'p')
  returning * into f;
  if mgr then
    perform private.cechas_fix_apply(f, me);
    update public.cechas_fixes set st = 'ok', m_name = me, m_uid = auth.uid(), m_at = now()
     where workshop_id = f.workshop_id and id = f.id returning * into f;
  end if;
  return next f;
end $$;

create or replace function public.cechas_fix_decide(p_id text, p_ok boolean)
 returns void language plpgsql security definer set search_path to ''
as $$
declare me text; f public.cechas_fixes;
begin
  if not public.workshop_is_manager() then raise exception 'managers only' using errcode = '42501'; end if;
  select display_name into me from public.workshop_members where user_id = auth.uid() and workshop_id = public.current_workshop();
  select * into f from public.cechas_fixes where workshop_id = public.current_workshop() and id = p_id and st = 'p';
  if not found then return; end if;
  if p_ok then perform private.cechas_fix_apply(f, me); end if;
  update public.cechas_fixes set st = case when p_ok then 'ok' else 'no' end, m_name = me, m_uid = auth.uid(), m_at = now()
   where workshop_id = f.workshop_id and id = f.id;
end $$;

create or replace function public.cechas_day_set(p_day date, p_w text, p_ok boolean)
 returns void language plpgsql security definer set search_path to ''
as $$
declare me text;
begin
  if not public.workshop_is_manager() then raise exception 'managers only' using errcode = '42501'; end if;
  select display_name into me from public.workshop_members where user_id = auth.uid() and workshop_id = public.current_workshop();
  if p_ok then
    insert into public.cechas_days (workshop_id, day, w, by_name, by_uid, at) values (public.current_workshop(), p_day, p_w, me, auth.uid(), now())
    on conflict (workshop_id, day, w) do update set by_name = excluded.by_name, by_uid = excluded.by_uid, at = now();
  else
    delete from public.cechas_days where workshop_id = public.current_workshop() and day = p_day and w = p_w;
  end if;
end $$;

revoke all on function private.lock_info(public.project_locks), private.cechas_month(bigint), private.cechas_log_merge(text, jsonb),
  private.cechas_fix_apply(public.cechas_fixes, text) from public, anon, authenticated;
revoke all on function public.lock_open(text, text, text, text, boolean), public.lock_beat(text, text, text), public.lock_close(text, text, text),
  public.lock_list(text), public.cechas_log_put(jsonb), public.cechas_fix_submit(jsonb), public.cechas_fix_decide(text, boolean),
  public.cechas_day_set(date, text, boolean) from public, anon;
grant execute on function public.lock_open(text, text, text, text, boolean), public.lock_beat(text, text, text), public.lock_close(text, text, text),
  public.lock_list(text), public.cechas_log_put(jsonb), public.cechas_fix_submit(jsonb), public.cechas_fix_decide(text, boolean),
  public.cechas_day_set(date, text, boolean) to authenticated;
