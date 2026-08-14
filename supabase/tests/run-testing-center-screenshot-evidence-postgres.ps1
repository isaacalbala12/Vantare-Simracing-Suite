param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 10)
$container = "vantare-evidence-$suffix"
$password = [Guid]::NewGuid().ToString("N")
$database = "testing_evidence"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$raceSeed = Join-Path $env:TEMP "$container-race-seed.sql"
$raceCallA = Join-Path $env:TEMP "$container-race-a.sql"
$raceCallB = Join-Path $env:TEMP "$container-race-b.sql"
$rollbackUse = Join-Path $env:TEMP "$container-rollback-use.sql"
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
  if ($LASTEXITCODE -ne 0 -or $tap -match '(?m)^not ok' -or $tap -notmatch '1\.\.71') {
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

  Write-Utf8NoBom $raceSeed @'
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000504','evidence-race@example.invalid');
set role service_role;
insert into public.testing_center_memberships(user_id,actor_id,role,active) values
  ('00000000-0000-4000-8000-000000000504','evidence-race','primary_tester',true);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000504',false);
create temporary table race_prepared as
select * from public.testing_center_prepare_screenshot_batch(
  'testing-center.screenshot-evidence.v1','nightly','finalize-race-key',
  '[{"position":1,"mediaType":"image/png","byteSize":1024,"sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","width":100,"height":100}]'::jsonb
);
insert into storage.objects(bucket_id,name,owner_id)
select 'testing-center-evidence',slot->>'objectPath','00000000-0000-4000-8000-000000000504'
from race_prepared cross join lateral jsonb_array_elements(slots) as slot;
reset role;
create table public.isa350_concurrency_target as
select batch.batch_id,evidence.evidence_id
from public.testing_center_evidence_batches as batch
join public.testing_center_screenshot_evidence as evidence using(batch_id)
where batch.idempotency_key='finalize-race-key';
create table public.isa350_concurrency_barrier(participant text primary key);
create table public.isa350_concurrency_results(
  participant text primary key,
  evidence_id uuid not null,
  evidence_state text not null,
  idempotent boolean not null
);
grant select on table public.isa350_concurrency_target to authenticated;
grant insert,select on table public.isa350_concurrency_results to authenticated;
'@

  Write-Utf8NoBom $raceCallA @'
insert into public.isa350_concurrency_barrier values ('a');
do $$ begin
  for i in 1..1000 loop
    exit when (select count(*) from public.isa350_concurrency_barrier)=2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa350_concurrency_barrier)<>2 then raise exception 'barrier_timeout'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000504',false);
insert into public.isa350_concurrency_results
select 'a',result.evidence_id,result.state,result.idempotent
from public.testing_center_finalize_screenshot(
  (select batch_id from public.isa350_concurrency_target),
  (select evidence_id from public.isa350_concurrency_target)
) as result;
'@

  Write-Utf8NoBom $raceCallB @'
insert into public.isa350_concurrency_barrier values ('b');
do $$ begin
  for i in 1..1000 loop
    exit when (select count(*) from public.isa350_concurrency_barrier)=2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa350_concurrency_barrier)<>2 then raise exception 'barrier_timeout'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000504',false);
insert into public.isa350_concurrency_results
select 'b',result.evidence_id,result.state,result.idempotent
from public.testing_center_finalize_screenshot(
  (select batch_id from public.isa350_concurrency_target),
  (select evidence_id from public.isa350_concurrency_target)
) as result;
'@

  Write-Utf8NoBom $rollbackUse @'
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000505','evidence-rollback@example.invalid');
set role service_role;
insert into public.testing_center_memberships(user_id,actor_id,role,active) values
  ('00000000-0000-4000-8000-000000000505','evidence-rollback','primary_tester',true);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000505',false);
create temporary table rollback_prepared as
select * from public.testing_center_prepare_screenshot_batch(
  'testing-center.screenshot-evidence.v1','nightly','rollback-used-key',
  '[{"position":1,"mediaType":"image/png","byteSize":1024,"sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","width":100,"height":100}]'::jsonb
);
grant select on rollback_prepared to service_role;
reset role;
set role service_role;
insert into storage.objects(bucket_id,name,owner_id)
select 'testing-center-evidence',slot->>'objectPath','00000000-0000-4000-8000-000000000505'
from rollback_prepared cross join lateral jsonb_array_elements(slots) as slot;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000505',false);
select * from public.testing_center_finalize_screenshot(
  (select batch_id from rollback_prepared),
  (select (slots->0->>'evidenceId')::uuid from rollback_prepared)
);
reset role;
set role service_role;
update public.testing_center_screenshot_evidence set state='ready',validated_at=now(),updated_at=now()
where batch_id=(select batch_id from rollback_prepared);
update public.testing_center_evidence_batches set state='ready',updated_at=now()
where batch_id=(select batch_id from rollback_prepared);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000505',false);
select * from public.testing_center_submit_report_with_evidence(
  'testing-center.v1','nightly','Rollback action','Rollback expected','Rollback observed',null,
  'v0.4.0-nightly','windows','Windows 11','hub',false,false,null,null,
  'rollback-used-key',(select batch_id from rollback_prepared)
);
reset role;
do $$
begin
  if (select count(*) from public.testing_center_evidence where kind='screenshot') <> 1 then
    raise exception 'rollback_use_did_not_create_screenshot_projection';
  end if;
end
$$;
'@

  Write-Output "[1/8] Installing history and ISA-350 into disposable PostgreSQL"
  docker exec $container createdb -U postgres $database
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_screenshot_evidence.test.sql") "${container}:/tmp/evidence.test.sql"
  docker cp $raceSeed "${container}:/tmp/evidence-race-seed.sql"
  docker cp $raceCallA "${container}:/tmp/evidence-race-a.sql"
  docker cp $raceCallB "${container}:/tmp/evidence-race-b.sql"
  docker cp $rollbackUse "${container}:/tmp/evidence-rollback-use.sql"
  Invoke-PsqlFile "/tmp/bootstrap.sql"
  $migrations = Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") |
    Where-Object { $_.Name -le $migrationName } | Sort-Object Name
  foreach ($migration in $migrations) {
    docker cp $migration.FullName "${container}:/tmp/$($migration.Name)"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy $($migration.Name)" }
    Invoke-PsqlFile "/tmp/$($migration.Name)"
  }

  Write-Output "[2/8] Running 71 pgTAP assertions"
  Assert-PgTap "Initial screenshot evidence"

  Write-Output "[3/8] Creating a real submitted screenshot before rollback"
  Invoke-PsqlFile "/tmp/evidence-rollback-use.sql"

  Write-Output "[4/8] Verifying rollback fails closed before any partial mutation"
  docker cp (Join-Path $root "supabase\rollbacks\$rollbackName") "${container}:/tmp/$rollbackName"
  $beforeRejectedRollback = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $database -c `
    "select (to_regclass('public.testing_center_evidence_batches') is not null)::int||':'||(to_regclass('public.testing_center_screenshot_evidence') is not null)::int||':'||(to_regclass('public.testing_center_evidence_outbox') is not null)::int||':'||(to_regprocedure('public.testing_center_prepare_screenshot_batch(text,text,text,jsonb)') is not null)::int||':'||(select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='testing_center_evidence_insert_own_slot')||':'||(select count(*) from storage.buckets where id='testing-center-evidence')||':'||(select count(*) from storage.objects where bucket_id='testing-center-evidence')||':'||(select count(*) from public.testing_center_evidence_batches)||':'||(select count(*) from public.testing_center_screenshot_evidence)||':'||(select count(*) from public.testing_center_evidence_outbox)||':'||(select count(*) from public.testing_center_evidence where kind='screenshot')"
  if ($LASTEXITCODE -ne 0) { throw "Could not snapshot state before rejected rollback" }
  $saved = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $rejectedRollback = docker exec $container psql -X --set=ON_ERROR_STOP=1 --set=VERBOSITY=verbose -U postgres -d $database -f "/tmp/$rollbackName" 2>&1 | Out-String
  $rejectedRollbackCode = $LASTEXITCODE
  $ErrorActionPreference = $saved
  if ($rejectedRollbackCode -eq 0 -or $rejectedRollback -notmatch 'testing_center_evidence_rollback_bucket_not_empty') {
    throw "Rollback with stored objects did not fail closed with the stable error:`n$rejectedRollback"
  }
  $afterRejectedRollback = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $database -c `
    "select (to_regclass('public.testing_center_evidence_batches') is not null)::int||':'||(to_regclass('public.testing_center_screenshot_evidence') is not null)::int||':'||(to_regclass('public.testing_center_evidence_outbox') is not null)::int||':'||(to_regprocedure('public.testing_center_prepare_screenshot_batch(text,text,text,jsonb)') is not null)::int||':'||(select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='testing_center_evidence_insert_own_slot')||':'||(select count(*) from storage.buckets where id='testing-center-evidence')||':'||(select count(*) from storage.objects where bucket_id='testing-center-evidence')||':'||(select count(*) from public.testing_center_evidence_batches)||':'||(select count(*) from public.testing_center_screenshot_evidence)||':'||(select count(*) from public.testing_center_evidence_outbox)||':'||(select count(*) from public.testing_center_evidence where kind='screenshot')"
  if ($LASTEXITCODE -ne 0 -or $afterRejectedRollback.Trim() -ne $beforeRejectedRollback.Trim()) {
    throw "Rejected rollback mutated state partially. Before: $beforeRejectedRollback After: $afterRejectedRollback"
  }

  Write-Output "[5/8] Simulating authorized Storage API deletion and checking exact restoration"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $database -c "delete from storage.objects where bucket_id='testing-center-evidence';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not simulate Storage API metadata deletion" }
  Invoke-PsqlFile "/tmp/$rollbackName"
  $rollback = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $database -c `
    "select (to_regclass('public.testing_center_evidence_batches') is null)::int||':'||(to_regclass('public.testing_center_screenshot_evidence') is null)::int||':'||(to_regclass('public.testing_center_evidence_outbox') is null)::int||':'||(to_regprocedure('public.testing_center_prepare_screenshot_batch(text,text,text,jsonb)') is null)::int||':'||(select count(*) from storage.buckets where id='testing-center-evidence')||':'||(select pg_get_constraintdef(oid) from pg_constraint where conname='testing_center_evidence_kind_check')"
  if ($LASTEXITCODE -ne 0 -or $rollback.Trim() -ne "1:1:1:1:0:CHECK ((kind = ANY (ARRAY['report_context'::text, 'diagnostic'::text, 'reproduction'::text])))") {
    throw "Rollback did not restore the exact prior contract: $rollback"
  }

  Write-Output "[6/8] Reapplying and rerunning pgTAP"
  Invoke-PsqlFile "/tmp/$migrationName"
  Assert-PgTap "Reapplied screenshot evidence"

  Write-Output "[7/8] Running a real two-process finalize race"
  Invoke-PsqlFile "/tmp/evidence-race-seed.sql"
  docker exec $container sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_evidence -f /tmp/evidence-race-a.sql >/tmp/race-a.log 2>&1 & p1=$!; psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_evidence -f /tmp/evidence-race-b.sql >/tmp/race-b.log 2>&1 & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; if [ "$s1" -eq 0 ] && [ "$s2" -eq 0 ]; then exit 0; fi; cat /tmp/race-a.log /tmp/race-b.log; exit 1'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent finalize calls failed" }
  $race = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $database -c `
    "select count(*)||':'||count(*) filter(where not idempotent)||':'||count(*) filter(where idempotent)||':'||count(distinct evidence_id)||':'||(select count(*) from public.testing_center_evidence_outbox where kind='validate')||':'||(select state from public.testing_center_screenshot_evidence)||':'||(select state from public.testing_center_evidence_batches) from public.isa350_concurrency_results"
  if ($LASTEXITCODE -ne 0 -or $race.Trim() -ne "2:1:1:1:1:validating:validating") {
    throw "Concurrent finalize was not exactly-once: $race"
  }

  Write-Output "[8/8] Verifying every pre-existing bucket fails closed"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $database -c "delete from storage.objects where bucket_id='testing-center-evidence';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not simulate Storage API cleanup after concurrency test" }
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

  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $database -c "update storage.buckets set public=false,file_size_limit=10485760,allowed_mime_types=array['image/png','image/jpeg'] where id='testing-center-evidence';" | Out-Null
  $saved = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $closed = docker exec $container psql -X --set=ON_ERROR_STOP=1 --set=VERBOSITY=verbose -U postgres -d $database -f "/tmp/$migrationName" 2>&1 | Out-String
  $closedCode = $LASTEXITCODE
  $ErrorActionPreference = $saved
  if ($closedCode -eq 0 -or $closed -notmatch 'testing_center_evidence_bucket_already_exists') {
    throw "Compatible existing bucket was adopted instead of failing closed:`n$closed"
  }

  Write-Output "Testing Center screenshot evidence: 71/71 + non-empty rollback fail-closed without partial mutation + authorized Storage deletion simulation + exact rollback after submit + reapply 71/71 + concurrent finalize exactly-once + all pre-existing buckets fail-closed PASS"
} finally {
  $ErrorActionPreference = "Continue"
  docker rm -f $container 2>$null | Out-Null
  Remove-Item -LiteralPath $bootstrap,$raceSeed,$raceCallA,$raceCallB,$rollbackUse -Force -ErrorAction SilentlyContinue
}
