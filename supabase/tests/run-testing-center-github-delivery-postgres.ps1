param([string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132")
$ErrorActionPreference = "Stop"
$container = "vantare-testing-github-$([Guid]::NewGuid().ToString('N').Substring(0,12))"
$password = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
function Write-Utf8NoBom([string]$Path,[string]$Content) { [IO.File]::WriteAllText($Path,$Content,(New-Object Text.UTF8Encoding($false))) }
function Run([string]$file) { docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d testing_github -f $file | Out-Null; if($LASTEXITCODE -ne 0){throw "psql failed: $file"} }
function Tap([string]$file,[string]$plan) { $out=docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_github -f $file | Out-String; if($LASTEXITCODE -ne 0 -or $out -match '(?m)^not ok' -or $out -notmatch $plan){throw "pgTAP failed:`n$out"} }
try {
  docker run --rm -d --name $container -e "POSTGRES_PASSWORD=$password" $Image | Out-Null
  $ready=$false
  for($i=0;$i -lt 120;$i++){
    $saved=$ErrorActionPreference; $ErrorActionPreference='Continue'
    $logs=docker logs $container 2>&1 | Out-String; $logsRead=$LASTEXITCODE -eq 0
    docker exec $container pg_isready -U postgres -d postgres 2>$null | Out-Null; $isReady=$LASTEXITCODE -eq 0
    $ErrorActionPreference=$saved
    if($logsRead -and $logs -match 'PostgreSQL init process complete' -and $isReady){$ready=$true;break}
    Start-Sleep -Milliseconds 500
  }
  if(-not $ready){throw "PostgreSQL not ready"}
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
  docker exec $container createdb -U postgres testing_github
  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  $core = Get-ChildItem (Join-Path $root 'supabase\migrations\*.sql') | Where-Object {$_.Name -le '20260802130100_testing_center_core.sql'} | Sort-Object Name
  $cuts = @('20260802140000_testing_center_access.sql','20260802150000_testing_center_report_submission.sql','20260802160000_testing_center_triage_outbox.sql','20260802170000_testing_center_github_delivery.sql')
  foreach($migration in $core){docker cp $migration.FullName "${container}:/tmp/$($migration.Name)"}
  foreach($name in $cuts){docker cp (Join-Path $root "supabase\migrations\$name") "${container}:/tmp/$name"}
  docker cp (Join-Path $root 'supabase\tests\testing_center_github_delivery.test.sql') "${container}:/tmp/github.test.sql"
  docker cp (Join-Path $root 'supabase\rollbacks\20260802170000_testing_center_github_delivery.down.sql') "${container}:/tmp/github.down.sql"
  Run '/tmp/bootstrap.sql'; foreach($migration in $core){Run "/tmp/$($migration.Name)"}; foreach($name in $cuts){Run "/tmp/$name"}
  Tap '/tmp/github.test.sql' '1\.\.28'
  Run '/tmp/github.down.sql'
  $down = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d testing_github -c "select (to_regclass('public.testing_center_github_deliveries') is null)::int || ':' || count(*) from information_schema.columns where table_schema='public' and table_name='testing_center_effect_outbox' and column_name in ('lease_token','lease_expires_at','next_attempt_at','last_error_code','external_issue_number','external_issue_node_id')"
  if($down.Trim() -ne '1:0'){throw "rollback failed: $down"}
  Run '/tmp/20260802170000_testing_center_github_delivery.sql'; Tap '/tmp/github.test.sql' '1\.\.28'
  Write-Output 'Testing Center GitHub delivery: 28/28 + rollback + reapply 28/28 PASS'
} finally { $ErrorActionPreference='Continue'; docker rm -f $container 2>$null | Out-Null; Remove-Item -LiteralPath $bootstrap -Force -ErrorAction SilentlyContinue }
