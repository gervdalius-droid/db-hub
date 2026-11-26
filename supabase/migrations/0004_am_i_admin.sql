-- apps_12: lets /app/ tell the worxmax operator apart from customers.
create or replace function public.am_i_admin()
 returns boolean language sql stable security definer set search_path to ''
as $$ select private.is_admin() $$;
revoke all on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;
