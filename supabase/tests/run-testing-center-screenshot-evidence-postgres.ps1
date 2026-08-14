param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 10)
$container = "vantare-evidence-$suffix"
$password = [Guid]::NewGuid().ToString("N")
$database = "testing_evidence"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$migrationName = "20260814154558_testing_center_screenshot_evidence.sql"
$rollbackName = "20260814154558_testing_center_screenshot_evidence.down.sql"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Invoke-PsqlFile([string]$File) {
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $database -f $File | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $File" }
}

function Assert-PgTap([string]$Label) {
  $tap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $database -f /tmp/evidence.test.sql | Out-String
  if ($LASTEXITCODE -ne 0 -or $tap -match '(?m)^not ok' -or $tap -notmatch '1\.\.62') {
    throw "$Label pgTAP failed:`n$tap"
  }
}

try {
  docker run --rm -d --name $container -e "POSTGRES_PASSWORD=$password" $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not start disposable PostgreSQL" }
  $ready = $false
  for ($attempt = 0; $attempt -lt 180; $attempt++) {
    $saved = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $logs = docker logs $container 2>&1 | Out-String
    $initialized = $LASTEXITCODE -eq 0 -and $logs -match "PostgreSQL init process complete"
    docker exec $container pg_isready -U postgres -d postgres 2>$null | Out-Null
    $isReady = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $saved
    if ($initialized -and $isReady) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Disposable PostgreSQL did not become ready" }

  Write-Utf8NoBom $bootstrap @'
do $$ begin create role anon noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role noinherit bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;
create extension if not exists pgtap;
create extension if not exists pgcrypto with schema extensions;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table storage.buckets(
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects(
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bucket_id,name)
);
alter table storage.objects enable row level security;
grant usage on schema public,auth,extensions,storage to anon,authenticated,service_role;
grant insert on storage.objects to authenticated;
grant select,insert,update,delete on storage.objects,storage.buckets to service_role;
'@

  Write-Output "[1/5] Installing history and ISA-350 into disposable PostgreSQL"
  docker exec $container createdb -U postgres $database
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_screenshot_evidence.test.sql") "${container}:/tmp/evidence.test.sql"
  Invoke-PsqlFile "/tmp/bootstrap.sql"
  $migrations = Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") |
    Where-Object { $_.Name -le $migrationName } | Sort-Object Name
  foreach ($migration in $migrations) {
    docker cp $migration.FullName "${container}:/tmp/$($migration.Name)"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy $($migration.Name)" }
    Invoke-PsqlFile "/tmp/$($migration.Name)"
  }

  Write-Output "[2/5] Running 62 pgTAP assertions"
  Assert-PgTap "Initial screenshot evidence"

  Write-Output "[3/5] Rolling back and checking exact restoration"
  docker cp (Join-Path $root "supabase\rollbacks\$rollbackName") "${container}:/tmp/$rollbackName"
  Invoke-PsqlFile "/tmp/$rollbackName"
  $rollback = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $database -c `
    "select (to_regclass('public.testing_center_evidence_batches') is null)::int||':'||(to_regclass('public.testing_center_screenshot_evidence') is null)::int||':'||(to_regclass('public.testing_center_evidence_outbox') is null)::int||':'||(to_regprocedure('public.testing_center_prepare_screenshot_batch(text,text,text,jsonb)') is null)::int||':'||(select count(*) from storage.buckets where id='testing-center-evidence')||':'||(select pg_get_constraintdef(oid) from pg_constraint where conname='testing_center_evidence_kind_check')"
  if ($LASTEXITCODE -ne 0 -or $rollback.Trim() -ne "1:1:1:1:0:CHECK ((kind = ANY (ARRAY['report_context'::text, 'diagnostic'::text, 'reproduction'::text])))") {
    throw "Rollback did not restore the exact prior contract: $rollback"
  }

  Write-Output "[4/5] Reapplying and rerunning pgTAP"
  Invoke-PsqlFile "/tmp/$migrationName"
  Assert-PgTap "Reapplied screenshot evidence"

  Write-Output "[5/5] Verifying incompatible existing bucket fails closed"
  Invoke-PsqlFile "/tmp/$rollbackName"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $database -c "insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('testing-center-evidence','testing-center-evidence',true,1,array['image/gif']);" | Out-Null
  $saved = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $closed = docker exec $container psql -X --set=ON_ERROR_STOP=1 --set=VERBOSITY=verbose -U postgres -d $database -f "/tmp/$migrationName" 2>&1 | Out-String
  $closedCode = $LASTEXITCODE
  $ErrorActionPreference = $saved
  if ($closedCode -eq 0 -or $closed -notmatch 'testing_center_evidence_bucket_incompatible') {
    throw "Incompatible existing bucket did not fail closed:`n$closed"
  }

  Write-Output "Testing Center screenshot evidence: 62/62 + rollback exact + reapply 62/62 + incompatible bucket fail-closed PASS"
} finally {
  $ErrorActionPreference = "Continue"
  docker rm -f $container 2>$null | Out-Null
  Remove-Item -LiteralPath $bootstrap -Force -ErrorAction SilentlyContinue
}
