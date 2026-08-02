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
$verifyLogPath = Join-Path $testRoot "verify.log"
$target = Join-Path $PSScriptRoot "deploy-approved-billing-stack.ps1"
$originalPath = $env:PATH
$originalAccessToken = $env:SUPABASE_ACCESS_TOKEN

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
$fakeVerifier = Join-Path $testRoot "verify-local-backup.ps1"
Set-Content -LiteralPath $fakeVerifier -Value @'
param(
  [string]$ArchivePath,
  [string]$BackupRoot,
  [string]$ExpectedProjectRef,
  [int]$MaxAgeHours
)
"archive=$ArchivePath root=$BackupRoot ref=$ExpectedProjectRef age=$MaxAgeHours" |
  Set-Content -LiteralPath $env:FAKE_VERIFY_LOG
'@
$fakeLocalBackup = Join-Path $testRoot "supabase-$projectRef-test.zip"
Set-Content -LiteralPath $fakeLocalBackup -Value "fake archive"

try {
  $env:PATH = "$fakeBin;$originalPath"
  $env:FAKE_SUPABASE_LOG = $logPath
  $env:FAKE_VERIFY_LOG = $verifyLogPath
  $env:VANTARE_DEPLOY_WRAPPER_TEST_MODE = "true"
  $env:SUPABASE_ACCESS_TOKEN = "test-token-not-a-secret"

  & $target -ProjectRef $projectRef -Target staging -Mode preflight
  $preflight = @(Get-Content -LiteralPath $logPath)
  Assert-True (
    (@($preflight -match "^link --project-ref $projectRef ")).Count -eq 1
  ) "preflight did not link to the exact requested project"
  Assert-True ((@($preflight -match "db push --linked .*--dry-run")).Count -gt 0) `
    "preflight did not use passwordless linked migration access"
  Assert-True ((@($preflight -match "db push .*--dry-run")).Count -gt 0) `
    "preflight did not execute migration dry-run"
  Assert-True ((@($preflight -match "--db-url")).Count -eq 0) `
    "preflight accepted a persistent database credential"
  Assert-True ((@($preflight -match "db push .*--yes")).Count -eq 0) `
    "preflight applied migrations"
  Assert-True ((@($preflight -match "functions deploy")).Count -eq 0) `
    "preflight deployed Functions"

  Clear-Content -LiteralPath $logPath
  $blocked = $false
  try {
    & $target -ProjectRef $projectRef -Target staging -Mode apply `
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
    & $target -ProjectRef $projectRef -Target production -Mode apply `
      -Confirmation "DEPLOY-BILLING-$projectRef" `
      -BackupConfirmation "BACKUP-VERIFIED-$projectRef"
  } catch {
    $backupBlocked = $_.Exception.Message -match "Apply blocked:.*backup"
  }
  Assert-True $backupBlocked "apply accepted an empty backup inventory"
  $withoutBackup = @(Get-Content -LiteralPath $logPath)
  Assert-True ((@($withoutBackup -match "db push .*--yes")).Count -eq 0) `
    "apply without backup changed the database"

  Clear-Content -LiteralPath $logPath
  $productionFreshBlocked = $false
  try {
    & $target -ProjectRef $projectRef -Target production -Mode apply `
      -Confirmation "DEPLOY-BILLING-$projectRef" `
      -BackupConfirmation "FRESH-STAGING-VERIFIED-$projectRef"
  } catch {
    $productionFreshBlocked = $_.Exception.Message -match "Apply blocked:"
  }
  Assert-True $productionFreshBlocked `
    "production accepted the fresh-staging backup exception"

  Clear-Content -LiteralPath $logPath
  $missingLocalPathBlocked = $false
  try {
    & $target -ProjectRef $projectRef -Target production -Mode apply `
      -Confirmation "DEPLOY-BILLING-$projectRef" `
      -BackupConfirmation "LOCAL-BACKUP-VERIFIED-$projectRef"
  } catch {
    $missingLocalPathBlocked = $_.Exception.Message -match "Apply blocked:"
  }
  Assert-True $missingLocalPathBlocked `
    "production accepted a local backup confirmation without an archive"

  Clear-Content -LiteralPath $logPath
  $alternateVerifierBlocked = $false
  $nonTestProjectRef = "bbbbbbbbbbbbbbbbbbbb"
  try {
    & $target -ProjectRef $nonTestProjectRef -Target production -Mode apply `
      -Confirmation "DEPLOY-BILLING-$nonTestProjectRef" `
      -BackupConfirmation "LOCAL-BACKUP-VERIFIED-$nonTestProjectRef" `
      -VerifiedLocalBackup $fakeLocalBackup `
      -LocalBackupVerifierPath $fakeVerifier
  } catch {
    $alternateVerifierBlocked = $_.Exception.Message -match "test-only"
  }
  Assert-True $alternateVerifierBlocked `
    "a non-test target accepted an alternate backup verifier"

  Clear-Content -LiteralPath $logPath
  & $target -ProjectRef $projectRef -Target production -Mode apply `
    -Confirmation "DEPLOY-BILLING-$projectRef" `
    -BackupConfirmation "LOCAL-BACKUP-VERIFIED-$projectRef" `
    -VerifiedLocalBackup $fakeLocalBackup `
    -LocalBackupVerifierPath $fakeVerifier
  $localBackupApply = @(Get-Content -LiteralPath $logPath)
  $verifyInvocation = Get-Content -LiteralPath $verifyLogPath -Raw
  Assert-True ($verifyInvocation -match "ref=$projectRef age=26") `
    "production did not verify the exact local backup target and age"
  Assert-True ((@($localBackupApply -match "db push .*--yes")).Count -eq 1) `
    "verified local backup did not unlock production apply"

  Clear-Content -LiteralPath $logPath
  & $target -ProjectRef $projectRef -Target staging -Mode apply `
    -Confirmation "DEPLOY-BILLING-$projectRef" `
    -BackupConfirmation "FRESH-STAGING-VERIFIED-$projectRef"
  $freshStaging = @(Get-Content -LiteralPath $logPath)
  Assert-True ((@($freshStaging -match "db push .*--yes")).Count -eq 1) `
    "verified fresh staging did not apply migrations"
  Assert-True ((@($freshStaging -match "^functions deploy ")).Count -eq 4) `
    "verified fresh staging did not deploy the four approved Functions"
  Remove-Item Env:FAKE_BACKUP_EMPTY -ErrorAction SilentlyContinue

  Clear-Content -LiteralPath $logPath
  & $target -ProjectRef $projectRef -Target production -Mode apply `
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
  Remove-Item Env:FAKE_SUPABASE_LOG -ErrorAction SilentlyContinue
  Remove-Item Env:FAKE_VERIFY_LOG -ErrorAction SilentlyContinue
  Remove-Item Env:FAKE_BACKUP_EMPTY -ErrorAction SilentlyContinue
  Remove-Item Env:VANTARE_DEPLOY_WRAPPER_TEST_MODE -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
