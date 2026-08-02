param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$container = "vantare-supabase-hardening-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
$password = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$claimFile = Join-Path $env:TEMP "$container-claim.sql"

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
  if ($LASTEXITCODE -ne 0 -or $cleanTap -match "(?m)^not ok" -or $cleanTap -notmatch "1\.\.15") {
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

  Initialize-Database "upgrade"
  foreach ($migration in $migrations | Where-Object Name -ne "20260802020000_supabase_auth_license_hardening.sql") {
    Invoke-Psql "upgrade" "/tmp/$($migration.Name)"
  }
  Invoke-Psql "upgrade" "/tmp/20260802020000_supabase_auth_license_hardening.sql"
  $upgradeTap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d upgrade -f /tmp/hardening-test.sql | Out-String
  if ($LASTEXITCODE -ne 0 -or $upgradeTap -match "(?m)^not ok" -or $upgradeTap -notmatch "1\.\.15") {
    throw "Upgrade pgTAP failed:`n$upgradeTap"
  }

  $started = Get-Date
  docker exec $container pg_dump -U postgres -d clean -Fc -f /tmp/clean.dump
  docker exec $container createdb -U postgres restore_drill
  docker exec $container pg_restore -U postgres -d restore_drill --no-owner /tmp/clean.dump
  $restored = docker exec $container psql -At -U postgres -d restore_drill -c "select to_regprocedure('public.read_account_entitlements()') is not null"
  if ($LASTEXITCODE -ne 0 -or $restored.Trim() -ne "t") { throw "Disposable restore drill failed" }
  $elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds, 2)
  Write-Output "Supabase hardening: clean pgTAP PASS; concurrent claim PASS; upgrade pgTAP PASS; disposable backup/restore PASS (${elapsed}s)"
} finally {
  docker rm -f $container 2>$null | Out-Null
  if (Test-Path $bootstrap) { Remove-Item -LiteralPath $bootstrap -Force }
  if (Test-Path $claimFile) { Remove-Item -LiteralPath $claimFile -Force }
}
