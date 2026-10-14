-- #1608 rollback: stop checkout consumers first. No deletion/backfill.
-- Refuse rollback when a Clerk-only attempt cannot satisfy auth.users.
begin;
alter table public.billing_checkout_attempts
  add constraint billing_checkout_attempts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.billing_checkout_attempts
  drop constraint billing_checkout_attempts_internal_account_fkey;
commit;
