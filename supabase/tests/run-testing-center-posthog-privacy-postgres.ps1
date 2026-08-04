param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$container = "vantare-testing-posthog-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$password = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$migration = "20260803130000_testing_center_posthog_privacy.sql"
$rollback = "20260803130000_testing_center_posthog_privacy.down.sql"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}
function Invoke-PsqlFile([string]$Database, [string]$File) {
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database -f $File | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $Database $File" }
}
function Assert-PgTap([string]$Database, [string]$File, [string]$Label) {
  $tap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $Database -f $File | Out-String
  if ($LASTEXITCODE -ne 0 -or $tap -match "(?m)^not ok" -or $tap -notmatch "1\.\.33") {
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
  for ($attempt=0; $attempt -lt 240; $attempt++) {
    $saved=$ErrorActionPreference; $ErrorActionPreference="Continue"
    $logs=docker logs $container 2>&1 | Out-String; $logsRead=$LASTEXITCODE -eq 0
    docker exec $container pg_isready -U postgres -d postgres 2>$null | Out-Null
    $isReady=$LASTEXITCODE -eq 0; $ErrorActionPreference=$saved
    if ($logsRead -and $logs -match "PostgreSQL init process complete" -and $isReady) {
      $ready=$true; break
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
create table if not exists auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema public,auth to anon,authenticated,service_role;
'@

  Write-Output "[1/5] PostgreSQL ready; applying migrations through ISA-253"
  docker exec $container createdb -U postgres testing_posthog
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_posthog_privacy.test.sql") "${container}:/tmp/posthog.test.sql"
  docker cp (Join-Path $root "supabase\rollbacks\$rollback") "${container}:/tmp/$rollback"
  $migrations=Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") |
    Where-Object {$_.Name -le $migration} | Sort-Object Name
  foreach($item in $migrations){docker cp $item.FullName "${container}:/tmp/$($item.Name)"}
  Invoke-PsqlFile "testing_posthog" "/tmp/bootstrap.sql"
  foreach($item in $migrations){Invoke-PsqlFile "testing_posthog" "/tmp/$($item.Name)"}

  Write-Output "[2/5] Running 33 pgTAP assertions"
  Assert-PgTap "testing_posthog" "/tmp/posthog.test.sql" "Initial PostHog privacy boundary"

  Write-Output "[3/5] Checking zero-history rollback and reapply"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_posthog -c @"
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000599','rollback@example.invalid');
set role service_role;
insert into public.testing_center_memberships(user_id,actor_id,role)
values ('00000000-0000-4000-8000-000000000599','dddddddd-dddd-4ddd-8ddd-dddddddddddd','owner');
insert into public.testing_center_pauses(pause_id,scope,is_paused,reason_code,requested_by_id,requested_by_user_id,requested_by_role,origin)
values ('isa253-rollback','global',true,'migration_rollback','dddddddd-dddd-4ddd-8ddd-dddddddddddd','00000000-0000-4000-8000-000000000599','owner','testing_center');
reset role;
"@ | Out-Null
  Invoke-PsqlFile "testing_posthog" "/tmp/$rollback"
  $down=docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_posthog -c `
    "select (to_regclass('public.testing_center_posthog_evidence') is null)::int || ':' || (to_regclass('public.testing_center_validation_snapshots') is not null)::int"
  if($LASTEXITCODE -ne 0 -or $down.Trim() -ne '1:1'){throw "Rollback did not preserve TAU-07G: $down"}
  Invoke-PsqlFile "testing_posthog" "/tmp/$migration"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_posthog -c "update public.testing_center_pauses set is_paused=false where pause_id='isa253-rollback'" | Out-Null

  Write-Output "[4/5] Rerunning 33 pgTAP assertions after reapply"
  Assert-PgTap "testing_posthog" "/tmp/posthog.test.sql" "Reapplied PostHog privacy boundary"

  Write-Output "[5/5] Proving rollback refuses consent history"
  docker exec $container createdb -U postgres -T testing_posthog testing_posthog_guard
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_posthog_guard -c @"
set role service_role;
insert into public.testing_center_reports(
  report_id,reporter_id,reporter_user_id,reporter_role,channel,state
) values ('report_' || repeat('f',64),'guard-reporter',
  '00000000-0000-4000-8000-000000000599','owner','nightly','submitted');
insert into public.testing_center_report_payloads(
  report_id,action_text,expected_text,observed_text,app_version,os_family,
  os_version,module,include_diagnostic,include_logs,diagnostic_document,
  diagnostic_transport_digest
) values ('report_' || repeat('f',64),'Open diagnostics','Form remains available',
  'Synthetic failure shown','1.0.0-nightly.guard','windows','Windows 11 23H2',
  'testing_center',true,false,'{"synthetic":true}'::jsonb,repeat('f',64));
update public.testing_center_pauses set is_paused=true where pause_id='isa253-rollback';
reset role;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000599';
set role authenticated;
select * from public.testing_center_set_posthog_consent('report_' || repeat('f',64),true,false,'guard-history');
reset role;
"@ | Out-Null
  Assert-ScriptFails "testing_posthog_guard" "/tmp/$rollback" "testing_center_posthog_rollback_has_history"
  Write-Output "Testing Center PostHog privacy: 33/33 + rollback/reapply 33/33 + history guard PASS"
} finally {
  $ErrorActionPreference="Continue"
  docker rm -f $container 2>$null | Out-Null
  Remove-Item -LiteralPath $bootstrap -Force -ErrorAction SilentlyContinue
}
