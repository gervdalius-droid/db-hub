-- db-hub website backend (Supabase project "DEDES BALDAI").
-- Applied 2026-11-17. Trial requests (leads) and what visitors build in the live demo.
-- Nothing is readable or writable with the public key: writes go through the "intake"
-- edge function, reads are for signed-in people whose email is in public.admins.
create schema if not exists private;

create table public.admins (email text primary key, added_at timestamptz not null default now());

create table public.demo_sessions (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cabinets jsonb not null default '[]'::jsonb,
  cabinet_count int not null default 0,
  parts int, sheets int, quote_eur numeric(10,2), summary text,
  downloaded_cut_list boolean not null default false,
  opened_trial_form boolean not null default false,
  updates int not null default 1,
  referrer text, page_lang text, user_agent text, ip_hash text
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null, company text not null, email text not null, phone text,
  people int, plan text, message text,
  demo_session_id uuid references public.demo_sessions(id) on delete set null,
  demo_summary text,
  status text not null default 'new' check (status in ('new','contacted','trial','won','lost')),
  notes text, notified_at timestamptz, referrer text, user_agent text, ip_hash text
);

create index leads_created_idx on public.leads (created_at desc);
create index leads_ip_idx on public.leads (ip_hash, created_at desc);
create index leads_demo_session_idx on public.leads (demo_session_id);
create index demo_sessions_updated_idx on public.demo_sessions (updated_at desc);
create index demo_sessions_ip_idx on public.demo_sessions (ip_hash, created_at desc);

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a
    where lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), '')));
$$;
revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

alter table public.admins enable row level security;
alter table public.leads enable row level security;
alter table public.demo_sessions enable row level security;
revoke all on public.admins, public.leads, public.demo_sessions from anon;

create policy "admins can see the admin list" on public.admins for select to authenticated using ((select private.is_admin()));
create policy "admins read leads" on public.leads for select to authenticated using ((select private.is_admin()));
create policy "admins update leads" on public.leads for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins read demo sessions" on public.demo_sessions for select to authenticated using ((select private.is_admin()));
