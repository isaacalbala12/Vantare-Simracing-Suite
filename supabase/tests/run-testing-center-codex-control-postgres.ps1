param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$container = "vantare-testing-codex-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$password = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$raceSeed = Join-Path $env:TEMP "$container-race-seed.sql"
$raceCallA = Join-Path $env:TEMP "$container-race-a.sql"
$raceCallB = Join-Path $env:TEMP "$container-race-b.sql"
$pauseCallA = Join-Path $env:TEMP "$container-pause-a.sql"
$pauseCallB = Join-Path $env:TEMP "$container-pause-b.sql"
$codexMigration = "20260802180000_testing_center_codex_control.sql"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Invoke-PsqlFile([string]$File) {
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_codex -f $File | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $File" }
}

function Assert-PgTap([string]$File, [string]$Plan, [string]$Label) {
  $tap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_codex -f $File | Out-String
  if ($LASTEXITCODE -ne 0 -or $tap -match "(?m)^not ok" -or $tap -notmatch $Plan) {
    throw "$Label pgTAP failed:`n$tap"
  }
}

try {
  docker run --rm -d --name $container -e "POSTGRES_PASSWORD=$password" $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not start disposable PostgreSQL" }
  $ready = $false
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $saved = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $logs = docker logs $container 2>&1 | Out-String
    $logsRead = $LASTEXITCODE -eq 0
    docker exec $container pg_isready -U postgres -d postgres 2>$null | Out-Null
    $isReady = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $saved
    if ($logsRead -and $logs -match "PostgreSQL init process complete" -and $isReady) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Disposable PostgreSQL did not become ready" }

  Write-Utf8NoBom $bootstrap @'
do $$ begin create role anon noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role noinherit bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth; create schema if not exists extensions;
create extension if not exists pgtap; create extension if not exists pgcrypto;
create table if not exists auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to anon,authenticated,service_role;
'@

  Write-Utf8NoBom $raceSeed @'
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000702','codex-race@example.invalid');
set role service_role;
create temporary table isa231_race_diagnostic as
select payload,encode(public.digest(convert_to(payload,'UTF8'),'sha256'),'hex') digest,octet_length(payload)::integer byte_size
from (select jsonb_build_object(
  'contractVersion','testing-center.diagnostic.v1','generatedAtUtc','2026-08-02T00:00:00Z',
  'application',jsonb_build_object('version','0.1.0','channel','nightly','os','windows','arch','amd64'),
  'module','testing_center','errorCode','ui.race',
  'logs','[]'::jsonb,
  'sanitization',jsonb_build_object('inputLogs',0,'includedLogs',0,'omittedLogs',0,'redactedValues',0,'truncatedMessages',0)
)::text payload) source;
insert into public.testing_center_reports(report_id,reporter_id,reporter_user_id,reporter_role,channel,state) values
  ('report_'||repeat('7',64),'race','00000000-0000-4000-8000-000000000702','primary_tester','nightly','validated'),
  ('report_'||repeat('8',64),'race','00000000-0000-4000-8000-000000000702','primary_tester','nightly','validated');
insert into public.testing_center_report_payloads(report_id,action_text,expected_text,observed_text,app_version,os_family,os_version,module,include_diagnostic,include_logs,diagnostic_document,diagnostic_transport_digest,diagnostic_transport_size)
select report_id,'Open Testing Center','Control is ready','Control remains busy','0.1.0','windows','Windows 11','testing_center',true,false,payload::jsonb,digest,byte_size
from (values ('report_'||repeat('7',64)),('report_'||repeat('8',64))) reports(report_id) cross join isa231_race_diagnostic;
insert into public.testing_center_evidence(evidence_id,report_id,kind,digest)
select 'evidence_'||substr(report_id,8),report_id,'diagnostic',digest
from (values ('report_'||repeat('7',64)),('report_'||repeat('8',64))) reports(report_id) cross join isa231_race_diagnostic;
insert into public.testing_center_technical_issues(technical_issue_id,report_id,state,flow_state,origin) values
  ('issue_'||repeat('7',64),'report_'||repeat('7',64),'open','queued','orchestrator'),
  ('issue_'||repeat('8',64),'report_'||repeat('8',64),'open','queued','orchestrator');
select * from public.testing_center_queue_codex_dry_run('issue_'||repeat('7',64),repeat('1',64),(select evidence_digest from public.testing_center_load_codex_evidence('issue_'||repeat('7',64))),repeat('2',40),repeat('3',40),repeat('4',64));
select * from public.testing_center_queue_codex_dry_run('issue_'||repeat('8',64),repeat('5',64),(select evidence_digest from public.testing_center_load_codex_evidence('issue_'||repeat('8',64))),repeat('6',40),repeat('7',40),repeat('8',64));
reset role;
create table public.isa231_concurrency_barrier(participant text primary key);
create table public.isa231_concurrency_results(participant text primary key,claim_status text not null,run_id text not null,fencing_token bigint not null);
grant insert,select on public.isa231_concurrency_results to service_role;
'@

  Write-Utf8NoBom $raceCallA @'
insert into public.isa231_concurrency_barrier values ('a');
do $$ begin for i in 1..1000 loop exit when (select count(*) from public.isa231_concurrency_barrier)=2; perform pg_sleep(0.01); end loop; if (select count(*) from public.isa231_concurrency_barrier)<>2 then raise exception 'barrier_timeout'; end if; end $$;
set role service_role;
insert into public.isa231_concurrency_results select 'a',claim_status,run_id,fencing_token from public.testing_center_claim_codex_dry_run('issue_'||repeat('7',64),'race-worker-a',60);
'@

  Write-Utf8NoBom $raceCallB @'
insert into public.isa231_concurrency_barrier values ('b');
do $$ begin for i in 1..1000 loop exit when (select count(*) from public.isa231_concurrency_barrier)=2; perform pg_sleep(0.01); end loop; if (select count(*) from public.isa231_concurrency_barrier)<>2 then raise exception 'barrier_timeout'; end if; end $$;
set role service_role;
insert into public.isa231_concurrency_results select 'b',claim_status,run_id,fencing_token from public.testing_center_claim_codex_dry_run('issue_'||repeat('8',64),'race-worker-b',60);
'@

  Write-Utf8NoBom $pauseCallA @'
set role service_role;
begin;
insert into public.testing_center_pauses(pause_id,scope,technical_issue_id,is_paused,reason_code,requested_by_id,requested_by_user_id,requested_by_role)
values ('codex-concurrent-pause','global',null,true,'owner_stop','owner','00000000-0000-4000-8000-000000000702','owner');
select pg_sleep(2);
commit;
'@

  Write-Utf8NoBom $pauseCallB @'
set role service_role;
do $$
declare v_issue text; v_worker text; v_fence bigint;
begin
  select technical_issue_id,lease_owner,fencing_token into strict v_issue,v_worker,v_fence
  from public.testing_center_codex_execution_control where state='claimed';
  begin
    perform * from public.testing_center_authorize_codex_dispatch(v_issue,v_worker,v_fence);
    raise exception 'dispatch_was_not_paused';
  exception when sqlstate '55000' then
    if sqlerrm <> 'testing_center_paused' then raise; end if;
  end;
end $$;
'@

  docker exec $container createdb -U postgres testing_codex
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp $raceSeed "${container}:/tmp/race-seed.sql"
  docker cp $raceCallA "${container}:/tmp/race-a.sql"
  docker cp $raceCallB "${container}:/tmp/race-b.sql"
  docker cp $pauseCallA "${container}:/tmp/pause-a.sql"
  docker cp $pauseCallB "${container}:/tmp/pause-b.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_codex_control.test.sql") "${container}:/tmp/codex.test.sql"
  docker cp (Join-Path $root "supabase\rollbacks\20260802180000_testing_center_codex_control.down.sql") "${container}:/tmp/codex.down.sql"

  $migrations = Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") |
    Where-Object { $_.Name -le $codexMigration } | Sort-Object Name
  foreach ($migration in $migrations) { docker cp $migration.FullName "${container}:/tmp/$($migration.Name)" }

  Invoke-PsqlFile "/tmp/bootstrap.sql"
  foreach ($migration in $migrations) { Invoke-PsqlFile "/tmp/$($migration.Name)" }
  Assert-PgTap "/tmp/codex.test.sql" "1\.\.61" "Initial Codex control"

  Invoke-PsqlFile "/tmp/codex.down.sql"
  $rollback = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_codex -c "select (to_regclass('public.testing_center_codex_execution_control') is null)::int||':'||(select count(*) from information_schema.columns where table_schema='public' and table_name='testing_center_report_payloads' and column_name='diagnostic_transport_size')||':'||(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'testing_center_%codex%')||':'||has_function_privilege('authenticated','public.testing_center_submit_report(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text)','execute')::int"
  if ($LASTEXITCODE -ne 0 -or $rollback.Trim() -ne "1:0:0:1") { throw "Codex rollback failed: $rollback" }

  Invoke-PsqlFile "/tmp/$codexMigration"
  Assert-PgTap "/tmp/codex.test.sql" "1\.\.61" "Reapplied Codex control"

  Invoke-PsqlFile "/tmp/race-seed.sql"
  docker exec $container sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_codex -f /tmp/race-a.sql >/tmp/race-a.log 2>&1 & p1=$!; psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_codex -f /tmp/race-b.sql >/tmp/race-b.log 2>&1 & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; if [ "$s1" -eq 0 ] && [ "$s2" -eq 0 ]; then exit 0; fi; cat /tmp/race-a.log /tmp/race-b.log; exit 1'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent Codex claims failed" }
  $race = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_codex -c "select count(*)||':'||count(*) filter(where claim_status='claimed')||':'||count(*) filter(where claim_status='global_busy')||':'||(select count(*) from public.testing_center_codex_execution_control where state='claimed')||':'||(select sum(dispatch_count) from public.testing_center_codex_execution_control) from public.isa231_concurrency_results"
  if ($LASTEXITCODE -ne 0 -or $race.Trim() -ne "2:1:1:1:0") { throw "Global Codex exclusion failed: $race" }

  docker exec $container sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_codex -f /tmp/pause-a.sql >/tmp/pause-a.log 2>&1 & p1=$!; sleep 0.2; psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_codex -f /tmp/pause-b.sql >/tmp/pause-b.log 2>&1; s2=$?; wait $p1; s1=$?; if [ "$s1" -eq 0 ] && [ "$s2" -eq 0 ]; then exit 0; fi; cat /tmp/pause-a.log /tmp/pause-b.log; exit 1'
  if ($LASTEXITCODE -ne 0) { throw "Concurrent pause barrier failed" }
  $pauseRace = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_codex -c "select count(*)||':'||sum(dispatch_count)||':'||(select count(*) from public.testing_center_pauses where pause_id='codex-concurrent-pause' and is_paused) from public.testing_center_codex_execution_control where state='claimed'"
  if ($LASTEXITCODE -ne 0 -or $pauseRace.Trim() -ne "1:0:1") { throw "Concurrent pause did not win before dispatch: $pauseRace" }

  Write-Output "Testing Center Codex control: 61/61 + rollback + reapply 61/61 + two-worker exclusion + concurrent late-pause barrier PASS"
} finally {
  $ErrorActionPreference = "Continue"
  docker rm -f $container 2>$null | Out-Null
  Remove-Item -LiteralPath $bootstrap,$raceSeed,$raceCallA,$raceCallB,$pauseCallA,$pauseCallB -Force -ErrorAction SilentlyContinue
}
