param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")

$ErrorActionPreference = "Stop"
$container = "vantare-testing-feedback-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$password = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
$raceSeed = Join-Path $env:TEMP "$container-race-seed.sql"
$raceA = Join-Path $env:TEMP "$container-race-a.sql"
$raceB = Join-Path $env:TEMP "$container-race-b.sql"
$migration = "20260803120000_testing_center_candidate_feedback.sql"
$rollback = "20260803120000_testing_center_candidate_feedback.down.sql"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}
function Invoke-PsqlFile([string]$Database, [string]$File) {
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database -f $File | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $Database $File" }
}
function Assert-PgTap([string]$Database, [string]$File, [string]$Plan, [string]$Label) {
  $tap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $Database -f $File | Out-String
  if ($LASTEXITCODE -ne 0 -or $tap -match "(?m)^not ok" -or $tap -notmatch $Plan) {
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
  Write-Utf8NoBom $raceSeed @'
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000490','race-primary@example.invalid'),
 ('00000000-0000-4000-8000-000000000491','race-owner@example.invalid');
set role service_role;
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('00000000-0000-4000-8000-000000000490','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','primary_tester'),
 ('00000000-0000-4000-8000-000000000491','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner');
insert into public.testing_center_reports(report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
values ('isa241-race-report','race-owner','00000000-0000-4000-8000-000000000491','owner','nightly','validated');
insert into public.testing_center_technical_issues(technical_issue_id,report_id,state,flow_state,origin)
values ('issue_' || repeat('6',64),'isa241-race-report','open','nightly_candidate','orchestrator');
insert into public.testing_center_candidate_builds(candidate_id,technical_issue_id,channel,build_version,exact_sha,author_id,state)
values ('candidate-race','issue_' || repeat('6',64),'nightly','1.0.0-nightly.race',repeat('6',40),
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','pending');
reset role;
create table public.isa241_race_barrier(participant text primary key);
create table public.isa241_race_results(participant text primary key,validation_id text not null,idempotent boolean not null);
create function public.isa241_race_call()
returns table(validation_id text,idempotent boolean) language plpgsql as $$
declare v_projection jsonb; v_digest_source text; v_projection_digest text;
begin
 v_projection:=jsonb_build_object(
  'contractVersion','testing-center.rejection.v1','operation','record_validation',
  'issueId','issue_' || repeat('6',64),'candidateId','candidate-race','channel','nightly',
  'appVersion','1.0.0-nightly.race','candidateSha',repeat('6',40),
  'actorRole','primary_tester','decision','accepted',
  'replayKey','validation:issue_' || repeat('6',64) || ':candidate-race:nightly:'
    || repeat('6',40) || ':aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'decisionDigest',repeat('6',64),'projectionDigest',repeat('6',64),
  'detailsMarkdown',null,'sanitization',jsonb_build_object('redactedValues',0,'truncatedFields',0));
 v_digest_source := (v_projection - 'projectionDigest')::text;
 v_projection_digest := encode(public.digest(
  convert_to(v_digest_source,'UTF8'),'sha256'),'hex');
 v_projection := jsonb_set(
  v_projection,'{projectionDigest}',to_jsonb(v_projection_digest));
 return query select result_validation_id,result_idempotent
 from public.testing_center_record_validation_projection(
  v_projection,v_projection::text,v_digest_source,v_projection_digest,
  encode(public.digest(convert_to(v_projection::text,'UTF8'),'sha256'),'hex'),
  '00000000-0000-4000-8000-000000000490');
end $$;
'@
  Write-Utf8NoBom $raceA @'
insert into public.isa241_race_barrier values ('a');
do $$ begin for i in 1..1000 loop exit when (select count(*) from public.isa241_race_barrier)=2; perform pg_sleep(0.01); end loop; if (select count(*) from public.isa241_race_barrier)<>2 then raise exception 'barrier_timeout'; end if; end $$;
insert into public.isa241_race_results select 'a',validation_id,idempotent from public.isa241_race_call();
'@
  Write-Utf8NoBom $raceB @'
insert into public.isa241_race_barrier values ('b');
do $$ begin for i in 1..1000 loop exit when (select count(*) from public.isa241_race_barrier)=2; perform pg_sleep(0.01); end loop; if (select count(*) from public.isa241_race_barrier)<>2 then raise exception 'barrier_timeout'; end if; end $$;
insert into public.isa241_race_results select 'b',validation_id,idempotent from public.isa241_race_call();
'@

  Write-Output "[1/7] PostgreSQL ready; applying migrations through ISA-241"
  docker exec $container createdb -U postgres testing_feedback
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp $raceSeed "${container}:/tmp/race-seed.sql"
  docker cp $raceA "${container}:/tmp/race-a.sql"
  docker cp $raceB "${container}:/tmp/race-b.sql"
  docker cp (Join-Path $root "supabase\tests\testing_center_candidate_feedback.test.sql") "${container}:/tmp/feedback.test.sql"
  docker cp (Join-Path $root "supabase\rollbacks\$rollback") "${container}:/tmp/$rollback"
  $migrations=Get-ChildItem (Join-Path $root "supabase\migrations\*.sql") |
    Where-Object {$_.Name -le $migration} | Sort-Object Name
  foreach($item in $migrations){docker cp $item.FullName "${container}:/tmp/$($item.Name)"}
  Invoke-PsqlFile "testing_feedback" "/tmp/bootstrap.sql"
  foreach($item in $migrations){Invoke-PsqlFile "testing_feedback" "/tmp/$($item.Name)"}

  Write-Output "[2/7] Running 45 pgTAP assertions"
  Assert-PgTap "testing_feedback" "/tmp/feedback.test.sql" "1\.\.45" "Initial candidate feedback"

  Write-Output "[3/7] Checking zero-history rollback preserves TAU-07F"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_feedback -c @"
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000499','rollback@example.invalid');
set role service_role;
insert into public.testing_center_memberships(user_id,actor_id,role)
values ('00000000-0000-4000-8000-000000000499','dddddddd-dddd-4ddd-8ddd-dddddddddddd','owner');
insert into public.testing_center_pauses(pause_id,scope,is_paused,reason_code,requested_by_id,requested_by_user_id,requested_by_role,origin)
values ('isa241-rollback','global',true,'migration_rollback','dddddddd-dddd-4ddd-8ddd-dddddddddddd','00000000-0000-4000-8000-000000000499','owner','testing_center');
reset role;
"@ | Out-Null
  Invoke-PsqlFile "testing_feedback" "/tmp/$rollback"
  $down=docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_feedback -c `
    "select (to_regclass('public.testing_center_validation_snapshots') is null)::int || ':' || (to_regclass('public.testing_center_linear_webhook_deliveries') is not null)::int || ':' || has_function_privilege('authenticated','public.testing_center_validate_candidate(text,text,text,text,text,text)','EXECUTE')::int"
  if($LASTEXITCODE -ne 0 -or $down.Trim() -ne '1:1:1'){throw "Rollback did not preserve TAU-07F: $down"}

  Write-Output "[4/7] Reapplying and rerunning 45 pgTAP assertions"
  Invoke-PsqlFile "testing_feedback" "/tmp/$migration"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_feedback -c "update public.testing_center_pauses set is_paused=false where pause_id='isa241-rollback'" | Out-Null
  Assert-PgTap "testing_feedback" "/tmp/feedback.test.sql" "1\.\.45" "Reapplied candidate feedback"

  Write-Output "[5/7] Proving rollback refuses durable feedback history"
  docker exec $container createdb -U postgres -T testing_feedback testing_feedback_guard
  Invoke-PsqlFile "testing_feedback_guard" "/tmp/race-seed.sql"
  docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_feedback_guard -c "select * from public.isa241_race_call(); update public.testing_center_pauses set is_paused=true where pause_id='isa241-rollback'" | Out-Null
  Assert-ScriptFails "testing_feedback_guard" "/tmp/$rollback" "testing_center_feedback_rollback_has_history"

  Write-Output "[6/7] Running a real two-process identical-vote race"
  Invoke-PsqlFile "testing_feedback" "/tmp/race-seed.sql"
  docker exec $container sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_feedback -f /tmp/race-a.sql >/tmp/race-a.log 2>&1 & p1=$!; psql -X -q -v ON_ERROR_STOP=1 -U postgres -d testing_feedback -f /tmp/race-b.sql >/tmp/race-b.log 2>&1 & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; if [ "$s1" -eq 0 ] && [ "$s2" -eq 0 ]; then exit 0; fi; cat /tmp/race-a.log /tmp/race-b.log; exit 1'
  if($LASTEXITCODE -ne 0){throw "Concurrent feedback race failed"}
  $race=docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_feedback -c `
    "select count(*) || ':' || count(*) filter(where not idempotent) || ':' || count(*) filter(where idempotent) || ':' || count(distinct validation_id) || ':' || (select count(*) from public.testing_center_validation_snapshots where candidate_id='candidate-race') || ':' || (select state from public.testing_center_candidate_builds where candidate_id='candidate-race') from public.isa241_race_results"
  if($LASTEXITCODE -ne 0 -or $race.Trim() -ne '2:1:1:1:1:accepted'){throw "Race not exactly once: $race"}

  Write-Output "[7/7] Confirming disposable container cleanup boundary"
  Write-Output "Testing Center candidate feedback: 45/45 + rollback/reapply 45/45 + history guard + two-process exactly-once PASS"
} finally {
  $ErrorActionPreference="Continue"
  docker rm -f $container 2>$null | Out-Null
  Remove-Item -LiteralPath $bootstrap,$raceSeed,$raceA,$raceB -Force -ErrorAction SilentlyContinue
}
