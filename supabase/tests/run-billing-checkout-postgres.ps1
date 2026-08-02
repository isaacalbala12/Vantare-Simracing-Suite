param(
  [string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.132"
)

$ErrorActionPreference = "Stop"
$container = "vantare-billing-test-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
$postgresPassword = [Guid]::NewGuid().ToString("N")
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$dockerLogStdout = Join-Path $env:TEMP "$container-docker-logs.stdout"
$dockerLogStderr = Join-Path $env:TEMP "$container-docker-logs.stderr"

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  [IO.File]::WriteAllText(
    $Path,
    $Content,
    (New-Object Text.UTF8Encoding($false))
  )
}

try {
  docker run --rm -d --name $container `
    -e "POSTGRES_PASSWORD=$postgresPassword" `
    -e PGDATA=/var/lib/postgresql/data `
    $Image postgres -D /var/lib/postgresql/data | Out-Null
  $initialized = $false
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $logProcess = Start-Process -FilePath "docker" `
      -ArgumentList @("logs", $container) `
      -NoNewWindow -Wait -PassThru `
      -RedirectStandardOutput $dockerLogStdout `
      -RedirectStandardError $dockerLogStderr
    $logStdout = [IO.File]::ReadAllText($dockerLogStdout)
    $logStderr = [IO.File]::ReadAllText($dockerLogStderr)
    if ($logProcess.ExitCode -ne 0) {
      throw "docker logs failed with exit code $($logProcess.ExitCode): $logStderr"
    }
    $logs = $logStdout + [Environment]::NewLine + $logStderr
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

  $bootstrap = Join-Path $env:TEMP "$container-bootstrap.sql"
  $bootstrapSql = @'
do $$ begin create role anon noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role noinherit; exception when duplicate_object then null; end $$;
create extension if not exists pgtap;
create extension if not exists pgcrypto;
create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  provider_customer_id text not null,
  email text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  unique (provider, provider_customer_id)
);
insert into public.billing_customers (
  user_id, provider, provider_customer_id
) values (
  '00000000-0000-4000-8000-000000000030', 'polar', 'legacy-customer'
);
'@
  Write-Utf8NoBom -Path $bootstrap -Content $bootstrapSql

  docker cp $bootstrap "${container}:/tmp/bootstrap.sql"
  docker cp (Join-Path $root "supabase\migrations\20260802000000_billing_checkout_attempts.sql") "${container}:/tmp/migration.sql"
  docker cp (Join-Path $root "supabase\migrations\20260802010000_billing_customer_environment.sql") "${container}:/tmp/customer-environment.sql"
  docker cp (Join-Path $root "supabase\tests\billing_checkout_attempts_test.sql") "${container}:/tmp/test.sql"
  docker cp (Join-Path $root "supabase\tests\billing_customer_environment_test.sql") "${container}:/tmp/customer-environment-test.sql"
  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/bootstrap.sql | Out-Null
  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/migration.sql | Out-Null
  docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/customer-environment.sql | Out-Null
  $checkoutTap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/test.sql | Out-String
  if ($LASTEXITCODE -ne 0 -or $checkoutTap -match "(?m)^not ok" -or $checkoutTap -notmatch "1\.\.18") {
    throw "Checkout pgTAP failed:`n$checkoutTap"
  }
  $customerTap = docker exec $container psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/customer-environment-test.sql | Out-String
  if ($LASTEXITCODE -ne 0 -or $customerTap -match "(?m)^not ok" -or $customerTap -notmatch "1\.\.7") {
    throw "Customer environment pgTAP failed:`n$customerTap"
  }

  $concurrency = @'
insert into auth.users (id) values ('00000000-0000-4000-8000-000000000011') on conflict do nothing;
create table public.checkout_claim_results (outcome text not null);
'@
  $concurrency | docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres -d postgres | Out-Null
  $claimSql = Join-Path $env:TEMP "$container-claim.sql"
  $claimSqlText = @'
insert into public.checkout_claim_results
select outcome from public.claim_billing_checkout_attempt(
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000021',
  'pro_monthly', 'sandbox', 'catalog-v2'
);
'@
  Write-Utf8NoBom -Path $claimSql -Content $claimSqlText
  docker cp $claimSql "${container}:/tmp/claim.sql"
  docker exec $container sh -c '(psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/claim.sql) & (psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/claim.sql) & wait'
  $result = docker exec $container psql -At -U postgres -d postgres -c "select count(*) || ':' || string_agg(outcome, ',' order by outcome) from public.checkout_claim_results"
  if ($result.Trim() -ne "2:busy,claimed") { throw "Concurrent claim contract failed: $result" }
  Write-Output "PostgreSQL checkout adapter: focal/upgrade pgTAP PASS; concurrency PASS ($result)"
} finally {
  docker rm -f $container 2>$null | Out-Null
  if ($bootstrap -and (Test-Path $bootstrap)) { Remove-Item -LiteralPath $bootstrap -Force }
  if ($claimSql -and (Test-Path $claimSql)) { Remove-Item -LiteralPath $claimSql -Force }
  if (Test-Path $dockerLogStdout) { Remove-Item -LiteralPath $dockerLogStdout -Force }
  if (Test-Path $dockerLogStderr) { Remove-Item -LiteralPath $dockerLogStderr -Force }
}
