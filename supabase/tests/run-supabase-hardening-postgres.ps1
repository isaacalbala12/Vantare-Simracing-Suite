param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$container = "vantare-supabase-hardening-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
$password = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$dblinkHelper = Join-Path $env:TEMP "$container-dblink-helper.sql"
$claimFile = Join-Path $env:TEMP "$container-claim.sql"
$claimAFile = Join-Path $env:TEMP "$container-claim-a.sql"
$claimBFile = Join-Path $env:TEMP "$container-claim-b.sql"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Invoke-Psql([string]$Database, [string]$File) {
  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d $Database -f $File | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $File in $Database" }
}

function Initialize-Database([string]$Database) {
  docker exec $container createdb -U postgres $Database
  Invoke-Psql $Database "/tmp/bootstrap.sql"
  docker exec $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d $Database -f "/tmp/dblink-helper.sql" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not create the disposable dblink test helper in $Database" }
}

function Assert-PgTap([string]$Database, [string]$File, [string]$Plan, [string]$Label) {
  $tap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -v "dblink_password=$password" -v "dblink_unrestricted=1" -U postgres -d $Database -f $File | Out-String
  if ($LASTEXITCODE -ne 0 -or $tap -match "(?m)^not ok" -or $tap -notmatch $Plan) {
    throw "$Label pgTAP failed:`n$tap"
  }
}

try {
  docker run --rm -d --name $container -e "POSTGRES_PASSWORD=$password" $Image | Out-Null
  $initialized = $false
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $savedErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $logs = docker logs $container 2>&1 | Out-String
    $logsExit = $LASTEXITCODE
    $ErrorActionPreference = $savedErrorAction
    if ($logsExit -ne 0) { throw "Could not read temporary PostgreSQL logs" }
    if ($logs -match "PostgreSQL init process complete") {
      docker exec $container pg_isready -U postgres -d postgres 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) {
        $initialized = $true
        break
      }
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $initialized) { throw "Temporary PostgreSQL did not complete initialization" }

  Write-Utf8NoBom $bootstrap @'
do $$ begin create role anon noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role noinherit bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;
create extension if not exists pgtap;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists dblink with schema extensions;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema public, auth, extensions, storage to anon, authenticated, service_role;
grant insert on storage.objects to authenticated;
grant select, insert, update, delete on storage.objects, storage.buckets to service_role;
'@
  Write-Utf8NoBom $dblinkHelper @'
drop function if exists extensions.vantare_test_dblink_connect(text, text);
create or replace function extensions.vantare_test_dblink_connect(connection_name text, connection_string text)
returns text
language sql
security definer
set search_path = extensions, pg_temp
as $$
  select extensions.dblink_connect_u(connection_name, connection_string)
$$;
revoke all on function extensions.vantare_test_dblink_connect(text, text) from public;
grant execute on function extensions.vantare_test_dblink_connect(text, text) to postgres;
'@
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp $dblinkHelper "${container}:/tmp/dblink-helper.sql"
  docker cp (Join-Path $root "supabase\tests\supabase_auth_license_hardening_test.sql") "${container}:/tmp/hardening-test.sql"
  docker cp (Join-Path $root "supabase\tests\billing_webhook_inbox.test.sql") "${container}:/tmp/inbox-test.sql"
  docker cp (Join-Path $root "supabase\tests\billing_commercial_projection.test.sql") "${container}:/tmp/commercial-projection-test.sql"
  docker cp (Join-Path $root "supabase\tests\billing_commercial_legacy_upgrade.test.sql") "${container}:/tmp/commercial-legacy-upgrade-test.sql"
  docker cp (Join-Path $root "supabase\tests\billing_reconciliation.test.sql") "${container}:/tmp/reconciliation-test.sql"
  docker cp (Join-Path $root "supabase\tests\billing_subscription_lifecycle.test.sql") "${container}:/tmp/subscription-lifecycle-test.sql"
  docker cp (Join-Path $root "supabase\tests\billing_subscription_lifecycle_legacy_upgrade.test.sql") "${container}:/tmp/subscription-lifecycle-upgrade-test.sql"
  docker cp (Join-Path $root "supabase\tests\billing_order_refund_ledger.test.sql") "${container}:/tmp/order-refund-ledger-test.sql"
  docker cp (Join-Path $root "supabase\tests\billing_observability.test.sql") "${container}:/tmp/observability-test.sql"
  docker cp (Join-Path $root "supabase\tests\operational_access.test.sql") "${container}:/tmp/operational-access-test.sql"
  $migrations = Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") | Sort-Object Name
  foreach ($migration in $migrations) { docker cp $migration.FullName "${container}:/tmp/$($migration.Name)" }

  Initialize-Database "clean"
  foreach ($migration in $migrations) { Invoke-Psql "clean" "/tmp/$($migration.Name)" }
  Assert-PgTap "clean" "/tmp/hardening-test.sql" "1\.\.48" "Clean install hardening"
  Assert-PgTap "clean" "/tmp/inbox-test.sql" "1\.\.54" "Clean install inbox"
  Assert-PgTap "clean" "/tmp/commercial-projection-test.sql" "1\.\.43" "Clean install commercial projection"
  Assert-PgTap "clean" "/tmp/reconciliation-test.sql" "1\.\.17" "Clean install reconciliation"
  Assert-PgTap "clean" "/tmp/subscription-lifecycle-test.sql" "1\.\.51" "Clean install subscription lifecycle"
  Assert-PgTap "clean" "/tmp/order-refund-ledger-test.sql" "1\.\.37" "Clean install order refund ledger"
  Assert-PgTap "clean" "/tmp/observability-test.sql" "1\.\.20" "Clean install billing observability"
  Assert-PgTap "clean" "/tmp/operational-access-test.sql" "1\.\.56" "Clean install operational access"

  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d clean -c `
    "insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000089', 'concurrency@example.invalid')" | Out-Null
  Write-Utf8NoBom $claimFile @'
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000089', false);
select public.claim_active_device('concurrent-fingerprint');
'@
  docker cp $claimFile "${container}:/tmp/concurrent-claim.sql"
  docker exec $container sh -c 'psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/concurrent-claim.sql & p1=$!; psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/concurrent-claim.sql & p2=$!; wait $p1; wait $p2'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent device claim failed" }
  $deviceClaim = docker exec $container psql -At -U postgres -d clean -c `
    "select count(*) || ':' || min(fingerprint_hash) from public.devices where user_id = '00000000-0000-4000-8000-000000000089'"
  if ($deviceClaim.Trim() -ne "1:concurrent-fingerprint") { throw "Concurrent device claim contract failed: $deviceClaim" }

  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d clean -c `
    "insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000090', 'race@example.invalid')" | Out-Null
  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d clean -c `
    "create table public.isa88_concurrency_barrier (race text not null, participant text not null, primary key (race, participant))" | Out-Null
  Write-Utf8NoBom $claimAFile @'
insert into public.isa88_concurrency_barrier values ('different-claim', 'a');
do $$ begin
  for i in 1..500 loop
    exit when (select count(*) from public.isa88_concurrency_barrier where race = 'different-claim') = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa88_concurrency_barrier where race = 'different-claim') <> 2 then
    raise exception 'barrier_timeout';
  end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000090', false);
select public.claim_active_device('race-fingerprint-a');
'@
  Write-Utf8NoBom $claimBFile @'
insert into public.isa88_concurrency_barrier values ('different-claim', 'b');
do $$ begin
  for i in 1..500 loop
    exit when (select count(*) from public.isa88_concurrency_barrier where race = 'different-claim') = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa88_concurrency_barrier where race = 'different-claim') <> 2 then
    raise exception 'barrier_timeout';
  end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000090', false);
select public.claim_active_device('race-fingerprint-b');
'@
  docker cp $claimAFile "${container}:/tmp/concurrent-claim-a.sql"
  docker cp $claimBFile "${container}:/tmp/concurrent-claim-b.sql"
  docker exec $container sh -c 'psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/concurrent-claim-a.sql & p1=$!; psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/concurrent-claim-b.sql & p2=$!; wait $p1; wait $p2'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent different-fingerprint claim failed" }
  $raceClaim = docker exec $container psql -At -U postgres -d clean -c `
    "select count(*) || ':' || (min(fingerprint_hash) in ('race-fingerprint-a','race-fingerprint-b'))::text from public.devices where user_id = '00000000-0000-4000-8000-000000000090'"
  if ($raceClaim.Trim() -ne "1:true") { throw "Different-fingerprint race did not preserve one stable binding: $raceClaim" }

  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d clean -c `
    "insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000092', 'claim-reset@example.invalid'); insert into public.devices (user_id, fingerprint_hash) values ('00000000-0000-4000-8000-000000000092', 'claim-reset-original')" | Out-Null
  Write-Utf8NoBom $claimAFile @'
insert into public.isa88_concurrency_barrier values ('claim-reset', 'claim');
do $$ begin
  for i in 1..500 loop
    exit when (select count(*) from public.isa88_concurrency_barrier where race = 'claim-reset') = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa88_concurrency_barrier where race = 'claim-reset') <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000092', false);
select public.claim_active_device('claim-reset-original');
'@
  Write-Utf8NoBom $claimBFile @'
insert into public.isa88_concurrency_barrier values ('claim-reset', 'reset');
do $$ begin
  for i in 1..500 loop
    exit when (select count(*) from public.isa88_concurrency_barrier where race = 'claim-reset') = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa88_concurrency_barrier where race = 'claim-reset') <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000092', false);
select public.reset_active_device('claim-reset-final');
'@
  docker cp $claimAFile "${container}:/tmp/claim-vs-reset-a.sql"
  docker cp $claimBFile "${container}:/tmp/claim-vs-reset-b.sql"
  docker exec $container sh -c 'psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/claim-vs-reset-a.sql & p1=$!; psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/claim-vs-reset-b.sql & p2=$!; wait $p1; wait $p2'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent claim-vs-reset failed" }
  $claimReset = docker exec $container psql -At -U postgres -d clean -c `
    "select fingerprint_hash from public.devices where user_id = '00000000-0000-4000-8000-000000000092'"
  if ($claimReset.Trim() -ne "claim-reset-final") { throw "Claim-vs-reset final binding is inconsistent: $claimReset" }

  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d clean -c `
    "insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000093', 'reset-race@example.invalid'); insert into public.devices (user_id, fingerprint_hash) values ('00000000-0000-4000-8000-000000000093', 'reset-race-original')" | Out-Null
  Write-Utf8NoBom $claimAFile @'
insert into public.isa88_concurrency_barrier values ('reset-reset', 'a');
do $$ begin
  for i in 1..500 loop
    exit when (select count(*) from public.isa88_concurrency_barrier where race = 'reset-reset') = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa88_concurrency_barrier where race = 'reset-reset') <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000093', false);
select public.reset_active_device('reset-race-a');
'@
  Write-Utf8NoBom $claimBFile @'
insert into public.isa88_concurrency_barrier values ('reset-reset', 'b');
do $$ begin
  for i in 1..500 loop
    exit when (select count(*) from public.isa88_concurrency_barrier where race = 'reset-reset') = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa88_concurrency_barrier where race = 'reset-reset') <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000093', false);
select public.reset_active_device('reset-race-b');
'@
  docker cp $claimAFile "${container}:/tmp/reset-race-a.sql"
  docker cp $claimBFile "${container}:/tmp/reset-race-b.sql"
  docker exec $container sh -c 'psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/reset-race-a.sql >/tmp/reset-a.log 2>&1 & p1=$!; psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/reset-race-b.sql >/tmp/reset-b.log 2>&1 & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; if { [ "$s1" -eq 0 ] && [ "$s2" -ne 0 ]; } || { [ "$s1" -ne 0 ] && [ "$s2" -eq 0 ]; }; then exit 0; fi; cat /tmp/reset-a.log /tmp/reset-b.log; exit 1'
  if ($LASTEXITCODE -ne 0) { throw "Reset-vs-reset did not allow exactly one winner" }
  $resetRace = docker exec $container psql -At -U postgres -d clean -c `
    "select (fingerprint_hash in ('reset-race-a','reset-race-b'))::text || ':' || (last_reset_at is not null)::text from public.devices where user_id = '00000000-0000-4000-8000-000000000093'"
  if ($resetRace.Trim() -ne "true:true") { throw "Reset-vs-reset final binding is inconsistent: $resetRace" }

  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d clean -c `
    "set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000090',false); select public.reset_active_device('race-reset-fingerprint')" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Device reset after concurrent claim failed" }
  $resetClaim = docker exec $container psql -At -U postgres -d clean -c `
    "select fingerprint_hash from public.devices where user_id = '00000000-0000-4000-8000-000000000090'"
  if ($resetClaim.Trim() -ne "race-reset-fingerprint") { throw "Reset did not bind the explicit fingerprint: $resetClaim" }

  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d clean -c `
    "insert into auth.users (id,email) values ('00000000-0000-4000-8000-000000000609','reconciliation-race@example.invalid'); create table public.billing_reconciliation_concurrency_results (participant text primary key, status text not null)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not prepare reconciliation concurrency" }
  Write-Utf8NoBom $claimAFile @'
insert into public.isa88_concurrency_barrier values ('reconciliation-plan', 'a');
do $$ begin
  for i in 1..500 loop
    exit when (select count(*) from public.isa88_concurrency_barrier where race = 'reconciliation-plan') = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa88_concurrency_barrier where race = 'reconciliation-plan') <> 2 then
    raise exception 'barrier_timeout';
  end if;
end $$;
insert into public.billing_reconciliation_concurrency_results
select 'a', status from public.billing_apply_reconciliation_plan(
  '00000000-0000-4000-8000-000000000609','sandbox','scheduled',
  repeat('9',64),repeat('0',64),now(),
  '[{"provider":"polar","environment":"sandbox","resourceType":"subscription","resourceId":"sub-concurrent","userId":"00000000-0000-4000-8000-000000000609","modifiedAt":"2026-08-02T12:00:00Z","snapshotHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","state":"active","grants":[{"capability":"vantare.plan.pro","status":"active","validUntil":"2026-09-02T12:00:00Z"}]}]'::jsonb
);
'@
  Write-Utf8NoBom $claimBFile @'
insert into public.isa88_concurrency_barrier values ('reconciliation-plan', 'b');
do $$ begin
  for i in 1..500 loop
    exit when (select count(*) from public.isa88_concurrency_barrier where race = 'reconciliation-plan') = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa88_concurrency_barrier where race = 'reconciliation-plan') <> 2 then
    raise exception 'barrier_timeout';
  end if;
end $$;
insert into public.billing_reconciliation_concurrency_results
select 'b', status from public.billing_apply_reconciliation_plan(
  '00000000-0000-4000-8000-000000000609','sandbox','scheduled',
  repeat('9',64),repeat('0',64),now(),
  '[{"provider":"polar","environment":"sandbox","resourceType":"subscription","resourceId":"sub-concurrent","userId":"00000000-0000-4000-8000-000000000609","modifiedAt":"2026-08-02T12:00:00Z","snapshotHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","state":"active","grants":[{"capability":"vantare.plan.pro","status":"active","validUntil":"2026-09-02T12:00:00Z"}]}]'::jsonb
);
'@
  docker cp $claimAFile "${container}:/tmp/reconciliation-race-a.sql"
  docker cp $claimBFile "${container}:/tmp/reconciliation-race-b.sql"
  docker exec $container sh -c 'psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/reconciliation-race-a.sql & p1=$!; psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/reconciliation-race-b.sql & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; test "$s1" -eq 0 -a "$s2" -eq 0'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent identical reconciliation failed" }
  $reconciliationRace = docker exec $container psql -At -U postgres -d clean -c `
    "select count(*) filter (where status='applied') || ':' || count(*) filter (where status='unchanged') || ':' || (select count(*) from public.billing_reconciliation_runs where user_id='00000000-0000-4000-8000-000000000609') || ':' || (select count(*) from public.billing_commercial_resources where resource_id='sub-concurrent') from public.billing_reconciliation_concurrency_results"
  if ($reconciliationRace.Trim() -ne "1:1:1:1") { throw "Concurrent reconciliation contract failed: $reconciliationRace" }

  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d clean -c `
    "insert into auth.users (id,email) values ('00000000-0000-4000-8000-000000000811','order-race@example.invalid'); insert into public.profiles (id,email) values ('00000000-0000-4000-8000-000000000811','order-race@example.invalid') on conflict (id) do nothing; create table public.billing_order_concurrency_results (participant text primary key, outcome text not null)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not prepare order ledger concurrency" }
  Write-Utf8NoBom $claimAFile @'
insert into public.isa88_concurrency_barrier values ('order-first-seen', 'a');
do $$ begin
  for i in 1..500 loop
    exit when (select count(*) from public.isa88_concurrency_barrier where race = 'order-first-seen') = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa88_concurrency_barrier where race = 'order-first-seen') <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
insert into public.billing_order_concurrency_results
select 'a', outcome from public.billing_record_order_snapshot(
  'sandbox','order-first-seen-race','00000000-0000-4000-8000-000000000811','product-lifetime','checkout-race',
  'paid',true,3000,'eur',0,'2026-08-02T12:00:00Z',repeat('d',64)
);
'@
  Write-Utf8NoBom $claimBFile @'
insert into public.isa88_concurrency_barrier values ('order-first-seen', 'b');
do $$ begin
  for i in 1..500 loop
    exit when (select count(*) from public.isa88_concurrency_barrier where race = 'order-first-seen') = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa88_concurrency_barrier where race = 'order-first-seen') <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
insert into public.billing_order_concurrency_results
select 'b', outcome from public.billing_record_order_snapshot(
  'sandbox','order-first-seen-race','00000000-0000-4000-8000-000000000811','product-lifetime','checkout-race',
  'paid',true,3000,'eur',0,'2026-08-02T12:00:00Z',repeat('d',64)
);
'@
  docker cp $claimAFile "${container}:/tmp/order-race-a.sql"
  docker cp $claimBFile "${container}:/tmp/order-race-b.sql"
  docker exec $container sh -c 'psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/order-race-a.sql & p1=$!; psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/order-race-b.sql & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; test "$s1" -eq 0 -a "$s2" -eq 0'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent first-seen order snapshots failed" }
  $orderRace = docker exec $container psql -At -U postgres -d clean -c `
    "select count(*) filter (where outcome='apply') || ':' || count(*) filter (where outcome='duplicate') || ':' || (select count(*) from public.billing_orders where environment='sandbox' and provider_order_id='order-first-seen-race') from public.billing_order_concurrency_results"
  if ($orderRace.Trim() -ne "1:1:1") { throw "Concurrent first-seen order contract failed: $orderRace" }

  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d clean -c `
    "insert into auth.users (id,email) values ('00000000-0000-4000-8000-000000000810','lifecycle-race@example.invalid'); insert into public.profiles (id,email) values ('00000000-0000-4000-8000-000000000810','lifecycle-race@example.invalid') on conflict (id) do nothing; select * from public.billing_apply_resource_snapshot('polar','sandbox','subscription','sub-lifecycle-race','00000000-0000-4000-8000-000000000810','2026-08-01T13:00:00Z',repeat('a',64),'active','[{`"capability`":`"vantare.plan.pro`",`"status`":`"active`",`"validUntil`":`"2026-08-02T13:00:00Z`"}]'::jsonb); select * from public.billing_apply_subscription_lifecycle('00000000-0000-4000-8000-000000000810','sandbox','sub-lifecycle-race','product-pro','active','2026-07-02T13:00:00Z','2026-08-02T13:00:00Z','2026-08-02T13:00:00Z',false,'2026-08-01T13:00:00Z',repeat('a',64),'close',null,null,'2026-08-01T14:00:00Z',array['vantare.plan.pro']); select * from public.billing_apply_resource_snapshot('polar','sandbox','subscription','sub-lifecycle-race','00000000-0000-4000-8000-000000000810','2026-08-02T13:05:00Z',repeat('b',64),'past_due','[{`"capability`":`"vantare.plan.pro`",`"status`":`"revoked`",`"validUntil`":`"2026-08-02T13:00:00Z`"}]'::jsonb); create table public.billing_lifecycle_concurrency_results (participant text primary key, outcome text not null)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not prepare subscription lifecycle concurrency" }
  Write-Utf8NoBom $claimAFile @'
insert into public.isa88_concurrency_barrier values ('subscription-lifecycle', 'a');
do $$ begin
  for i in 1..500 loop
    exit when (select count(*) from public.isa88_concurrency_barrier where race = 'subscription-lifecycle') = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa88_concurrency_barrier where race = 'subscription-lifecycle') <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
insert into public.billing_lifecycle_concurrency_results
select 'a', outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000810','sandbox','sub-lifecycle-race','product-pro','past_due',
  '2026-07-02T13:00:00Z','2026-08-02T13:00:00Z','2026-08-02T13:00:00Z',false,
  '2026-08-02T13:05:00Z',repeat('b',64),'open','2026-08-02T13:05:00Z','2026-08-02T13:00:00Z','2026-08-02T14:00:00Z',array['vantare.plan.pro']
);
'@
  Write-Utf8NoBom $claimBFile @'
insert into public.isa88_concurrency_barrier values ('subscription-lifecycle', 'b');
do $$ begin
  for i in 1..500 loop
    exit when (select count(*) from public.isa88_concurrency_barrier where race = 'subscription-lifecycle') = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa88_concurrency_barrier where race = 'subscription-lifecycle') <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
insert into public.billing_lifecycle_concurrency_results
select 'b', outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000810','sandbox','sub-lifecycle-race','product-pro','past_due',
  '2026-07-02T13:00:00Z','2026-08-02T13:00:00Z','2026-08-02T13:00:00Z',false,
  '2026-08-02T13:05:00Z',repeat('b',64),'open','2026-08-02T13:05:00Z','2026-08-02T13:00:00Z','2026-08-02T14:00:00Z',array['vantare.plan.pro']
);
'@
  docker cp $claimAFile "${container}:/tmp/lifecycle-race-a.sql"
  docker cp $claimBFile "${container}:/tmp/lifecycle-race-b.sql"
  docker exec $container sh -c 'psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/lifecycle-race-a.sql & p1=$!; psql -q -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/lifecycle-race-b.sql & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; test "$s1" -eq 0 -a "$s2" -eq 0'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent identical subscription lifecycle failed" }
  $lifecycleRace = docker exec $container psql -At -U postgres -d clean -c `
    "select count(*) filter (where outcome='applied') || ':' || (select count(*) from public.billing_subscription_recovery_cycles where subscription_id='sub-lifecycle-race') || ':' || (select count(*) from public.billing_access_grants where source_type='subscription_recovery' and metadata->>'subscription_id'='sub-lifecycle-race') from public.billing_lifecycle_concurrency_results"
  if ($lifecycleRace.Trim() -ne "2:1:1") { throw "Concurrent lifecycle contract failed: $lifecycleRace" }

  Initialize-Database "upgrade"
  $authHardeningMigration = "20260802020000_supabase_auth_license_hardening.sql"
  $commercialProjectionMigration = "20260802100000_billing_commercial_projection.sql"
  $subscriptionLifecycleMigration = "20260802110000_billing_subscription_lifecycle.sql"
  $orderRefundLedgerMigration = "20260802120000_billing_order_refund_ledger.sql"
  $operationalAccessMigration = "20260803140000_operational_access_assignments.sql"
  $raceScheduleMigration = "20260808000000_race_schedule_publications.sql"
  foreach ($migration in $migrations | Where-Object Name -notin @($authHardeningMigration, $commercialProjectionMigration, $subscriptionLifecycleMigration, $orderRefundLedgerMigration, $operationalAccessMigration, $raceScheduleMigration)) {
    Invoke-Psql "upgrade" "/tmp/$($migration.Name)"
  }
  Invoke-Psql "upgrade" "/tmp/$authHardeningMigration"
  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d upgrade -c `
    "insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000701','bounded-past-due@example.invalid'),('00000000-0000-4000-8000-000000000702','unproven-past-due@example.invalid'),('00000000-0000-4000-8000-000000000703','legacy-pro@example.invalid'); insert into public.user_entitlements (id,user_id,product_key,status,source,expires_at,updated_at) values ('00000000-0000-4000-8000-000000000701','00000000-0000-4000-8000-000000000701','bundle','past_due','polar',now() + interval '30 days',now() - interval '1 day'),('00000000-0000-4000-8000-000000000702','00000000-0000-4000-8000-000000000702','bundle','past_due','polar',null,now() - interval '1 hour'),('00000000-0000-4000-8000-000000000703','00000000-0000-4000-8000-000000000703','vantare_pro','active','polar',now() + interval '30 days',now() - interval '1 hour')" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not seed legacy past_due upgrade cases" }
  Invoke-Psql "upgrade" "/tmp/$commercialProjectionMigration"
  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d upgrade -c `
    "insert into auth.users (id,email) values ('00000000-0000-4000-8000-000000000711','legacy-active-sub@example.invalid'),('00000000-0000-4000-8000-000000000712','legacy-past-due-sub@example.invalid'); insert into public.profiles (id,email) values ('00000000-0000-4000-8000-000000000711','legacy-active-sub@example.invalid'),('00000000-0000-4000-8000-000000000712','legacy-past-due-sub@example.invalid') on conflict (id) do nothing; insert into public.billing_commercial_resources (user_id,provider,environment,resource_type,resource_id,remote_state,remote_modified_at,snapshot_hash) values ('00000000-0000-4000-8000-000000000711','polar','sandbox','subscription','legacy-active-sub','active',now()-interval '1 hour',repeat('a',64)),('00000000-0000-4000-8000-000000000712','polar','sandbox','subscription','legacy-past-due-sub','past_due',now()-interval '1 hour',repeat('b',64)); insert into public.billing_subscriptions (user_id,provider,provider_subscription_id,provider_product_id,status,current_period_end,updated_at) values ('00000000-0000-4000-8000-000000000711','polar','legacy-active-sub','product-pro','active',now()+interval '30 days',now()-interval '1 hour'),('00000000-0000-4000-8000-000000000712','polar','legacy-past-due-sub','product-pro','past_due',now()+interval '30 days',now()-interval '1 hour'); insert into public.billing_access_grants (user_id,provider,environment,source_type,source_id,capability,status,valid_until,resource_modified_at,snapshot_hash) values ('00000000-0000-4000-8000-000000000711','polar','sandbox','subscription','legacy-active-sub','vantare.plan.pro','active',now()+interval '30 days',now()-interval '1 hour',repeat('a',64)),('00000000-0000-4000-8000-000000000712','polar','sandbox','subscription','legacy-past-due-sub','vantare.plan.pro','active',now()+interval '30 days',now()-interval '1 hour',repeat('b',64))" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not seed legacy subscription lifecycle cases" }
  Invoke-Psql "upgrade" "/tmp/$subscriptionLifecycleMigration"
  Invoke-Psql "upgrade" "/tmp/$orderRefundLedgerMigration"
  Invoke-Psql "upgrade" "/tmp/$operationalAccessMigration"
  Invoke-Psql "upgrade" "/tmp/$raceScheduleMigration"
  Assert-PgTap "upgrade" "/tmp/hardening-test.sql" "1\.\.48" "Upgrade hardening"
  Assert-PgTap "upgrade" "/tmp/inbox-test.sql" "1\.\.54" "Upgrade inbox"
  Assert-PgTap "upgrade" "/tmp/commercial-projection-test.sql" "1\.\.43" "Upgrade commercial projection"
  Assert-PgTap "upgrade" "/tmp/commercial-legacy-upgrade-test.sql" "1\.\.11" "Upgrade legacy commercial projection"
  Assert-PgTap "upgrade" "/tmp/reconciliation-test.sql" "1\.\.17" "Upgrade reconciliation"
  Assert-PgTap "upgrade" "/tmp/subscription-lifecycle-test.sql" "1\.\.51" "Upgrade subscription lifecycle"
  Assert-PgTap "upgrade" "/tmp/subscription-lifecycle-upgrade-test.sql" "1\.\.8" "Upgrade subscription lifecycle migration"
  Assert-PgTap "upgrade" "/tmp/order-refund-ledger-test.sql" "1\.\.37" "Upgrade order refund ledger"
  Assert-PgTap "upgrade" "/tmp/observability-test.sql" "1\.\.20" "Upgrade billing observability"
  Assert-PgTap "upgrade" "/tmp/operational-access-test.sql" "1\.\.56" "Upgrade operational access"

  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d clean -c `
    "insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000091', 'restore-sentinel@example.invalid'); insert into public.user_entitlements (user_id, product_key, status, source) values ('00000000-0000-4000-8000-000000000091', 'restore_sentinel', 'revoked', 'restore-test')" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not create restore sentinel" }

  $started = Get-Date
  docker exec $container pg_dump -U postgres -d clean -Fc -f /tmp/clean.dump
  $dumpExit = $LASTEXITCODE
  if ($dumpExit -ne 0) { throw "pg_dump failed with exit code $dumpExit" }
  docker exec $container createdb -U postgres restore_drill
  if ($LASTEXITCODE -ne 0) { throw "Could not create restore drill database" }
  docker exec $container pg_restore --exit-on-error -U postgres -d restore_drill --no-owner /tmp/clean.dump
  $restoreExit = $LASTEXITCODE
  if ($restoreExit -ne 0) { throw "pg_restore failed with exit code $restoreExit" }
  docker exec $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d restore_drill -f "/tmp/dblink-helper.sql" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not recreate the disposable dblink test helper after restore" }
  Assert-PgTap "restore_drill" "/tmp/hardening-test.sql" "1\.\.48" "Restored database hardening"
  Assert-PgTap "restore_drill" "/tmp/inbox-test.sql" "1\.\.54" "Restored database inbox"
  Assert-PgTap "restore_drill" "/tmp/commercial-projection-test.sql" "1\.\.43" "Restored database commercial projection"
  Assert-PgTap "restore_drill" "/tmp/reconciliation-test.sql" "1\.\.17" "Restored database reconciliation"
  Assert-PgTap "restore_drill" "/tmp/subscription-lifecycle-test.sql" "1\.\.51" "Restored database subscription lifecycle"
  Assert-PgTap "restore_drill" "/tmp/order-refund-ledger-test.sql" "1\.\.37" "Restored database order refund ledger"
  Assert-PgTap "restore_drill" "/tmp/observability-test.sql" "1\.\.20" "Restored database billing observability"
  Assert-PgTap "restore_drill" "/tmp/operational-access-test.sql" "1\.\.56" "Restored database operational access"
  $restored = docker exec $container psql -At -v ON_ERROR_STOP=1 -U postgres -d restore_drill -c `
    "select (select count(*) = 1 from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000091' and product_key = 'restore_sentinel') and (select relrowsecurity from pg_class where oid = 'public.user_entitlements'::regclass) and not has_function_privilege('anon','public.read_account_entitlements()','execute')"
  $restoredExit = $LASTEXITCODE
  if ($restoredExit -ne 0 -or $restored.Trim() -ne "t") { throw "Restored database sentinel/RLS/grant validation failed: $restored" }

  docker exec $container sh -c "head -c 128 /tmp/clean.dump > /tmp/truncated.dump; cp /tmp/clean.dump /tmp/corrupt.dump; printf BROKE | dd of=/tmp/corrupt.dump bs=1 count=5 conv=notrunc 2>/dev/null"
  if ($LASTEXITCODE -ne 0) { throw "Could not prepare corrupt restore fixtures" }
  foreach ($fixture in @("truncated", "corrupt")) {
    $database = "restore_failure_$fixture"
    docker exec $container createdb -U postgres $database
    if ($LASTEXITCODE -ne 0) { throw "Could not create negative restore database $database" }
    $savedErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    docker exec $container pg_restore --exit-on-error -U postgres -d $database "/tmp/$fixture.dump" 2>$null
    $failedRestoreExit = $LASTEXITCODE
    $ErrorActionPreference = $savedErrorAction
    if ($failedRestoreExit -eq 0) { throw "$fixture restore unexpectedly passed" }
  }
  $elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds, 2)
  Write-Output "Supabase hardening: clean/upgrade/restore 48 hardening + 54 inbox + 43 commercial projection + 17 reconciliation + 51 subscription lifecycle + 37 order/refund ledger + 20 observability + 56 operational access pgTAP PASS; legacy upgrade 11 + 8 lifecycle pgTAP PASS; inbox, device, reconciliation, subscription lifecycle and first-seen order concurrency PASS; restore sentinel/RLS/grants plus truncated/corrupt fail-closed PASS (${elapsed}s)"
} finally {
  docker rm -f $container 2>$null | Out-Null
  if (Test-Path $bootstrap) { Remove-Item -LiteralPath $bootstrap -Force }
  if (Test-Path $dblinkHelper) { Remove-Item -LiteralPath $dblinkHelper -Force }
  if (Test-Path $claimFile) { Remove-Item -LiteralPath $claimFile -Force }
  if (Test-Path $claimAFile) { Remove-Item -LiteralPath $claimAFile -Force }
  if (Test-Path $claimBFile) { Remove-Item -LiteralPath $claimBFile -Force }
}
