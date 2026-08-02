alter table public.billing_customers
  add column if not exists environment text;

alter table public.billing_customers
  drop constraint if exists billing_customers_environment_check;
alter table public.billing_customers
  add constraint billing_customers_environment_check
  check (environment is null or environment in ('sandbox', 'production'));

alter table public.billing_customers
  drop constraint if exists billing_customers_user_id_provider_key;
alter table public.billing_customers
  drop constraint if exists billing_customers_provider_provider_customer_id_key;

alter table public.billing_customers
  add constraint billing_customers_user_provider_environment_key
  unique nulls not distinct (user_id, provider, environment);
alter table public.billing_customers
  add constraint billing_customers_provider_environment_customer_key
  unique nulls not distinct (provider, environment, provider_customer_id);

comment on column public.billing_customers.environment is
  'Polar environment. Legacy NULL rows are quarantined and never used by checkout, portal or webhook resolution.';
