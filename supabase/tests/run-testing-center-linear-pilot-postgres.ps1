param(
  [string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132",
  [string]$ExistingContainer = ""
)

$ErrorActionPreference = "Stop"
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$ownsContainer = [string]::IsNullOrWhiteSpace($ExistingContainer)
$container = if ($ownsContainer) { "vantare-testing-linear-pilot-$suffix" } else { $ExistingContainer }
$password = [Guid]::NewGuid().ToString("N")
$baseDb = "testing_pilot_base_$suffix"
$cleanDb = "testing_pilot_clean_$suffix"
$pilotDb = "testing_pilot_$suffix"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$linearMigration = "20260803100000_testing_center_linear_outbox.sql"
$webhookMigration = "20260803110000_testing_center_linear_webhook.sql"
$pilotMigration = "20260804100000_testing_center_linear_pilot.sql"
$uuidCompatibilityMigration = "20260804110000_uuid_public_compatibility.sql"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Invoke-PsqlFile([string]$Database, [string]$File) {
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database -f $File | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $Database $File" }
}

function Assert-PgTap([string]$Database, [string]$File, [string]$Label) {
  $tap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $Database -f $File | Out-String
  if ($LASTEXITCODE -ne 0 -or $tap -match "(?m)^not ok" -or $tap -notmatch "1\.\.18") {
    throw "$Label pgTAP failed:`n$tap"
  }
}

try {
  if ($ownsContainer) {
    docker run --rm -d --name $container -e "POSTGRES_PASSWORD=$password" $Image | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not start disposable PostgreSQL" }
  }
  $ready = $false
  for ($attempt = 0; $attempt -lt 180; $attempt++) {
    $saved = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    docker exec $container pg_isready -U postgres -d postgres 2>$null | Out-Null
    $isReady = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $saved
    if ($isReady) { $ready = $true; break }
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
create extension if not exists pgcrypto with schema extensions;
create table if not exists auth.users(
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
'@

  Write-Output "[1/4] Preparing disposable pre-Linear database"
  docker exec $container createdb -U postgres $baseDb
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  Invoke-PsqlFile $baseDb "/tmp/bootstrap.sql"
  $baseMigrations = Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") |
    Where-Object { $_.Name -lt $linearMigration } | Sort-Object Name
  foreach ($migration in $baseMigrations) {
    docker cp $migration.FullName "${container}:/tmp/$($migration.Name)"
    Invoke-PsqlFile $baseDb "/tmp/$($migration.Name)"
  }
  foreach ($path in @(
    "supabase\migrations\$linearMigration",
    "supabase\migrations\$webhookMigration",
    "supabase\migrations\$pilotMigration",
    "supabase\migrations\$uuidCompatibilityMigration",
    "supabase\rollbacks\20260804100000_testing_center_linear_pilot.down.sql",
    "supabase\rollbacks\20260804110000_uuid_public_compatibility.down.sql",
    "supabase\tests\testing_center_linear_outbox_upgrade_seed.sql",
    "supabase\tests\testing_center_linear_pilot.test.sql"
  )) {
    docker cp (Join-Path $root $path) "${container}:/tmp/$([IO.Path]::GetFileName($path))"
  }

  Write-Output "[2/4] Checking clean migration installation"
  docker exec $container createdb -U postgres -T $baseDb $cleanDb
  Invoke-PsqlFile $cleanDb "/tmp/$linearMigration"
  Invoke-PsqlFile $cleanDb "/tmp/$webhookMigration"
  Invoke-PsqlFile $cleanDb "/tmp/$pilotMigration"
  Invoke-PsqlFile $cleanDb "/tmp/$uuidCompatibilityMigration"
  $clean = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $cleanDb -c `
    "select (to_regprocedure('public.testing_center_complete_linear_pilot(text,text,bigint,text,uuid,uuid,text,text,text)') is not null)::int || ':' || count(*) from public.testing_center_linear_issue_bindings"
  if ($LASTEXITCODE -ne 0 -or $clean.Trim() -ne "1:0") {
    throw "Clean pilot migration failed: $clean"
  }

  Write-Output "[3/4] Running upgraded pilot contract and 18 pgTAP assertions"
  docker exec $container createdb -U postgres -T $baseDb $pilotDb
  Invoke-PsqlFile $pilotDb "/tmp/testing_center_linear_outbox_upgrade_seed.sql"
  Invoke-PsqlFile $pilotDb "/tmp/$linearMigration"
  Invoke-PsqlFile $pilotDb "/tmp/$webhookMigration"
  Invoke-PsqlFile $pilotDb "/tmp/$pilotMigration"
  Invoke-PsqlFile $pilotDb "/tmp/$uuidCompatibilityMigration"
  Assert-PgTap $pilotDb "/tmp/testing_center_linear_pilot.test.sql" "Initial Linear pilot"

  Write-Output "[4/4] Checking zero-history rollback and exact reapply"
  Invoke-PsqlFile $pilotDb "/tmp/20260804100000_testing_center_linear_pilot.down.sql"
  Invoke-PsqlFile $pilotDb "/tmp/20260804110000_uuid_public_compatibility.down.sql"
  $rollback = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $pilotDb -c `
    "select (to_regprocedure('public.testing_center_complete_linear_pilot(text,text,bigint,text,uuid,uuid,text,text,text)') is null)::int || ':' || (to_regprocedure('public.testing_center_reconcile_linear_webhook(uuid,uuid,uuid,uuid,text,text,bigint,timestamptz,uuid,text)') is not null)::int"
  if ($LASTEXITCODE -ne 0 -or $rollback.Trim() -ne "1:1") {
    throw "Pilot rollback did not preserve TAU-07F: $rollback"
  }
  Invoke-PsqlFile $pilotDb "/tmp/$pilotMigration"
  Invoke-PsqlFile $pilotDb "/tmp/$uuidCompatibilityMigration"
  Assert-PgTap $pilotDb "/tmp/testing_center_linear_pilot.test.sql" "Reapplied Linear pilot"

  Write-Output "Testing Center Linear pilot: clean install + 18/18 + exact rollback + reapply 18/18 PASS"
} finally {
  $ErrorActionPreference = "Continue"
  if ($ownsContainer) {
    docker rm -f $container 2>$null | Out-Null
  } else {
    foreach ($database in @($cleanDb, $pilotDb, $baseDb)) {
      if ($database -match '^testing_pilot_(base|clean)?_?[0-9a-f]{8}$') {
        docker exec $container dropdb --if-exists -U postgres $database 2>$null | Out-Null
      }
    }
  }
  Remove-Item -LiteralPath $bootstrap -Force -ErrorAction SilentlyContinue
}
