param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$container = "vantare-testing-linear-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$password = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$raceA = Join-Path $env:TEMP "$container-race-a.sql"
$raceB = Join-Path $env:TEMP "$container-race-b.sql"
$linearMigration = "20260803100000_testing_center_linear_outbox.sql"

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

function Assert-MigrationFails([string]$Expected) {
  $saved = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_linear -f "/tmp/$linearMigration" 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $saved
  if ($exitCode -eq 0 -or $output -notmatch [regex]::Escape($Expected)) {
    throw "Migration did not fail with ${Expected}:`n$output"
  }
}

try {
  docker run --rm -d --name $container -e "POSTGRES_PASSWORD=$password" $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not start disposable PostgreSQL" }

  $ready = $false
  for ($attempt = 0; $attempt -lt 360; $attempt++) {
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
insert into public.isa239_claim_barrier values ('a');
do $$ begin
  for i in 1..1000 loop
    exit when (select count(*) from public.isa239_claim_barrier) = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa239_claim_barrier) <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
insert into public.isa239_claim_results
select 'a', claim_status from public.testing_center_claim_linear_effect(
  (select effect_id from public.testing_center_effect_outbox
   where technical_issue_id='issue_legacy_pending'
     and effect_type='linear_issue_create'),
  'race-a', 60);
'@

  Write-Utf8NoBom $raceB @'
insert into public.isa239_claim_barrier values ('b');
do $$ begin
  for i in 1..1000 loop
    exit when (select count(*) from public.isa239_claim_barrier) = 2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa239_claim_barrier) <> 2 then raise exception 'barrier_timeout'; end if;
end $$;
insert into public.isa239_claim_results
select 'b', claim_status from public.testing_center_claim_linear_effect(
  (select effect_id from public.testing_center_effect_outbox
   where technical_issue_id='issue_legacy_pending'
     and effect_type='linear_issue_create'),
  'race-b', 60);
'@

  Write-Output "[1/7] PostgreSQL ready; preparing one reusable base database"
  docker exec $container createdb -U postgres testing_linear_base
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
    "supabase\rollbacks\20260803100000_testing_center_linear_outbox.down.sql",
    "supabase\tests\testing_center_linear_outbox_upgrade_seed.sql",
    "supabase\tests\testing_center_linear_outbox.test.sql"
  )) {
    docker cp (Join-Path $root $path) "${container}:/tmp/$([IO.Path]::GetFileName($path))"
  }

  Invoke-PsqlFile "testing_linear_base" "/tmp/bootstrap.sql"
  foreach ($migration in $baseMigrations) {
    Invoke-PsqlFile "testing_linear_base" "/tmp/$($migration.Name)"
  }
  docker exec $container createdb -U postgres -T testing_linear_base testing_linear
  docker exec $container createdb -U postgres -T testing_linear_base testing_linear_clean

  Write-Output "[2/7] Checking clean installation"
  Invoke-PsqlFile "testing_linear_clean" "/tmp/$linearMigration"
  $clean = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_linear_clean -c `
    "select count(*) from public.testing_center_issue_destinations"
  if ($LASTEXITCODE -ne 0 -or $clean.Trim() -ne "0") { throw "Clean install failed: $clean" }

  Write-Output "[3/7] Checking paused upgrade and claimed-effect guards"
  Invoke-PsqlFile "testing_linear" "/tmp/testing_center_linear_outbox_upgrade_seed.sql"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_linear -c `
    "update public.testing_center_pauses set is_paused=false where pause_id='isa239-cutover-pause'" | Out-Null
  Assert-MigrationFails "testing_center_linear_cutover_requires_global_pause"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_linear -c `
    "update public.testing_center_pauses set is_paused=true where pause_id='isa239-cutover-pause'; update public.testing_center_effect_outbox set state='claimed', lease_token=gen_random_uuid(), lease_expires_at=now()+interval '1 minute' where technical_issue_id='issue_legacy_active'" | Out-Null
  Assert-MigrationFails "testing_center_linear_cutover_claimed_github_effect"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_linear -c `
    "update public.testing_center_effect_outbox set state='pending', lease_token=null, lease_expires_at=null where technical_issue_id='issue_legacy_active'; update public.testing_center_effect_outbox set state='claimed', lease_token=gen_random_uuid(), lease_expires_at=now()-interval '1 minute' where technical_issue_id='issue_legacy_expired'" | Out-Null
  Assert-MigrationFails "testing_center_linear_cutover_claimed_github_effect"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_linear -c `
    "update public.testing_center_effect_outbox set state='pending', lease_token=null, lease_expires_at=null where technical_issue_id='issue_legacy_expired'" | Out-Null

  Write-Output "[4/7] Applying upgrade and running 43 pgTAP assertions"
  Invoke-PsqlFile "testing_linear" "/tmp/$linearMigration"
  Assert-PgTap "testing_linear" "/tmp/testing_center_linear_outbox.test.sql" "1\.\.43" "Initial Linear outbox"
  Write-Output "[5/7] Checking exact rollback"
  Invoke-PsqlFile "testing_linear" "/tmp/20260803100000_testing_center_linear_outbox.down.sql"
  $rollback = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_linear -c `
    "select (select count(*) from ((select to_jsonb(current_row) from public.testing_center_effect_outbox current_row except select to_jsonb(expected_row) from public.isa239_legacy_expected expected_row) union all (select to_jsonb(expected_row) from public.isa239_legacy_expected expected_row except select to_jsonb(current_row) from public.testing_center_effect_outbox current_row)) mismatch) || ':' || has_function_privilege('service_role','public.testing_center_claim_github_effect(text,uuid,integer)','EXECUTE')::int || ':' || (to_regclass('public.testing_center_issue_destinations') is null)::int"
  if ($LASTEXITCODE -ne 0 -or $rollback.Trim() -ne "0:1:1") {
    throw "Rollback did not restore exact legacy state and grants: $rollback"
  }

  Write-Output "[6/7] Reapplying and rerunning 43 pgTAP assertions"
  Invoke-PsqlFile "testing_linear" "/tmp/$linearMigration"
  Assert-PgTap "testing_linear" "/tmp/testing_center_linear_outbox.test.sql" "1\.\.43" "Reapplied Linear outbox"

  Write-Output "[7/7] Running a real two-process claim race"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_linear -c @"
update public.testing_center_pauses set is_paused=false where pause_id='isa239-cutover-pause';
insert into public.testing_center_build_identities(build_identity_id,channel,app_version,candidate_sha,registered_by_id)
values ('build_' || repeat('6',64),'nightly','0.7.39-pending',repeat('a',40),'isa239-owner');
select * from public.testing_center_prepare_linear_projection(
  (select effect_id from public.testing_center_effect_outbox
   where technical_issue_id='issue_legacy_pending'
     and effect_type='linear_issue_create'));
create table public.isa239_claim_barrier(participant text primary key);
create table public.isa239_claim_results(participant text primary key, claim_status text not null);
"@ | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not seed claim race" }
  docker exec $container sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_linear -f /tmp/race-a.sql >/tmp/race-a.log 2>&1 & p1=$!; psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_linear -f /tmp/race-b.sql >/tmp/race-b.log 2>&1 & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; if [ "$s1" -eq 0 ] && [ "$s2" -eq 0 ]; then exit 0; fi; cat /tmp/race-a.log /tmp/race-b.log; exit 1'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent claim race failed" }
  $race = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_linear -c `
    "select count(*) filter(where claim_status='claimed') || ':' || count(*) filter(where claim_status='busy') || ':' || count(*) from public.isa239_claim_results"
  if ($LASTEXITCODE -ne 0 -or $race.Trim() -ne "1:1:2") { throw "Claim race was not fenced exactly once: $race" }

  Write-Output "Testing Center Linear outbox: clean install + cutover guards + 43/43 + exact rollback + reapply 43/43 + two-process claim race PASS"
} finally {
  $ErrorActionPreference = "Continue"
  docker rm -f $container 2>$null | Out-Null
  Remove-Item -LiteralPath $bootstrap, $raceA, $raceB -Force -ErrorAction SilentlyContinue
}
