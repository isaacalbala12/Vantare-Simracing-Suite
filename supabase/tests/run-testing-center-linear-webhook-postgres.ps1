param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$container = "vantare-testing-linear-webhook-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$password = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$raceA = Join-Path $env:TEMP "$container-race-a.sql"
$raceB = Join-Path $env:TEMP "$container-race-b.sql"
$linearMigration = "20260803100000_testing_center_linear_outbox.sql"
$webhookMigration = "20260803110000_testing_center_linear_webhook.sql"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Invoke-PsqlFile([string]$Database, [string]$File) {
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database -f $File | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $Database $File" }
}

function Assert-PgTap([string]$Database, [string]$File, [string]$Plan, [string]$Label) {
  $tap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $Database -f $File | Out-String
  if ($LASTEXITCODE -ne 0 -or $tap -match "(?m)^not ok" -or $tap -notmatch $Plan) {
    throw "$Label pgTAP failed:`n$tap"
  }
}

function Assert-ScriptFails([string]$Database, [string]$File, [string]$Expected) {
  $saved = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database -f $File 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $saved
  if ($exitCode -eq 0 -or $output -notmatch [regex]::Escape($Expected)) {
    throw "Script did not fail with ${Expected}:`n$output"
  }
}

try {
  docker run --rm -d --name $container -e "POSTGRES_PASSWORD=$password" $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not start disposable PostgreSQL" }
  $ready = $false
  for ($attempt = 0; $attempt -lt 240; $attempt++) {
    $saved = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $logs = docker logs $container 2>&1 | Out-String
    $logsRead = $LASTEXITCODE -eq 0
    docker exec $container pg_isready -U postgres -d postgres 2>$null | Out-Null
    $isReady = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $saved
    if ($logsRead -and $logs -match "PostgreSQL init process complete" -and $isReady) {
      $ready = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Disposable PostgreSQL did not become ready" }

  Write-Utf8NoBom $bootstrap @'
do $$ begin create role anon noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role noinherit bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgtap;
create extension if not exists pgcrypto;
create table if not exists auth.users(
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
'@

  Write-Utf8NoBom $raceA @'
insert into public.isa240_race_barrier values ('a');
do $$ begin
  for i in 1..1000 loop
    exit when (select count(*) from public.isa240_race_barrier) = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa240_race_barrier) <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
insert into public.isa240_race_results
select 'a', delivery_status from public.testing_center_reconcile_linear_webhook(
  'aaaaaaaa-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',
  'Issue','update',1785758402000,'2026-08-03T12:00:02Z',
  '55555555-5555-4555-8555-555555555555',repeat('a',64));
'@
  Write-Utf8NoBom $raceB @'
insert into public.isa240_race_barrier values ('b');
do $$ begin
  for i in 1..1000 loop
    exit when (select count(*) from public.isa240_race_barrier) = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa240_race_barrier) <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
insert into public.isa240_race_results
select 'b', delivery_status from public.testing_center_reconcile_linear_webhook(
  'bbbbbbbb-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',
  'Issue','update',1785758403000,'2026-08-03T12:00:03Z',
  '66666666-6666-4666-8666-666666666666',repeat('b',64));
'@

  Write-Output "[1/7] PostgreSQL ready; preparing one reusable pre-Linear base"
  docker exec $container createdb -U postgres testing_webhook_base
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp $raceA "${container}:/tmp/race-a.sql"
  docker cp $raceB "${container}:/tmp/race-b.sql"
  $baseMigrations = Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") |
    Where-Object { $_.Name -lt $linearMigration } | Sort-Object Name
  foreach ($migration in $baseMigrations) {
    docker cp $migration.FullName "${container}:/tmp/$($migration.Name)"
  }
  foreach ($path in @(
    "supabase\migrations\$linearMigration",
    "supabase\migrations\$webhookMigration",
    "supabase\rollbacks\20260803110000_testing_center_linear_webhook.down.sql",
    "supabase\tests\testing_center_linear_outbox_upgrade_seed.sql",
    "supabase\tests\testing_center_linear_webhook.test.sql"
  )) {
    docker cp (Join-Path $root $path) "${container}:/tmp/$([IO.Path]::GetFileName($path))"
  }
  Invoke-PsqlFile "testing_webhook_base" "/tmp/bootstrap.sql"
  foreach ($migration in $baseMigrations) {
    Invoke-PsqlFile "testing_webhook_base" "/tmp/$($migration.Name)"
  }
  docker exec $container createdb -U postgres -T testing_webhook_base testing_webhook
  docker exec $container createdb -U postgres -T testing_webhook_base testing_webhook_clean

  Write-Output "[2/7] Checking clean installation"
  Invoke-PsqlFile "testing_webhook_clean" "/tmp/$linearMigration"
  Invoke-PsqlFile "testing_webhook_clean" "/tmp/$webhookMigration"
  $clean = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_webhook_clean -c `
    "select count(*) || ':' || count(*) from public.testing_center_linear_issue_bindings cross join public.testing_center_linear_webhook_deliveries"
  if ($LASTEXITCODE -ne 0 -or $clean.Trim() -ne "0:0") { throw "Clean install failed: $clean" }

  Write-Output "[3/7] Applying upgrade and running 27 pgTAP assertions"
  Invoke-PsqlFile "testing_webhook" "/tmp/testing_center_linear_outbox_upgrade_seed.sql"
  Invoke-PsqlFile "testing_webhook" "/tmp/$linearMigration"
  Invoke-PsqlFile "testing_webhook" "/tmp/$webhookMigration"
  Assert-PgTap "testing_webhook" "/tmp/testing_center_linear_webhook.test.sql" "1\.\.27" "Initial Linear webhook"

  Write-Output "[4/7] Proving rollback refuses to erase webhook history"
  docker exec $container createdb -U postgres -T testing_webhook testing_webhook_guard
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_webhook_guard -c @"
update public.testing_center_effect_outbox set state='dry_run_completed'
where technical_issue_id='issue_legacy_pending' and effect_type='linear_issue_create';
select public.testing_center_bind_linear_issue(
  (select effect_id from public.testing_center_effect_outbox
   where technical_issue_id='issue_legacy_pending' and effect_type='linear_issue_create'),
  '44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','isa240-guard');
"@ | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not seed rollback guard" }
  Assert-ScriptFails "testing_webhook_guard" "/tmp/20260803110000_testing_center_linear_webhook.down.sql" `
    "testing_center_linear_webhook_rollback_has_history"

  Write-Output "[5/7] Checking zero-history rollback preserves ISA-239"
  Invoke-PsqlFile "testing_webhook" "/tmp/20260803110000_testing_center_linear_webhook.down.sql"
  $rollback = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_webhook -c `
    "select (to_regclass('public.testing_center_linear_webhook_deliveries') is null)::int || ':' || (to_regclass('public.testing_center_issue_destinations') is not null)::int || ':' || has_function_privilege('service_role','public.testing_center_claim_linear_effect(text,text,integer)','EXECUTE')::int"
  if ($LASTEXITCODE -ne 0 -or $rollback.Trim() -ne "1:1:1") {
    throw "Rollback did not preserve ISA-239 exactly: $rollback"
  }

  Write-Output "[6/7] Reapplying and rerunning 27 pgTAP assertions"
  Invoke-PsqlFile "testing_webhook" "/tmp/$webhookMigration"
  Assert-PgTap "testing_webhook" "/tmp/testing_center_linear_webhook.test.sql" "1\.\.27" "Reapplied Linear webhook"

  Write-Output "[7/7] Running a real two-process out-of-order race"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_webhook -c @"
update public.testing_center_effect_outbox set state='dry_run_completed'
where technical_issue_id='issue_legacy_pending' and effect_type='linear_issue_create';
select public.testing_center_bind_linear_issue(
  (select effect_id from public.testing_center_effect_outbox
   where technical_issue_id='issue_legacy_pending' and effect_type='linear_issue_create'),
  '44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','isa240-race');
select public.testing_center_upsert_linear_state_mapping(
  '33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555',
  'awaiting_owner','isa240-race',true);
select public.testing_center_upsert_linear_state_mapping(
  '33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666',
  'needs_changes','isa240-race',true);
create table public.isa240_race_barrier(participant text primary key);
create table public.isa240_race_results(participant text primary key, delivery_status text not null);
"@ | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not seed reconciliation race" }
  docker exec $container sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_webhook -f /tmp/race-a.sql >/tmp/race-a.log 2>&1 & p1=$!; psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_webhook -f /tmp/race-b.sql >/tmp/race-b.log 2>&1 & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; if [ "$s1" -eq 0 ] && [ "$s2" -eq 0 ]; then exit 0; fi; cat /tmp/race-a.log /tmp/race-b.log; exit 1'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent reconciliation race failed" }
  $race = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_webhook -c `
    "select r.observed_state || ':' || r.last_webhook_timestamp_ms || ':' || count(d.*) || ':' || count(*) filter(where d.outcome='pending') from public.testing_center_linear_reconciliations r join public.testing_center_linear_webhook_deliveries d using(external_issue_id) group by r.observed_state,r.last_webhook_timestamp_ms"
  if ($LASTEXITCODE -ne 0 -or $race.Trim() -ne "needs_changes:1785758403000:2:0") {
    throw "Out-of-order race was not deterministic: $race"
  }

  Write-Output "Testing Center Linear webhook: clean install + 27/27 + history rollback refusal + exact rollback + reapply 27/27 + deterministic two-process order race PASS"
} finally {
  $ErrorActionPreference = "Continue"
  docker rm -f $container 2>$null | Out-Null
  Remove-Item -LiteralPath $bootstrap, $raceA, $raceB -Force -ErrorAction SilentlyContinue
}
