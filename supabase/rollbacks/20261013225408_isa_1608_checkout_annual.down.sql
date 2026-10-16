-- Stop checkout consumers first. Refuse rollback if annual attempts exist.
begin;
alter table public.billing_checkout_attempts
  drop constraint billing_checkout_attempts_checkout_key_check;
alter table public.billing_checkout_attempts
  add constraint billing_checkout_attempts_checkout_key_check
  check (checkout_key in ('launch_lifetime','pro_monthly','pro_plus_monthly'));
commit;
