param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$container = "vantare-supabase-hardening-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
$password = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
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
}

try {
  docker run --rm -d --name $container -e "POSTGRES_PASSWORD=$password" $Image | Out-Null
  $initialized = $false
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $logs = docker logs $container 2>&1 | Out-String
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
create extension if not exists pgtap;
create extension if not exists pgcrypto;
create schema if not exists auth;
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
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp (Join-Path $root "supabase\tests\supabase_auth_license_hardening_test.sql") "${container}:/tmp/hardening-test.sql"
  $migrations = Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") | Sort-Object Name
  foreach ($migration in $migrations) { docker cp $migration.FullName "${container}:/tmp/$($migration.Name)" }

  Initialize-Database "clean"
  foreach ($migration in $migrations) { Invoke-Psql "clean" "/tmp/$($migration.Name)" }
  $cleanTap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d clean -f /tmp/hardening-test.sql | Out-String
  if ($LASTEXITCODE -ne 0 -or $cleanTap -match "(?m)^not ok" -or $cleanTap -notmatch "1\.\.33") {
    throw "Clean install pgTAP failed:`n$cleanTap"
  }

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
  Write-Utf8NoBom $claimAFile @'
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000090', false);
select public.claim_active_device('race-fingerprint-a');
'@
  Write-Utf8NoBom $claimBFile @'
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
    "set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000090',false); select public.reset_active_device('race-reset-fingerprint')" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Device reset after concurrent claim failed" }
  $resetClaim = docker exec $container psql -At -U postgres -d clean -c `
    "select fingerprint_hash from public.devices where user_id = '00000000-0000-4000-8000-000000000090'"
  if ($resetClaim.Trim() -ne "race-reset-fingerprint") { throw "Reset did not bind the explicit fingerprint: $resetClaim" }

  Initialize-Database "upgrade"
  foreach ($migration in $migrations | Where-Object Name -ne "20260802020000_supabase_auth_license_hardening.sql") {
    Invoke-Psql "upgrade" "/tmp/$($migration.Name)"
  }
  Invoke-Psql "upgrade" "/tmp/20260802020000_supabase_auth_license_hardening.sql"
  $upgradeTap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d upgrade -f /tmp/hardening-test.sql | Out-String
  if ($LASTEXITCODE -ne 0 -or $upgradeTap -match "(?m)^not ok" -or $upgradeTap -notmatch "1\.\.33") {
    throw "Upgrade pgTAP failed:`n$upgradeTap"
  }

  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d clean -c `
    "insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000091', 'restore-sentinel@example.invalid'); insert into public.user_entitlements (user_id, product_key, status, source) values ('00000000-0000-4000-8000-000000000091', 'restore_sentinel', 'active', 'restore-test')" | Out-Null
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
  $restoreTap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d restore_drill -f /tmp/hardening-test.sql | Out-String
  $restoreTapExit = $LASTEXITCODE
  if ($restoreTapExit -ne 0 -or $restoreTap -match "(?m)^not ok" -or $restoreTap -notmatch "1\.\.33") {
    throw "Restored database pgTAP failed:`n$restoreTap"
  }
  $restored = docker exec $container psql -At -v ON_ERROR_STOP=1 -U postgres -d restore_drill -c `
    "select (select count(*) = 1 from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000091' and product_key = 'restore_sentinel') and (select relrowsecurity from pg_class where oid = 'public.user_entitlements'::regclass) and not has_function_privilege('anon','public.read_account_entitlements()','execute')"
  $restoredExit = $LASTEXITCODE
  if ($restoredExit -ne 0 -or $restored.Trim() -ne "t") { throw "Restored database sentinel/RLS/grant validation failed: $restored" }

  docker exec $container createdb -U postgres restore_failure
  if ($LASTEXITCODE -ne 0) { throw "Could not create negative restore database" }
  docker exec $container pg_restore --exit-on-error -U postgres -d restore_failure /tmp/does-not-exist.dump 2>$null
  $failedRestoreExit = $LASTEXITCODE
  if ($failedRestoreExit -eq 0) { throw "Negative restore unexpectedly passed" }
  $elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds, 2)
  Write-Output "Supabase hardening: clean pgTAP PASS; same/different fingerprint races + reset PASS; upgrade pgTAP PASS; restore pgTAP/sentinel/RLS/grants/fail-closed PASS (${elapsed}s)"
} finally {
  docker rm -f $container 2>$null | Out-Null
  if (Test-Path $bootstrap) { Remove-Item -LiteralPath $bootstrap -Force }
  if (Test-Path $claimFile) { Remove-Item -LiteralPath $claimFile -Force }
  if (Test-Path $claimAFile) { Remove-Item -LiteralPath $claimAFile -Force }
  if (Test-Path $claimBFile) { Remove-Item -LiteralPath $claimBFile -Force }
}
