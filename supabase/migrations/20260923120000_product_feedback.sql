-- Explicit product opinions. This is not an analytics or diagnostics channel.
-- Authenticated pilots can insert, inspect and delete only their own text.

create table public.product_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (category in ('problem', 'idea', 'experience')),
  message text not null check (
    length(btrim(message)) between 10 and 2000
    and octet_length(message) <= 8000
  ),
  app_version text check (app_version is null or length(app_version) <= 64),
  channel text not null default 'unknown'
    check (channel in ('stable', 'testers', 'nightly', 'unknown')),
  reply_opt_in boolean not null default false,
  triage_status text not null default 'new'
    check (triage_status in ('new', 'reviewed', 'action_created', 'closed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '180 days')
);

create index product_feedback_user_created_idx
  on public.product_feedback (user_id, created_at desc);
create index product_feedback_triage_idx
  on public.product_feedback (triage_status, created_at desc);
create index product_feedback_expires_idx
  on public.product_feedback (expires_at);

alter table public.product_feedback enable row level security;
revoke all on table public.product_feedback from public, anon, authenticated;

-- Column grants stop clients from changing owner, timestamps, or triage state
-- on insertion. There is deliberately no UPDATE grant to authenticated.
grant select (id, category, message, app_version, channel, reply_opt_in,
  triage_status, created_at, expires_at)
  on public.product_feedback to authenticated;
grant insert (category, message, app_version, channel, reply_opt_in)
  on public.product_feedback to authenticated;
grant delete on public.product_feedback to authenticated;

create policy product_feedback_select_own on public.product_feedback
  for select to authenticated
  using (user_id = (select auth.uid()) and expires_at > now());
create policy product_feedback_insert_own on public.product_feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy product_feedback_delete_own on public.product_feedback
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- The row, including identity and free text, disappears after 180 days.
-- The job is idempotent; the scheduled role has permission to call this function.
create function public.purge_expired_product_feedback()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.product_feedback where expires_at <= now();
$$;
revoke all on function public.purge_expired_product_feedback() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule(
  'vantare-product-feedback-expiry',
  '17 3 * * *',
  $purge$select public.purge_expired_product_feedback()$purge$
);

comment on table public.product_feedback is
  'Voluntary, account-scoped opinions; text expires after 180 days.';
