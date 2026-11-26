-- Only one worxmax operator: the confirmed account it@worxmax.com, pinned by its user id.
-- An email in a token is no longer enough: the signed-in user id must match, the email
-- must be confirmed, and the admin list can't be changed from the website at all.
alter table public.admins add column if not exists user_id uuid unique references auth.users(id) on delete cascade;
update public.admins a set user_id = u.id from auth.users u
 where lower(u.email) = lower(a.email) and u.email_confirmed_at is not null;
delete from public.admins where lower(email) <> 'it@worxmax.com';

create or replace function private.is_admin()
 returns boolean language sql stable security definer set search_path to ''
as $function$
  select exists (
    select 1 from public.admins a
    join auth.users u on u.id = a.user_id
    where a.user_id = (select auth.uid())
      and lower(u.email) = lower(a.email)
      and u.email_confirmed_at is not null
      and u.banned_until is null
  );
$function$;

-- Nobody can add, change or remove admins through the API; only the database owner can.
revoke all on public.admins from anon, authenticated;
drop policy if exists "admins can see the admin list" on public.admins;
