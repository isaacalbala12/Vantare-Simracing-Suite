param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$container = "vantare-testing-report-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$password = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$raceSeed = Join-Path $env:TEMP "$container-race-seed.sql"
$raceCallA = Join-Path $env:TEMP "$container-race-a.sql"
$raceCallB = Join-Path $env:TEMP "$container-race-b.sql"
$coreMigration = "20260802130100_testing_center_core.sql"
$accessMigration = "20260802140000_testing_center_access.sql"
$reportMigration = "20260802150000_testing_center_report_submission.sql"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Invoke-PsqlFile([string]$File) {
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_report -f $File | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $File" }
}

function Assert-PgTap([string]$File, [string]$Plan, [string]$Label) {
  $tap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_report -f $File | Out-String
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
  ('00000000-0000-4000-8000-000000000490', 'report-race@example.invalid');
set role service_role;
insert into public.testing_center_memberships (user_id, actor_id, role)
values ('00000000-0000-4000-8000-000000000490', 'report-race', 'primary_tester');
reset role;
create table public.isa218_concurrency_barrier (participant text primary key);
create table public.isa218_concurrency_results (
  participant text primary key,
  report_id text not null,
  idempotent boolean not null
);
grant insert, select on table public.isa218_concurrency_results to authenticated;
'@
  Write-Utf8NoBom $raceCallA @'
insert into public.isa218_concurrency_barrier values ('a');
do $$ begin
  for i in 1..1000 loop
    exit when (select count(*) from public.isa218_concurrency_barrier) = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa218_concurrency_barrier) <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000490', false);
insert into public.isa218_concurrency_results
select 'a', report_id, idempotent
from public.testing_center_submit_report(
  'testing-center.v1', 'nightly', 'Opened the settings panel',
  'The settings panel should remain visible',
  'The settings panel closed unexpectedly', null,
  'v0.4.0-nightly', 'windows', 'Windows 11 24H2', 'hub',
  false, false, null, null, 'report-race-key'
);
'@
  Write-Utf8NoBom $raceCallB @'
insert into public.isa218_concurrency_barrier values ('b');
do $$ begin
  for i in 1..1000 loop
    exit when (select count(*) from public.isa218_concurrency_barrier) = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa218_concurrency_barrier) <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000490', false);
insert into public.isa218_concurrency_results
select 'b', report_id, idempotent
from public.testing_center_submit_report(
  'testing-center.v1', 'nightly', 'Opened the settings panel',
  'The settings panel should remain visible',
  'The settings panel closed unexpectedly', null,
  'v0.4.0-nightly', 'windows', 'Windows 11 24H2', 'hub',
  false, false, null, null, 'report-race-key'
);
'@

  docker exec $container createdb -U postgres testing_report
  if ($LASTEXITCODE -ne 0) { throw "Could not create disposable test database" }
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp $raceSeed "${container}:/tmp/report-race-seed.sql"
  docker cp $raceCallA "${container}:/tmp/report-race-a.sql"
  docker cp $raceCallB "${container}:/tmp/report-race-b.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_core.test.sql") "${container}:/tmp/testing-center-core.test.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_access.test.sql") "${container}:/tmp/testing-center-access.test.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_report_submission.test.sql") "${container}:/tmp/testing-center-report.test.sql"
  docker cp (Join-Path $root "supabase\rollbacks\20260802150000_testing_center_report_submission.down.sql") "${container}:/tmp/testing-center-report.down.sql"

  $coreMigrations = Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") |
    Where-Object { $_.Name -le $coreMigration } |
    Sort-Object Name
  foreach ($migration in $coreMigrations) {
    docker cp $migration.FullName "${container}:/tmp/$($migration.Name)"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy migration $($migration.Name)" }
  }
  foreach ($migrationName in @($accessMigration, $reportMigration)) {
    docker cp (Join-Path $root "supabase\migrations\$migrationName") "${container}:/tmp/$migrationName"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy migration $migrationName" }
  }

  Invoke-PsqlFile "/tmp/bootstrap.sql"
  foreach ($migration in $coreMigrations) { Invoke-PsqlFile "/tmp/$($migration.Name)" }
  Assert-PgTap "/tmp/testing-center-core.test.sql" "1\.\.72" "Core before report"
  Invoke-PsqlFile "/tmp/$accessMigration"
  Assert-PgTap "/tmp/testing-center-access.test.sql" "1\.\.56" "Access before report"
  Invoke-PsqlFile "/tmp/$reportMigration"
  Assert-PgTap "/tmp/testing-center-report.test.sql" "1\.\.55" "Initial report up"

  Invoke-PsqlFile "/tmp/testing-center-report.down.sql"
  $rollbackState = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_report -c `
    "select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('testing_center_report_payloads','testing_center_report_submission_keys','testing_center_report_events')) || ':' || (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='testing_center_submit_report') || ':' || (select count(*) from pg_policies where schemaname='public' and tablename like 'testing_center_%') || ':' || (select count(*) from information_schema.role_table_grants where table_schema='public' and table_name like 'testing_center_%' and grantee='authenticated' and privilege_type='SELECT') || ':' || (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'testing_center_%')"
  if ($LASTEXITCODE -ne 0 -or $rollbackState.Trim() -ne "0:0:5:5:11") {
    throw "Report rollback did not restore the access state: $rollbackState"
  }
  Assert-PgTap "/tmp/testing-center-access.test.sql" "1\.\.56" "Access after report rollback"

  Invoke-PsqlFile "/tmp/$reportMigration"
  Assert-PgTap "/tmp/testing-center-report.test.sql" "1\.\.55" "Second report up"

  Invoke-PsqlFile "/tmp/report-race-seed.sql"
  docker exec $container sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_report -f /tmp/report-race-a.sql >/tmp/race-a.log 2>&1 & p1=$!; psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_report -f /tmp/report-race-b.sql >/tmp/race-b.log 2>&1 & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; if [ "$s1" -eq 0 ] && [ "$s2" -eq 0 ]; then exit 0; fi; cat /tmp/race-a.log /tmp/race-b.log; exit 1'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent identical report submission failed" }
  $raceResult = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_report -c `
    "select count(*) || ':' || count(*) filter (where not idempotent) || ':' || count(*) filter (where idempotent) || ':' || count(distinct report_id) || ':' || (select count(*) from public.testing_center_reports where reporter_id='report-race') || ':' || (select count(*) from public.testing_center_report_payloads where report_id in (select report_id from public.testing_center_reports where reporter_id='report-race')) || ':' || (select count(*) from public.testing_center_report_events where actor_id='report-race') || ':' || (select count(*) from public.testing_center_report_submission_keys where reporter_user_id='00000000-0000-4000-8000-000000000490') from public.isa218_concurrency_results"
  if ($LASTEXITCODE -ne 0 -or $raceResult.Trim() -ne "2:1:1:1:1:1:1:1") {
    throw "Concurrent report submission was not exactly-once: $raceResult"
  }

  Write-Output "Testing Center report submission: core 72 + access 56 + report 55 + down/access 56 + up/report 55 pgTAP and concurrent exactly-once PASS"
} finally {
  docker rm -f $container 2>$null | Out-Null
  foreach ($path in @($bootstrap, $raceSeed, $raceCallA, $raceCallB)) {
    if (Test-Path $path) { Remove-Item -LiteralPath $path -Force }
  }
}
