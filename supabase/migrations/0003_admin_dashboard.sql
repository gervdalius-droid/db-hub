-- db-hub operator dashboard (admin/index.html).
-- Billing details on each workshop, a payments ledger, and functions that only people
-- listed in public.admins can call. Customers never see any of this: the new table has
-- no access rules at all, and every function starts by checking private.is_admin().
set check_function_bodies = off;

-- 1. Billing on workshops. "plan" stays trial/office/workshop/complete.
alter table public.workshops
  add column billing text not null default 'none' check (billing in ('none', 'monthly', 'yearly', 'one_time')),
  add column price_eur numeric(10,2) check (price_eur is null or price_eur >= 0),
  add column paid_until date,
  add column contact_email text,
  add column contact_phone text,
  add column country text,
  add column notes text,
  add column lead_id uuid references public.leads(id) on delete set null,
  add column suspended_at timestamptz;

-- 2. Payments you record by hand (bank transfer, card, cash) until a payment provider is connected.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  amount_eur numeric(10,2) not null check (amount_eur <> 0),
  paid_on date not null default current_date,
  covers_from date,
  covers_to date,
  method text not null default 'bank' check (method in ('bank', 'card', 'cash', 'other')),
  reference text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (covers_to is null or covers_from is null or covers_to >= covers_from)
);
create index payments_workshop on public.payments (workshop_id, paid_on desc);
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;

-- 3. The operator can invite a workshop's first owner, so invitations may carry the owner role.
--    Workshop owners still cannot hand out the owner role themselves (insert rule below).
alter table public.workshop_invites drop constraint workshop_invites_role_check;
alter table public.workshop_invites add constraint workshop_invites_role_check check (role in ('admin', 'manager', 'worker', 'shop'));
drop policy if exists invites_admin on public.workshop_invites;
create policy invites_admin_read on public.workshop_invites for select to authenticated
  using ((select public.workshop_is_admin()) and workshop_id = (select public.current_workshop()));
create policy invites_admin_add on public.workshop_invites for insert to authenticated
  with check ((select public.workshop_is_admin()) and workshop_id = (select public.current_workshop()) and role <> 'admin');
create policy invites_admin_remove on public.workshop_invites for delete to authenticated
  using ((select public.workshop_is_admin()) and workshop_id = (select public.current_workshop()));

-- 4. Where a workshop stands, in one word.
create or replace function private.workshop_state(w public.workshops)
 returns text language sql stable set search_path to ''
as $function$
  select case
    when w.status = 'suspended' then 'suspended'
    when w.plan = 'trial' then case when w.trial_ends_at > now() then 'trial' else 'trial_ended' end
    when w.billing = 'none' then 'free'
    when w.paid_until is null then 'unpaid'
    when w.paid_until >= current_date then 'paying'
    else 'overdue' end;
$function$;

-- Monthly value of a workshop that is currently paying.
create or replace function private.workshop_mrr(w public.workshops)
 returns numeric language sql stable set search_path to ''
as $function$
  select case when private.workshop_state(w) <> 'paying' then 0
              when w.billing = 'monthly' then coalesce(w.price_eur, 0)
              when w.billing = 'yearly' then round(coalesce(w.price_eur, 0) / 12, 2)
              else 0 end;
$function$;

create or replace function private.require_admin()
 returns void language plpgsql stable security definer set search_path to ''
as $function$
begin
  if not private.is_admin() then raise exception 'db-hub admins only' using errcode = '42501'; end if;
end $function$;

-- 5. Everything the dashboard shows, in one call.
create or replace function public.admin_overview()
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare res jsonb;
begin
  perform private.require_admin();
  with ws as (
    select w.*, private.workshop_state(w) as state, private.workshop_mrr(w) as mrr,
      (select jsonb_build_object('name', m.display_name, 'email', u.email, 'last_sign_in', u.last_sign_in_at)
         from public.workshop_members m join auth.users u on u.id = m.user_id
        where m.workshop_id = w.id and m.role = 'admin' order by m.created_at limit 1) as owner,
      (select i.email from public.workshop_invites i
        where i.workshop_id = w.id and i.role = 'admin' and i.accepted_at is null order by i.created_at limit 1) as owner_invite,
      (select count(*) from public.workshop_members m where m.workshop_id = w.id and m.active) as members,
      (select count(*) from public.workshop_invites i where i.workshop_id = w.id and i.accepted_at is null) as invites,
      (select max(u.last_sign_in_at) from public.workshop_members m join auth.users u on u.id = m.user_id where m.workshop_id = w.id) as last_sign_in,
      greatest(
        (select max(updated_at) from public.workspaces x where x.workshop_id = w.id),
        (select max(updated_at) from public.builder_projects x where x.workshop_id = w.id),
        (select max(updated_at) from public.fabflow_projects x where x.workshop_id = w.id),
        (select max(updated_at) from public.quote_projects x where x.workshop_id = w.id),
        (select max(updated_at) from public.crm_items x where x.workshop_id = w.id)) as last_change,
      jsonb_build_object(
        'cabinet_projects', (select count(*) from public.builder_projects x where x.workshop_id = w.id and not x.deleted),
        'nesting_projects', (select count(*) from public.fabflow_projects x where x.workshop_id = w.id),
        'offers', (select count(*) from public.quote_projects x where x.workshop_id = w.id),
        'crm_records', (select count(*) from public.crm_items x where x.workshop_id = w.id and not x.deleted),
        'app_documents', (select count(*) from public.workspaces x where x.workshop_id = w.id)) as usage,
      (select coalesce(sum(p.amount_eur), 0) from public.payments p where p.workshop_id = w.id) as total_paid,
      (select max(p.paid_on) from public.payments p where p.workshop_id = w.id) as last_payment
    from public.workshops w
  )
  select jsonb_build_object(
    'generated_at', now(),
    'kpi', jsonb_build_object(
      'mrr', (select coalesce(sum(mrr), 0) from ws),
      'paying', (select count(*) from ws where state = 'paying'),
      'trials', (select count(*) from ws where state = 'trial'),
      'trials_ending_2d', (select count(*) from ws where state = 'trial' and trial_ends_at < now() + interval '2 days'),
      'trials_ended', (select count(*) from ws where state = 'trial_ended'),
      'overdue', (select count(*) from ws where state in ('overdue', 'unpaid')),
      'suspended', (select count(*) from ws where state = 'suspended'),
      'workshops', (select count(*) from ws),
      'people', (select count(*) from public.workshop_members where active),
      'revenue_30d', (select coalesce(sum(amount_eur), 0) from public.payments where paid_on > current_date - 30),
      'revenue_year', (select coalesce(sum(amount_eur), 0) from public.payments where paid_on >= date_trunc('year', current_date)),
      'revenue_total', (select coalesce(sum(amount_eur), 0) from public.payments),
      'signups_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'leads_new', (select count(*) from public.leads where status = 'new'),
      'demo_7d', (select count(*) from public.demo_sessions where created_at > now() - interval '7 days')),
    'workshops', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'code', code, 'status', status, 'state', state, 'plan', plan, 'billing', billing,
        'price_eur', price_eur, 'paid_until', paid_until, 'trial_ends_at', trial_ends_at, 'created_at', created_at,
        'contact_email', contact_email, 'contact_phone', contact_phone, 'country', country, 'notes', notes,
        'lead_id', lead_id, 'owner', owner, 'owner_invite', owner_invite, 'members', members, 'invites', invites,
        'last_sign_in', last_sign_in, 'last_change', last_change, 'usage', usage, 'mrr', mrr,
        'total_paid', total_paid, 'last_payment', last_payment) order by created_at desc) from ws), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'workshop_id', m.workshop_id, 'name', m.display_name, 'role', m.role, 'active', m.active,
        'email', u.email, 'joined', m.created_at, 'last_sign_in', u.last_sign_in_at) order by m.created_at)
      from public.workshop_members m join auth.users u on u.id = m.user_id), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'workshop_id', i.workshop_id, 'name', i.display_name, 'email', i.email, 'role', i.role, 'created_at', i.created_at)
        order by i.created_at) from public.workshop_invites i where i.accepted_at is null), '[]'::jsonb),
    'unassigned', coalesce((select jsonb_agg(jsonb_build_object(
        'email', u.email, 'created_at', u.created_at, 'confirmed', u.email_confirmed_at is not null, 'last_sign_in', u.last_sign_in_at,
        'invited', exists (select 1 from public.workshop_invites i where i.email = lower(u.email) and i.accepted_at is null))
        order by u.created_at desc)
      from auth.users u
      where not exists (select 1 from public.workshop_members m where m.user_id = u.id)
        and not exists (select 1 from public.admins a where lower(a.email) = lower(u.email))), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'workshop_id', p.workshop_id, 'workshop', w.name, 'amount_eur', p.amount_eur, 'paid_on', p.paid_on,
        'covers_from', p.covers_from, 'covers_to', p.covers_to, 'method', p.method, 'reference', p.reference, 'note', p.note)
        order by p.paid_on desc, p.created_at desc)
      from public.payments p join public.workshops w on w.id = p.workshop_id), '[]'::jsonb),
    'feed', coalesce((select jsonb_agg(e order by e->>'at' desc) from (select e from (
        select jsonb_build_object('at', u.created_at, 'kind', 'signup', 'text', u.email || ' created an account') e
          from auth.users u where u.created_at > now() - interval '90 days'
        union all select jsonb_build_object('at', w.created_at, 'kind', 'workshop', 'text', 'Workshop "' || w.name || '" was created', 'workshop_id', w.id)
          from public.workshops w where w.created_at > now() - interval '90 days'
        union all select jsonb_build_object('at', m.created_at, 'kind', 'joined', 'text', m.display_name || ' joined ' || w.name, 'workshop_id', w.id)
          from public.workshop_members m join public.workshops w on w.id = m.workshop_id where m.created_at > now() - interval '90 days'
        union all select jsonb_build_object('at', p.created_at, 'kind', 'payment', 'text', w.name || ' paid €' || p.amount_eur, 'workshop_id', w.id)
          from public.payments p join public.workshops w on w.id = p.workshop_id where p.created_at > now() - interval '90 days'
        union all select jsonb_build_object('at', l.created_at, 'kind', 'lead', 'text', 'Trial request from ' || l.company || ' (' || l.name || ')')
          from public.leads l where l.created_at > now() - interval '90 days'
        union all select jsonb_build_object('at', u.last_sign_in_at, 'kind', 'sign_in', 'text', coalesce(m.display_name, u.email) || coalesce(' (' || w.name || ')', '') || ' signed in', 'workshop_id', w.id)
          from auth.users u left join public.workshop_members m on m.user_id = u.id left join public.workshops w on w.id = m.workshop_id
          where u.last_sign_in_at > now() - interval '30 days'
        union all select jsonb_build_object('at', d.created_at, 'kind', 'demo',
            'text', 'Someone tried the demo: ' || d.cabinet_count || ' cabinet(s)' || case when d.downloaded_cut_list then ', downloaded the cut list' else '' end)
          from public.demo_sessions d where d.created_at > now() - interval '30 days'
        ) ev order by e->>'at' desc limit 150) f), '[]'::jsonb)
  ) into res;
  return res;
end $function$;

-- 6. Add a customer: a workshop plus its owner. If the owner already has a db-hub account
--    without a workshop, they are added straight away; otherwise they get an invitation and
--    land in the workshop when they create their account with that email.
create or replace function public.admin_create_workshop(p jsonb)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  em text := lower(btrim(coalesce(p->>'owner_email', '')));
  nm text := btrim(coalesce(p->>'owner_name', ''));
  pl text := coalesce(nullif(p->>'plan', ''), 'trial');
  days int := coalesce(nullif(p->>'trial_days', '')::int, 5);
  uid uuid; w public.workshops; joined boolean := false;
begin
  perform private.require_admin();
  if em !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'owner email is not valid' using errcode = '22023'; end if;
  if nm = '' then raise exception 'owner name is required' using errcode = '22023'; end if;
  if days < 0 or days > 365 then raise exception 'trial days must be 0 to 365' using errcode = '22023'; end if;
  select id into uid from auth.users where lower(email) = em;
  if uid is not null and exists (select 1 from public.workshop_members where user_id = uid) then
    raise exception '% already belongs to a workshop', em using errcode = '23505';
  end if;
  if exists (select 1 from public.workshop_invites where email = em and accepted_at is null) then
    raise exception '% already has an open invitation', em using errcode = '23505';
  end if;

  insert into public.workshops (name, plan, trial_ends_at, billing, price_eur, paid_until,
                                contact_email, contact_phone, country, notes, lead_id)
  values (btrim(p->>'name'), pl, now() + make_interval(days => days),
          coalesce(nullif(p->>'billing', ''), 'none'), nullif(p->>'price_eur', '')::numeric, nullif(p->>'paid_until', '')::date,
          em, nullif(btrim(p->>'contact_phone'), ''), nullif(btrim(p->>'country'), ''), nullif(btrim(p->>'notes'), ''),
          nullif(p->>'lead_id', '')::uuid)
  returning * into w;

  if uid is not null then
    insert into public.workshop_members (user_id, workshop_id, display_name, role) values (uid, w.id, left(nm, 80), 'admin');
    joined := true;
  else
    insert into public.workshop_invites (workshop_id, email, display_name, role, created_by)
    values (w.id, em, left(nm, 80), 'admin', auth.uid());
  end if;
  if w.lead_id is not null then
    update public.leads set status = 'trial' where id = w.lead_id and status in ('new', 'contacted');
  end if;
  return jsonb_build_object('workshop_id', w.id, 'joined', joined);
end $function$;

-- 7. Change a workshop's plan, billing, dates, status or notes. Only keys present in p change.
create or replace function public.admin_save_workshop(p_id uuid, p jsonb)
 returns void language plpgsql security definer set search_path to ''
as $function$
begin
  perform private.require_admin();
  update public.workshops set
    name          = case when p ? 'name' then btrim(p->>'name') else name end,
    plan          = case when p ? 'plan' then p->>'plan' else plan end,
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
end $function$;

-- 8. Record a payment. When it covers a period, "paid until" moves forward to its end.
create or replace function public.admin_add_payment(p jsonb)
 returns uuid language plpgsql security definer set search_path to ''
as $function$
declare pid uuid; wid uuid := (p->>'workshop_id')::uuid; cto date := nullif(p->>'covers_to', '')::date;
begin
  perform private.require_admin();
  if not exists (select 1 from public.workshops where id = wid) then raise exception 'no such workshop' using errcode = 'P0002'; end if;
  insert into public.payments (workshop_id, amount_eur, paid_on, covers_from, covers_to, method, reference, note)
  values (wid, (p->>'amount_eur')::numeric, coalesce(nullif(p->>'paid_on', '')::date, current_date),
          nullif(p->>'covers_from', '')::date, cto, coalesce(nullif(p->>'method', ''), 'bank'),
          nullif(btrim(p->>'reference'), ''), nullif(btrim(p->>'note'), ''))
  returning id into pid;
  if cto is not null then
    update public.workshops set paid_until = greatest(coalesce(paid_until, cto), cto) where id = wid;
  end if;
  return pid;
end $function$;

create or replace function public.admin_delete_payment(p_id uuid)
 returns void language plpgsql security definer set search_path to ''
as $function$
begin
  perform private.require_admin();
  delete from public.payments where id = p_id;
end $function$;

create or replace function public.admin_cancel_invite(p_id uuid)
 returns void language plpgsql security definer set search_path to ''
as $function$
begin
  perform private.require_admin();
  delete from public.workshop_invites where id = p_id and accepted_at is null;
end $function$;

-- Delete a lead (for test rows and spam). The trial request disappears; its demo session stays.
create or replace function public.admin_delete_lead(p_id uuid)
 returns void language plpgsql security definer set search_path to ''
as $function$
begin
  perform private.require_admin();
  delete from public.leads where id = p_id;
end $function$;

revoke all on function private.workshop_state(public.workshops), private.workshop_mrr(public.workshops), private.require_admin() from public, anon, authenticated;
revoke all on function public.admin_overview(), public.admin_create_workshop(jsonb), public.admin_save_workshop(uuid, jsonb),
  public.admin_add_payment(jsonb), public.admin_delete_payment(uuid), public.admin_cancel_invite(uuid), public.admin_delete_lead(uuid) from public, anon;
grant execute on function public.admin_overview(), public.admin_create_workshop(jsonb), public.admin_save_workshop(uuid, jsonb),
  public.admin_add_payment(jsonb), public.admin_delete_payment(uuid), public.admin_cancel_invite(uuid), public.admin_delete_lead(uuid) to authenticated;

-- 9. The worxmax operator.
insert into public.admins (email) values ('it@worxmax.com') on conflict do nothing;
