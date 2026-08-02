param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$container = "vantare-testing-center-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$password = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$targetMigration = "20260802130000_testing_center_core.sql"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Invoke-PsqlFile([string]$File) {
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_center -f $File | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $File" }
}

function Assert-PgTap([string]$Label) {
  $tap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_center -f /tmp/testing-center.test.sql | Out-String
  if ($LASTEXITCODE -ne 0 -or $tap -match "(?m)^not ok" -or $tap -notmatch "1\.\.72") {
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

  docker exec $container createdb -U postgres testing_center
  if ($LASTEXITCODE -ne 0) { throw "Could not create disposable test database" }
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_core.test.sql") "${container}:/tmp/testing-center.test.sql"
  docker cp (Join-Path $root "supabase\rollbacks\20260802130000_testing_center_core.down.sql") "${container}:/tmp/testing-center.down.sql"

  $migrations = Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") |
    Where-Object { $_.Name -le $targetMigration } |
    Sort-Object Name
  foreach ($migration in $migrations) {
    docker cp $migration.FullName "${container}:/tmp/$($migration.Name)"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy migration $($migration.Name)" }
  }

  Invoke-PsqlFile "/tmp/bootstrap.sql"
  foreach ($migration in $migrations) {
    Invoke-PsqlFile "/tmp/$($migration.Name)"
  }
  Assert-PgTap "Initial up"

  Invoke-PsqlFile "/tmp/testing-center.down.sql"
  $remaining = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_center -c `
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'testing_center_%'"
  if ($LASTEXITCODE -ne 0 -or $remaining.Trim() -ne "0") {
    throw "Rollback left Testing Center objects behind: $remaining"
  }
  $policies = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_center -c `
    "select count(*) from pg_policies where schemaname='public' and tablename like 'testing_center_%'"
  if ($LASTEXITCODE -ne 0 -or $policies.Trim() -ne "0") {
    throw "Rollback left Testing Center policies behind: $policies"
  }

  Invoke-PsqlFile "/tmp/$targetMigration"
  Assert-PgTap "Second up"

  Write-Output "Testing Center PostgreSQL: full history + pgTAP + down/absence + up/pgTAP PASS"
} finally {
  docker rm -f $container 2>$null | Out-Null
  if (Test-Path $bootstrap) { Remove-Item -LiteralPath $bootstrap -Force }
}
