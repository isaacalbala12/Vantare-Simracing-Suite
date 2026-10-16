-- #1608: accept the annual product already offered by the native client/catalog.
-- Validate the closed product set atomically. No price or catalog changes.
begin;
alter table public.billing_checkout_attempts
  drop constraint billing_checkout_attempts_checkout_key_check;
alter table public.billing_checkout_attempts
  add constraint billing_checkout_attempts_checkout_key_check
  check (checkout_key in ('launch_lifetime','pro_monthly','pro_annual','pro_plus_monthly'));
commit;
