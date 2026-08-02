$ErrorActionPreference = "Stop"

function Assert-True {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )
  if (-not $Condition) { throw $Message }
}

$projectRef = "abcdefghijklmnopqrst"
$testRoot = Join-Path $env:TEMP "vantare-billing-deploy-$([Guid]::NewGuid())"
$fakeBin = Join-Path $testRoot "bin"
$logPath = Join-Path $testRoot "supabase.log"
$target = Join-Path $PSScriptRoot "deploy-approved-billing-stack.ps1"
$originalPath = $env:PATH
$originalAccessToken = $env:SUPABASE_ACCESS_TOKEN
$originalDatabaseUrl = $env:SUPABASE_DB_URL

New-Item -ItemType Directory -Path $fakeBin -Force | Out-Null

$fakeSupabase = @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArgs)
$line = $CliArgs -join " "
Add-Content -LiteralPath $env:FAKE_SUPABASE_LOG -Value $line

if ($line -like "secrets list*") {
  @(
    "CHECKOUT_CANCEL_URL",
    "CHECKOUT_SUCCESS_URL",
    "OFFLINE_LICENSE_ED25519_PRIVATE_KEY",
    "OFFLINE_LICENSE_KEY_ID",
    "POLAR_ACCESS_TOKEN",
    "POLAR_ENVIRONMENT",
    "POLAR_PRODUCT_MAP",
    "POLAR_TRIAL_ANTI_ABUSE_CONFIRMED",
    "POLAR_WEBHOOK_SECRET",
    "PORTAL_RETURN_URL",
    "PORTAL_RETURN_URL_ALLOWLIST"
  ) | ForEach-Object {
    [pscustomobject]@{ name = $_; status = "ACTIVE" }
  } | ConvertTo-Json
  exit 0
}
if ($line -like "backups list*") {
  $backups = if ($env:FAKE_BACKUP_EMPTY -eq "true") {
    $null
  } else {
    @([pscustomobject]@{ status = "COMPLETED" })
  }
  [pscustomobject]@{ backups = $backups } |
    ConvertTo-Json -Depth 3
  exit 0
}
if ($line -like "functions list*") {
  @(
    "billing-checkout",
    "billing-portal",
    "billing-webhook",
    "license-credential"
  ) | ForEach-Object {
    [pscustomobject]@{ name = $_; status = "ACTIVE" }
  } | ConvertTo-Json
  exit 0
}
exit 0
'@
Set-Content -LiteralPath (Join-Path $fakeBin "supabase.ps1") -Value $fakeSupabase

try {
  $env:PATH = "$fakeBin;$originalPath"
  $env:FAKE_SUPABASE_LOG = $logPath
  $env:SUPABASE_ACCESS_TOKEN = "test-token-not-a-secret"
  $env:SUPABASE_DB_URL =
    "postgresql://postgres@db.$projectRef.supabase.co/postgres"

  $matchingDatabaseUrl = $env:SUPABASE_DB_URL
  $env:SUPABASE_DB_URL =
    "postgresql://postgres@db.zyxwvutsrqponmlkjihg.supabase.co/postgres"
  $targetBlocked = $false
  $targetError = ""
  try {
    & $target -ProjectRef $projectRef -Mode preflight
  } catch {
    $targetError = $_.Exception.Message
    $targetBlocked = $targetError -match
      "SUPABASE_DB_URL does not match SUPABASE_PROJECT_REF"
  }
  Assert-True $targetBlocked `
    "preflight accepted a database from another project; observed: $targetError"
  Assert-True (-not (Test-Path -LiteralPath $logPath)) `
    "project mismatch reached the Supabase CLI"

  $env:SUPABASE_DB_URL =
    "postgresql://postgres.${projectRef}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
  & $target -ProjectRef $projectRef -Mode preflight
  $poolerPreflight = @(Get-Content -LiteralPath $logPath)
  Assert-True ((@($poolerPreflight -match "db push .*--dry-run")).Count -gt 0) `
    "preflight rejected the matching Supabase pooler URL"
  Clear-Content -LiteralPath $logPath

  $env:SUPABASE_DB_URL = $matchingDatabaseUrl

  & $target -ProjectRef $projectRef -Mode preflight
  $preflight = @(Get-Content -LiteralPath $logPath)
  Assert-True ((@($preflight -match "db push .*--dry-run")).Count -gt 0) `
    "preflight did not execute migration dry-run"
  Assert-True ((@($preflight -match "db push .*--yes")).Count -eq 0) `
    "preflight applied migrations"
  Assert-True ((@($preflight -match "functions deploy")).Count -eq 0) `
    "preflight deployed Functions"

  Clear-Content -LiteralPath $logPath
  $blocked = $false
  try {
    & $target -ProjectRef $projectRef -Mode apply `
      -Confirmation "wrong" `
      -BackupConfirmation "BACKUP-VERIFIED-$projectRef"
  } catch {
    $blocked = $_.Exception.Message -match "Apply blocked:"
  }
  Assert-True $blocked "apply accepted an incorrect confirmation"
  $wrongConfirmation = @(Get-Content -LiteralPath $logPath)
  Assert-True ((@($wrongConfirmation -match "db push .*--yes")).Count -eq 0) `
    "blocked apply changed the database"
  Assert-True ((@($wrongConfirmation -match "functions deploy")).Count -eq 0) `
    "blocked apply deployed Functions"

  Clear-Content -LiteralPath $logPath
  $env:FAKE_BACKUP_EMPTY = "true"
  $backupBlocked = $false
  try {
    & $target -ProjectRef $projectRef -Mode apply `
      -Confirmation "DEPLOY-BILLING-$projectRef" `
      -BackupConfirmation "BACKUP-VERIFIED-$projectRef"
  } catch {
    $backupBlocked = $_.Exception.Message -match "Apply blocked:.*backup"
  }
  Assert-True $backupBlocked "apply accepted an empty backup inventory"
  $withoutBackup = @(Get-Content -LiteralPath $logPath)
  Assert-True ((@($withoutBackup -match "db push .*--yes")).Count -eq 0) `
    "apply without backup changed the database"
  Remove-Item Env:FAKE_BACKUP_EMPTY -ErrorAction SilentlyContinue

  Clear-Content -LiteralPath $logPath
  & $target -ProjectRef $projectRef -Mode apply `
    -Confirmation "DEPLOY-BILLING-$projectRef" `
    -BackupConfirmation "BACKUP-VERIFIED-$projectRef"
  $apply = @(Get-Content -LiteralPath $logPath)
  $dryRunIndex = [Array]::FindIndex(
    $apply,
    [Predicate[string]] { param($line) $line -match "db push .*--dry-run" }
  )
  $applyIndex = [Array]::FindIndex(
    $apply,
    [Predicate[string]] { param($line) $line -match "db push .*--yes" }
  )
  $functionIndex = [Array]::FindIndex(
    $apply,
    [Predicate[string]] { param($line) $line -match "functions deploy" }
  )
  Assert-True (
    $dryRunIndex -ge 0 -and $applyIndex -gt $dryRunIndex -and
    $functionIndex -gt $applyIndex
  ) "apply order is not dry-run, migrations, Functions"
  Assert-True ((@($apply -match "^functions deploy ")).Count -eq 4) `
    "apply did not deploy exactly four approved Functions"

  Write-Output "deploy-approved-billing-stack behavior: PASS"
} finally {
  $env:PATH = $originalPath
  $env:SUPABASE_ACCESS_TOKEN = $originalAccessToken
  $env:SUPABASE_DB_URL = $originalDatabaseUrl
  Remove-Item Env:FAKE_SUPABASE_LOG -ErrorAction SilentlyContinue
  Remove-Item Env:FAKE_BACKUP_EMPTY -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
