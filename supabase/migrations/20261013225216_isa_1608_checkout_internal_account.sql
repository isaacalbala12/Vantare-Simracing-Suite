-- #1608: checkout is owned by an existing internal account, not auth.users.
-- Prepared only. Production requires Isaac, backup/restore and staged rollout.
begin;
-- Validate the replacement before dropping the old constraint; no orphan repair.
alter table public.billing_checkout_attempts
  add constraint billing_checkout_attempts_internal_account_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.billing_checkout_attempts
  drop constraint billing_checkout_attempts_user_id_fkey;
commit;
