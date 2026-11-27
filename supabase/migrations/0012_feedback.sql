-- 0012 feedback: requests, comments and bug reports from customers, answered by the worxmax operator.
--
-- Customers (any active member of a workshop) post through feedback_submit() and read their own
-- workshop's posts with the operator's answers. Only the operator (private.is_admin) sees every
-- workshop's posts and sets the status and the answer (admin_feedback_list / admin_feedback_answer).
-- Posting stays open in read-only access too (a trial that ended can still report a problem).
-- The "feedback" edge function emails the operator about a new post and the author about an answer.

create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  author_name  text not null default '',
  kind         text not null check (kind in ('request', 'bug', 'comment')),
  app          text not null default 'general' check (char_length(app) <= 40),
  title        text not null check (char_length(title) between 3 and 140),
  body         text not null default '' check (char_length(body) <= 5000),
  context      jsonb not null default '{}'::jsonb,       -- browser, screen size, page: what helps to reproduce a bug
  status       text not null default 'new' check (status in ('new', 'planned', 'in_progress', 'done', 'wont_do')),
  answer       text check (char_length(answer) <= 5000),
  answered_at  timestamptz,
  notified_at  timestamptz,                              -- operator emailed about the new post
  answer_sent_at timestamptz,                            -- author emailed about the answer
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists feedback_workshop_idx on public.feedback (workshop_id, created_at desc);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;
-- reading: your own workshop's posts; the operator reads all. Writing only through the functions below.
drop policy if exists feedback_member_read on public.feedback;
create policy feedback_member_read on public.feedback for select to authenticated
  using (workshop_id = (select public.current_workshop()) or (select private.is_admin()));
revoke insert, update, delete on public.feedback from anon, authenticated;
revoke all on public.feedback from anon;
revoke truncate, references, trigger on public.feedback from authenticated;
grant select on public.feedback to authenticated;

-- a member posts: workshop, author and status are set here, not by the browser
create or replace function public.feedback_submit(p_kind text, p_app text, p_title text, p_body text, p_context jsonb default '{}'::jsonb)
 returns uuid language plpgsql volatile security definer set search_path to ''
as $function$
declare ws uuid := public.current_workshop(); nm text; new_id uuid; recent int;
begin
  if ws is null then raise exception 'not a member of an active workshop' using errcode = '42501'; end if;
  select count(*) into recent from public.feedback f where f.user_id = (select auth.uid()) and f.created_at > now() - interval '1 day';
  if recent >= 30 then raise exception 'too many posts today, please try again tomorrow' using errcode = '54000'; end if;
  select m.display_name into nm from public.workshop_members m where m.user_id = (select auth.uid()) and m.workshop_id = ws;
  insert into public.feedback (workshop_id, user_id, author_name, kind, app, title, body, context)
  values (ws, (select auth.uid()), coalesce(nm, ''), p_kind, coalesce(nullif(trim(p_app), ''), 'general'),
          trim(p_title), coalesce(trim(p_body), ''),
          case when jsonb_typeof(p_context) = 'object' and length(p_context::text) <= 2000 then p_context else '{}'::jsonb end)
  returning id into new_id;
  return new_id;
end $function$;
revoke all on function public.feedback_submit(text, text, text, text, jsonb) from public, anon;
grant execute on function public.feedback_submit(text, text, text, text, jsonb) to authenticated;

-- the operator: every post with its workshop and the author's email
create or replace function public.admin_feedback_list()
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select f.*, w.name as workshop_name, u.email as author_email
      from public.feedback f join public.workshops w on w.id = f.workshop_id
      left join auth.users u on u.id = f.user_id) x), '[]'::jsonb);
end $function$;
revoke all on function public.admin_feedback_list() from public, anon;
grant execute on function public.admin_feedback_list() to authenticated;

-- the operator sets the status and (optionally) the answer the customer sees
create or replace function public.admin_feedback_answer(p_id uuid, p_status text, p_answer text)
 returns void language plpgsql volatile security definer set search_path to ''
as $function$
begin
  perform private.require_admin();
  update public.feedback f
     set status = p_status,
         answer = nullif(trim(coalesce(p_answer, '')), ''),
         answered_at = case when nullif(trim(coalesce(p_answer, '')), '') is distinct from f.answer then now() else f.answered_at end,
         answer_sent_at = case when nullif(trim(coalesce(p_answer, '')), '') is distinct from f.answer then null else f.answer_sent_at end,
         updated_at = now()
   where f.id = p_id;
  if not found then raise exception 'feedback not found' using errcode = 'P0002'; end if;
end $function$;
revoke all on function public.admin_feedback_answer(uuid, text, text) from public, anon;
grant execute on function public.admin_feedback_answer(uuid, text, text) to authenticated;
