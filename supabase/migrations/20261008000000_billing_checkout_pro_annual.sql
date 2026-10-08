-- ISA-1499: Pro anual (producto Polar anual) usa la clave de checkout pro_annual.
alter table public.billing_checkout_attempts
  drop constraint if exists billing_checkout_attempts_checkout_key_check;

alter table public.billing_checkout_attempts
  add constraint billing_checkout_attempts_checkout_key_check
  check (checkout_key in ('launch_lifetime', 'pro_monthly', 'pro_annual', 'pro_plus_monthly'));
