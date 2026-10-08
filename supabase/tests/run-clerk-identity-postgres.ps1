param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")
$ErrorActionPreference = 'Stop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is required for isolated pgTAP' }
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$container = 'vantare-clerk-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 10)
$password = [Guid]::NewGuid().ToString('N')
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
try {
  docker run --rm -d --name $container -e "POSTGRES_PASSWORD=$password" $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start disposable PostgreSQL' }
  $ready = $false
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    docker exec $container pg_isready -U postgres 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'Disposable PostgreSQL did not start' }
  @'
do $$ begin create role anon noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role noinherit bypassrls; exception when duplicate_object then null; end $$;
create extension if not exists pgtap;
create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
create schema if not exists storage;
create table if not exists storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text, metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
'@ | Set-Content -LiteralPath $bootstrap -Encoding utf8
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -f /tmp/bootstrap.sql | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Bootstrap failed' }
  $migrations = Get-ChildItem -LiteralPath (Join-Path $root 'supabase/migrations') -Filter '*.sql' | Sort-Object Name
  foreach ($migration in $migrations) {
    docker cp $migration.FullName "${container}:/tmp/$($migration.Name)"
    docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -f "/tmp/$($migration.Name)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($migration.Name)" }
  }
  foreach ($test in @(
    @{ File = 'clerk_identity_cutover_test.sql'; Count = 23 },
    @{ File = 'billing_identity_refunds_test.sql'; Count = 24 }
  )) {
    docker cp (Join-Path $PSScriptRoot $test.File) "${container}:/tmp/test.sql"
    $tap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -f /tmp/test.sql | Out-String
    if ($LASTEXITCODE -ne 0 -or $tap -match '(?m)^not ok' -or $tap -notmatch "1\.\.$($test.Count)") {
      throw "pgTAP failed ($($test.File)):`n$tap"
    }
    Write-Output $tap
  }
} finally {
  docker rm -f $container 2>$null | Out-Null
  if (Test-Path -LiteralPath $bootstrap) { Remove-Item -LiteralPath $bootstrap }
}
