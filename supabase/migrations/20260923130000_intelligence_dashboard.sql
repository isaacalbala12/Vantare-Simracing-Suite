-- Read-only aggregate for the private owner dashboard. Never returns identities.
create function public.intelligence_dashboard_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'observed_at', now(),
    'accounts_total', (select count(*) from auth.users),
    'accounts_new_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'accounts_signed_in_30d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days'),
    'devices_total', (select count(*) from public.devices),
    'devices_seen_30d', (select count(*) from public.devices where last_seen_at >= now() - interval '30 days'),
    'billing_legacy_subscriptions', (select count(*) from public.billing_subscriptions where environment = 'legacy'),
    'billing_production_subscriptions', (select count(*) from public.billing_subscriptions where environment = 'production'),
    'billing_sandbox_subscriptions', (select count(*) from public.billing_subscriptions where environment = 'sandbox'),
    'latest_billing_update', (select max(updated_at) from public.billing_subscriptions)
  );
$$;

revoke all on function public.intelligence_dashboard_snapshot() from public, anon, authenticated;
grant execute on function public.intelligence_dashboard_snapshot() to service_role;

comment on function public.intelligence_dashboard_snapshot() is
  'Aggregate operational context for the private owner dashboard; not an app-usage or revenue metric.';

-- One weekly manual scorecard for a solo operator. No pilot identity or race data.
create table public.intelligence_weekly_growth (
  week_start date primary key,
  youtube_followers integer check (youtube_followers >= 0),
  instagram_followers integer check (instagram_followers >= 0),
  marketing_minutes integer check (marketing_minutes >= 0 and marketing_minutes <= 10080),
  qualified_visits integer check (qualified_visits >= 0),
  first_sessions_confirmed integer check (first_sessions_confirmed >= 0),
  cohort_mature integer check (cohort_mature >= 0),
  cohort_returned_d7_13 integer check (cohort_returned_d7_13 >= 0),
  cohort_unknown integer check (cohort_unknown >= 0),
  source_note text check (source_note is null or length(source_note) <= 300),
  updated_at timestamptz not null default now(),
  constraint intelligence_weekly_growth_cohort_check check (
    (cohort_mature is null and cohort_returned_d7_13 is null and cohort_unknown is null)
    or (
      cohort_mature is not null
      and cohort_returned_d7_13 is not null
      and cohort_unknown is not null
      and first_sessions_confirmed is not null
      and cohort_mature <= first_sessions_confirmed
      and cohort_returned_d7_13::bigint + cohort_unknown::bigint <= cohort_mature
      and source_note is not null
      and length(btrim(source_note)) > 0
    )
  )
);

alter table public.intelligence_weekly_growth enable row level security;
revoke all on table public.intelligence_weekly_growth from public, anon, authenticated;
grant select, insert, update on table public.intelligence_weekly_growth to service_role;

comment on table public.intelligence_weekly_growth is
  'Manual weekly owner scorecard and mature return cohorts. No implicit app telemetry or customer identifiers.';
