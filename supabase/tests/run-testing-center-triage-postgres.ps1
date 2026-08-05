param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$container = "vantare-testing-triage-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$password = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$raceSeed = Join-Path $env:TEMP "$container-race-seed.sql"
$raceCallA = Join-Path $env:TEMP "$container-race-a.sql"
$raceCallB = Join-Path $env:TEMP "$container-race-b.sql"
$coreMigration = "20260802130100_testing_center_core.sql"
$accessMigration = "20260802140000_testing_center_access.sql"
$reportMigration = "20260802150000_testing_center_report_submission.sql"
$triageMigration = "20260802160000_testing_center_triage_outbox.sql"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Invoke-PsqlFile([string]$File) {
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_triage -f $File | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $File" }
}

function Assert-PgTap([string]$File, [string]$Plan, [string]$Label) {
  $tap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_triage -f $File | Out-String
  if ($LASTEXITCODE -ne 0 -or $tap -match "(?m)^not ok" -or $tap -notmatch $Plan) {
    throw "$Label pgTAP failed:`n$tap"
  }
}

try {
  docker run --rm -d --name $container -e "POSTGRES_PASSWORD=$password" $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not start disposable PostgreSQL" }

  $ready = $false
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $savedErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $logs = docker logs $container 2>&1 | Out-String
    $logsRead = $LASTEXITCODE -eq 0
    docker exec $container pg_isready -U postgres -d postgres 2>$null | Out-Null
    $isReady = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $savedErrorAction
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
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
'@

  Write-Utf8NoBom $raceSeed @'
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000590', 'triage-race@example.invalid');
set role service_role;
insert into public.testing_center_reports (
  report_id, reporter_id, reporter_user_id, reporter_role, channel, state
) values
  ('race_report_a', 'triage-race', '00000000-0000-4000-8000-000000000590', 'primary_tester', 'nightly', 'submitted'),
  ('race_report_b', 'triage-race', '00000000-0000-4000-8000-000000000590', 'primary_tester', 'nightly', 'submitted');
insert into public.testing_center_report_payloads (
  report_id, action_text, expected_text, observed_text, context_text,
  app_version, os_family, os_version, module,
  include_diagnostic, include_logs, diagnostic_document,
  diagnostic_transport_digest
) values
  ('race_report_a', 'Open race settings', 'Settings remain open', 'Settings close', 'Race A',
   'v0.4.7-nightly', 'windows', 'Windows 11 24H2', 'settings', false, false, null, null),
  ('race_report_b', 'OPEN  RACE SETTINGS', 'SETTINGS REMAIN OPEN', 'SETTINGS CLOSE', 'Race B',
   'v0.4.8-nightly', 'windows', 'Windows 11 24H2', 'settings', false, false, null, null);
insert into public.testing_center_report_events (
  event_id, report_id, actor_id, actor_user_id, actor_role, operation_digest
) values
  ('race_event_a', 'race_report_a', 'triage-race', '00000000-0000-4000-8000-000000000590', 'primary_tester', repeat('a', 64)),
  ('race_event_b', 'race_report_b', 'triage-race', '00000000-0000-4000-8000-000000000590', 'primary_tester', repeat('b', 64));
reset role;
create table public.isa222_concurrency_barrier (participant text primary key);
create table public.isa222_concurrency_results (
  participant text primary key,
  report_id text not null,
  triage_state text not null,
  technical_issue_id text not null,
  effect_id text not null
);
grant insert, select on table public.isa222_concurrency_results to service_role;
'@

  Write-Utf8NoBom $raceCallA @'
insert into public.isa222_concurrency_barrier values ('a');
do $$ begin
  for i in 1..1000 loop
    exit when (select count(*) from public.isa222_concurrency_barrier) = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa222_concurrency_barrier) <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
set role service_role;
insert into public.isa222_concurrency_results
select 'a', result_report_id, result_triage_state, result_technical_issue_id, result_effect_id
from public.testing_center_triage_report('race_report_a');
'@

  Write-Utf8NoBom $raceCallB @'
insert into public.isa222_concurrency_barrier values ('b');
do $$ begin
  for i in 1..1000 loop
    exit when (select count(*) from public.isa222_concurrency_barrier) = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa222_concurrency_barrier) <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
set role service_role;
insert into public.isa222_concurrency_results
select 'b', result_report_id, result_triage_state, result_technical_issue_id, result_effect_id
from public.testing_center_triage_report('race_report_b');
'@

  docker exec $container createdb -U postgres testing_triage
  if ($LASTEXITCODE -ne 0) { throw "Could not create disposable test database" }

  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp $raceSeed "${container}:/tmp/triage-race-seed.sql"
  docker cp $raceCallA "${container}:/tmp/triage-race-a.sql"
  docker cp $raceCallB "${container}:/tmp/triage-race-b.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_core.test.sql") "${container}:/tmp/testing-center-core.test.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_access.test.sql") "${container}:/tmp/testing-center-access.test.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_report_submission.test.sql") "${container}:/tmp/testing-center-report.test.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_triage_outbox.test.sql") "${container}:/tmp/testing-center-triage.test.sql"
  docker cp (Join-Path $root "supabase\rollbacks\20260802160000_testing_center_triage_outbox.down.sql") "${container}:/tmp/testing-center-triage.down.sql"

  $coreMigrations = Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") |
    Where-Object { $_.Name -le $coreMigration } |
    Sort-Object Name
  foreach ($migration in $coreMigrations) {
    docker cp $migration.FullName "${container}:/tmp/$($migration.Name)"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy migration $($migration.Name)" }
  }
  foreach ($migrationName in @($accessMigration, $reportMigration, $triageMigration)) {
    docker cp (Join-Path $root "supabase\migrations\$migrationName") "${container}:/tmp/$migrationName"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy migration $migrationName" }
  }

  Invoke-PsqlFile "/tmp/bootstrap.sql"
  foreach ($migration in $coreMigrations) { Invoke-PsqlFile "/tmp/$($migration.Name)" }
  Assert-PgTap "/tmp/testing-center-core.test.sql" "1\.\.72" "Core before triage"
  Invoke-PsqlFile "/tmp/$accessMigration"
  Assert-PgTap "/tmp/testing-center-access.test.sql" "1\.\.56" "Access before triage"
  Invoke-PsqlFile "/tmp/$reportMigration"
  Assert-PgTap "/tmp/testing-center-report.test.sql" "1\.\.55" "Report before triage"
  Invoke-PsqlFile "/tmp/$triageMigration"
  Assert-PgTap "/tmp/testing-center-triage.test.sql" "1\.\.40" "Initial triage up"

  Invoke-PsqlFile "/tmp/testing-center-triage.down.sql"
  $rollbackState = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_triage -c `
    "select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('testing_center_triage_results','testing_center_issue_occurrences','testing_center_effect_outbox')) || ':' || (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='testing_center_triage_report') || ':' || (select count(*) from pg_policies where schemaname='public' and tablename like 'testing_center_%') || ':' || (select count(*) from information_schema.role_table_grants where table_schema='public' and table_name like 'testing_center_%' and grantee='authenticated' and privilege_type='SELECT') || ':' || (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'testing_center_%')"
  if ($LASTEXITCODE -ne 0 -or $rollbackState.Trim() -ne "0:0:6:6:14") {
    throw "Triage rollback did not restore the report state: $rollbackState"
  }
  Assert-PgTap "/tmp/testing-center-report.test.sql" "1\.\.55" "Report after triage rollback"

  Invoke-PsqlFile "/tmp/$triageMigration"
  Assert-PgTap "/tmp/testing-center-triage.test.sql" "1\.\.40" "Second triage up"

  Invoke-PsqlFile "/tmp/triage-race-seed.sql"
  docker exec $container sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_triage -f /tmp/triage-race-a.sql >/tmp/race-a.log 2>&1 & p1=$!; psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_triage -f /tmp/triage-race-b.sql >/tmp/race-b.log 2>&1 & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; if [ "$s1" -eq 0 ] && [ "$s2" -eq 0 ]; then exit 0; fi; cat /tmp/race-a.log /tmp/race-b.log; exit 1'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent exact-compatible triage failed" }
  $raceResult = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_triage -c `
    "select count(*) || ':' || count(distinct technical_issue_id) || ':' || count(distinct effect_id) || ':' || (select count(*) from public.testing_center_technical_issues) || ':' || (select count(*) from public.testing_center_issue_occurrences) || ':' || (select count(*) from public.testing_center_effect_outbox) from public.isa222_concurrency_results"
  if ($LASTEXITCODE -ne 0 -or $raceResult.Trim() -ne "2:1:1:1:2:1") {
    throw "Concurrent triage was not exactly-once: $raceResult"
  }

  Write-Output "Testing Center triage: core 72 + access 56 + report 55 + triage 40 + down/report 55 + up/triage 40 pgTAP, 100-repeat gate and concurrent one-reservation PASS"
} finally {
  $ErrorActionPreference = "Continue"
  docker rm -f $container 2>$null | Out-Null
  Remove-Item -LiteralPath $bootstrap, $raceSeed, $raceCallA, $raceCallB -Force -ErrorAction SilentlyContinue
}
