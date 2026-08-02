create table if not exists public.billing_checkout_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  checkout_key text not null check (checkout_key in ('launch_lifetime', 'pro_monthly', 'pro_plus_monthly')),
  environment text not null check (environment in ('sandbox', 'production')),
  catalog_version text not null check (length(btrim(catalog_version)) > 0),
  status text not null check (status in ('creating', 'open', 'uncertain')),
  provider_checkout_id text,
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, attempt_id),
  check ((status = 'open') = (checkout_url is not null))
);

alter table public.billing_checkout_attempts enable row level security;
revoke all on public.billing_checkout_attempts from anon, authenticated;
grant select, insert, update, delete on public.billing_checkout_attempts to service_role;

comment on table public.billing_checkout_attempts is
  'Short-lived server-only checkout deduplication state. Never exposed through client RLS.';
