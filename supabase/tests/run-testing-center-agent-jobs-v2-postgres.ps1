param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 10)
$container = "vantare-agent-jobs-$suffix"
$password = [Guid]::NewGuid().ToString("N")
$database = "testing_agent_jobs"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$raceA = Join-Path $env:TEMP "$container-race-a.sql"
$raceB = Join-Path $env:TEMP "$container-race-b.sql"
$migrationName = "20260812214951_testing_center_agent_jobs_v2.sql"
$rollbackName = "20260812214951_testing_center_agent_jobs_v2.down.sql"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Invoke-PsqlFile([string]$File) {
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $database -f $File | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $File" }
}

function Invoke-Psql([string]$Sql) {
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $database -c $Sql | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql command failed" }
}

function Assert-PgTap([string]$Label) {
  $tap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $database -f /tmp/agent-jobs.test.sql | Out-String
  if ($LASTEXITCODE -ne 0 -or $tap -match '(?m)^not ok' -or $tap -notmatch '1\.\.71') {
    throw "$Label pgTAP failed:`n$tap"
  }
}

function Clear-V2History {
  Invoke-Psql @'
truncate table
  public.testing_center_agent_callbacks,
  public.testing_center_agent_reservations,
  public.testing_center_agent_audit,
  public.testing_center_agent_effect_outbox,
  public.testing_center_agent_jobs
restart identity;
'@
}

function Seed-History([string]$Table) {
  $job = @"
insert into public.testing_center_agent_jobs(
  job_key,technical_issue_id,execution_generation,policy_version,
  report_digest,dossier_digest,nightly_base_sha,state
) values (
  public.testing_center_agent_job_key(
    'issue_'||repeat('f',64),repeat('e',64),repeat('c',40),'testing-center.autofix-policy.v2'
  ),'issue_'||repeat('f',64),1,'testing-center.autofix-policy.v2',
  repeat('e',64),repeat('d',64),repeat('c',40),'triage_queued'
);
"@
  switch ($Table) {
    "testing_center_agent_callbacks" {
      Invoke-Psql ($job + @"
insert into public.testing_center_agent_callbacks(
  delivery_id,job_key,head_sha,callback_kind,outcome,payload_digest,disposition
) values ('rollback-callback',public.testing_center_agent_job_key('issue_'||repeat('f',64),repeat('e',64),repeat('c',40),'testing-center.autofix-policy.v2'),repeat('c',40),'triage','eligible',repeat('b',64),'applied');
"@)
    }
    "testing_center_agent_reservations" {
      Invoke-Psql ($job + @"
insert into public.testing_center_agent_reservations(
  reservation_key,job_key,reservation_kind,binding_digest
) values ('rollback-reservation',public.testing_center_agent_job_key('issue_'||repeat('f',64),repeat('e',64),repeat('c',40),'testing-center.autofix-policy.v2'),'branch',repeat('b',64));
"@)
    }
    "testing_center_agent_audit" {
      Invoke-Psql ($job + @"
insert into public.testing_center_agent_audit(
  job_key,execution_generation,policy_version,from_state,to_state,actor,operation_digest
) values (public.testing_center_agent_job_key('issue_'||repeat('f',64),repeat('e',64),repeat('c',40),'testing-center.autofix-policy.v2'),1,'testing-center.autofix-policy.v2','triage_queued','triaged','rollback-test',repeat('b',64));
"@)
    }
    "testing_center_agent_effect_outbox" {
      Invoke-Psql ($job + @"
insert into public.testing_center_agent_effect_outbox(
  effect_id,job_key,effect_kind,effect_target,effect_generation,payload_digest
) values ('rollback-effect',public.testing_center_agent_job_key('issue_'||repeat('f',64),repeat('e',64),repeat('c',40),'testing-center.autofix-policy.v2'),'github_dispatch','triage',1,repeat('b',64));
"@)
    }
    "testing_center_agent_jobs" { Invoke-Psql $job }
    default { throw "Unknown v2 history table $Table" }
  }
}

function Assert-RollbackBlocked([string]$Table) {
  $saved = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = docker exec $container psql -X --set=ON_ERROR_STOP=1 --set=VERBOSITY=verbose -U postgres -d $database -f "/tmp/$rollbackName" 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $saved
  if ($exitCode -eq 0 -or $output -notmatch '55000' -or
      $output -notmatch 'testing_center_agent_jobs_v2_history_exists' -or
      $output -notmatch $Table) {
    throw "Rollback was not fail-closed for $Table`n$output"
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
create extension if not exists pgtap;
create extension if not exists pgcrypto with schema extensions;
create table if not exists auth.users(
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema public,auth,extensions to anon,authenticated,service_role;
'@

  Write-Utf8NoBom $raceA @'
insert into public.isa320_claim_barrier values ('a');
do $$ begin
  for i in 1..1000 loop
    exit when (select count(*) from public.isa320_claim_barrier)=2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa320_claim_barrier)<>2 then raise exception 'barrier_timeout'; end if;
end $$;
set role service_role;
insert into public.isa320_claim_results
select 'a',count(*)::integer from public.testing_center_claim_agent_effect('race-worker-a',60);
'@

  Write-Utf8NoBom $raceB @'
insert into public.isa320_claim_barrier values ('b');
do $$ begin
  for i in 1..1000 loop
    exit when (select count(*) from public.isa320_claim_barrier)=2;
    perform pg_sleep(0.01);
  end loop;
  if (select count(*) from public.isa320_claim_barrier)<>2 then raise exception 'barrier_timeout'; end if;
end $$;
set role service_role;
insert into public.isa320_claim_results
select 'b',count(*)::integer from public.testing_center_claim_agent_effect('race-worker-b',60);
'@

  Write-Output "[1/7] Installing all migrations into disposable PostgreSQL"
  docker exec $container createdb -U postgres $database
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp $raceA "${container}:/tmp/race-a.sql"
  docker cp $raceB "${container}:/tmp/race-b.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_agent_jobs_v2.test.sql") "${container}:/tmp/agent-jobs.test.sql"
  docker cp (Join-Path $root "supabase\rollbacks\$rollbackName") "${container}:/tmp/$rollbackName"
  Invoke-PsqlFile "/tmp/bootstrap.sql"
  $migrations = Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") |
    Where-Object { $_.Name -le $migrationName } | Sort-Object Name
  foreach ($migration in $migrations) {
    docker cp $migration.FullName "${container}:/tmp/$($migration.Name)"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy $($migration.Name)" }
    Invoke-PsqlFile "/tmp/$($migration.Name)"
  }

  Write-Output "[2/7] Running 71 pgTAP assertions"
  Assert-PgTap "Initial agent jobs v2"

  Write-Output "[3/7] Checking empty rollback and exact reapply"
  Invoke-PsqlFile "/tmp/$rollbackName"
  $emptyRollback = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $database -c `
    "select (to_regclass('public.testing_center_agent_jobs') is null)::int||':'||(to_regclass('public.testing_center_technical_issues') is not null)::int||':'||(to_regprocedure('public.testing_center_queue_agent_job(text,text,integer,text,text,text,text)') is null)::int"
  if ($LASTEXITCODE -ne 0 -or $emptyRollback.Trim() -ne '1:1:1') { throw "Empty rollback failed: $emptyRollback" }
  Invoke-PsqlFile "/tmp/$migrationName"
  Assert-PgTap "Reapplied agent jobs v2"

  Write-Output "[4/7] Running a real two-process claim race"
  Invoke-Psql @'
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000321','isa320-race@example.invalid');
insert into public.testing_center_reports(report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
values
  ('report_'||repeat('e',64),'race','00000000-0000-4000-8000-000000000321','primary_tester','nightly','validated'),
  ('report_'||repeat('f',64),'rollback','00000000-0000-4000-8000-000000000321','primary_tester','nightly','validated');
insert into public.testing_center_technical_issues(technical_issue_id,report_id,state,flow_state,origin)
values
  ('issue_'||repeat('e',64),'report_'||repeat('e',64),'open','queued','orchestrator'),
  ('issue_'||repeat('f',64),'report_'||repeat('f',64),'open','queued','orchestrator');
create temporary table isa320_race_key as
select public.testing_center_agent_job_key(
  'issue_'||repeat('e',64),repeat('d',64),repeat('b',40),'testing-center.autofix-policy.v2'
) as job_key;
grant select on isa320_race_key to service_role;
set role service_role;
select * from public.testing_center_queue_agent_job(
  (select job_key from isa320_race_key),
  'issue_'||repeat('e',64),1,'testing-center.autofix-policy.v2',
  repeat('d',64),repeat('c',64),repeat('b',40));
reset role;
create table public.isa320_claim_barrier(participant text primary key);
create table public.isa320_claim_results(participant text primary key,claimed integer not null);
grant insert,select on public.isa320_claim_results to service_role;
'@
  docker exec $container sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_agent_jobs -f /tmp/race-a.sql >/tmp/race-a.log 2>&1 & p1=$!; psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_agent_jobs -f /tmp/race-b.sql >/tmp/race-b.log 2>&1 & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; if [ "$s1" -eq 0 ] && [ "$s2" -eq 0 ]; then exit 0; fi; cat /tmp/race-a.log /tmp/race-b.log; exit 1'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent agent claims failed" }
  $race = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $database -c `
    "select count(*)||':'||sum(claimed)||':'||(select count(*) from public.testing_center_agent_effect_outbox where state='claimed') from public.isa320_claim_results"
  if ($LASTEXITCODE -ne 0 -or $race.Trim() -ne '2:1:1') { throw "Two-worker claim was not exact: $race" }

  Write-Output "[5/7] Verifying fail-closed rollback for every durable v2 table"
  foreach ($table in @(
    'testing_center_agent_callbacks','testing_center_agent_reservations',
    'testing_center_agent_audit','testing_center_agent_effect_outbox','testing_center_agent_jobs'
  )) {
    Clear-V2History
    Seed-History $table
    Assert-RollbackBlocked $table
  }

  Write-Output "[6/7] Verifying rollback after terminal history also remains blocked"
  Clear-V2History
  Invoke-Psql @'
insert into public.testing_center_agent_jobs(
  job_key,technical_issue_id,execution_generation,policy_version,
  report_digest,dossier_digest,nightly_base_sha,state
) values (
  public.testing_center_agent_job_key(
    'issue_'||repeat('f',64),repeat('e',64),repeat('c',40),'testing-center.autofix-policy.v2'
  ),'issue_'||repeat('f',64),1,'testing-center.autofix-policy.v2',
  repeat('e',64),repeat('d',64),repeat('c',40),'completed'
);
'@
  Assert-RollbackBlocked 'testing_center_agent_jobs'

  Write-Output "[7/7] Final empty rollback and reapply"
  Clear-V2History
  Invoke-PsqlFile "/tmp/$rollbackName"
  Invoke-PsqlFile "/tmp/$migrationName"
  $final = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $database -c `
    "select count(*)||':'||(select count(*) from public.testing_center_agent_effect_outbox)||':'||(to_regprocedure('public.testing_center_claim_agent_effect(text,integer)') is not null)::int from public.testing_center_agent_jobs"
  if ($LASTEXITCODE -ne 0 -or $final.Trim() -ne '0:0:1') { throw "Final reapply was not clean: $final" }

  Write-Output "Testing Center agent jobs v2: 71/71 + reapply 71/71 + two-worker exact claim + five-table and terminal rollback guards + final reapply PASS"
} finally {
  $ErrorActionPreference = "Continue"
  docker rm -f $container 2>$null | Out-Null
  Remove-Item -LiteralPath $bootstrap,$raceA,$raceB -Force -ErrorAction SilentlyContinue
}
