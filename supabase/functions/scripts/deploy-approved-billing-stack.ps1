param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)]
  [ValidateSet("staging", "production")]
  [string]$Target,

  [Parameter(Mandatory = $true)]
  [ValidateSet("preflight", "apply")]
  [string]$Mode,

  [string]$Confirmation = "",

  [string]$BackupConfirmation = "",

  [string]$VerifiedLocalBackup = "",

  [string]$LocalBackupVerifierPath = (
    Join-Path $PSScriptRoot "verify-supabase-backup-restore.ps1"
  )
)

$ErrorActionPreference = "Stop"

function Assert-EnvironmentVariable {
  param([Parameter(Mandatory = $true)][string]$Name)

  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing required environment variable: $Name"
  }
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

Assert-EnvironmentVariable "SUPABASE_ACCESS_TOKEN"

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI is required"
}

$scriptsRoot = $PSScriptRoot
$supabaseRoot = Resolve-Path (Join-Path $scriptsRoot "..\..")
$repositoryRoot = Resolve-Path (Join-Path $supabaseRoot "..")
$surfaceGuard = Join-Path $scriptsRoot "verify-deploy-surface.ps1"
$functionsDeploy = Join-Path $scriptsRoot "deploy-approved-functions.ps1"

& $surfaceGuard

$requiredFunctionSecrets = @(
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
)

$secretJson = & supabase secrets list --project-ref $ProjectRef --output json
if ($LASTEXITCODE -ne 0) {
  throw "Unable to list Supabase secret names"
}
$secretNames = @($secretJson | ConvertFrom-Json | ForEach-Object { $_.name })
$missingSecrets = @($requiredFunctionSecrets | Where-Object { $_ -notin $secretNames })
if ($missingSecrets.Count -gt 0) {
  throw "Missing required Supabase secret names: $($missingSecrets -join ', ')"
}
Write-Output "Required Supabase secret names are present. Values were not read."

$backupsJson = & supabase backups list --project-ref $ProjectRef --output json
if ($LASTEXITCODE -ne 0) {
  throw "Unable to list Supabase backups"
}
$backupInventory = $backupsJson | ConvertFrom-Json
$backups = @($backupInventory.backups | Where-Object {
  $null -ne $_ -and $_.status -eq "COMPLETED"
})
Write-Output "Supabase completed backup inventory count: $($backups.Count)"

Push-Location $repositoryRoot
try {
  Invoke-CheckedCommand "supabase" @(
    "link",
    "--project-ref", $ProjectRef,
    "--workdir", ".",
    "--yes"
  )

  Invoke-CheckedCommand "supabase" @(
    "db", "push",
    "--linked",
    "--include-all",
    "--dry-run",
    "--workdir", "."
  )

  if ($Mode -eq "preflight") {
    Write-Output "Preflight complete. No migration or Function was deployed."
    return
  }

  $expectedConfirmation = "DEPLOY-BILLING-$ProjectRef"
  if ($Confirmation -cne $expectedConfirmation) {
    throw "Apply blocked: confirmation must exactly match DEPLOY-BILLING-<project-ref>"
  }
  $expectedBackupConfirmation = "BACKUP-VERIFIED-$ProjectRef"
  $expectedLocalBackupConfirmation = "LOCAL-BACKUP-VERIFIED-$ProjectRef"
  $expectedFreshStagingConfirmation = "FRESH-STAGING-VERIFIED-$ProjectRef"
  $hasVerifiedBackup = $backups.Count -gt 0 -and
    $BackupConfirmation -ceq $expectedBackupConfirmation
  $hasLocalBackupCandidate = $Target -eq "production" -and
    $backups.Count -eq 0 -and
    $BackupConfirmation -ceq $expectedLocalBackupConfirmation -and
    -not [string]::IsNullOrWhiteSpace($VerifiedLocalBackup)
  $isVerifiedFreshStaging = $Target -eq "staging" -and
    $backups.Count -eq 0 -and
    $BackupConfirmation -ceq $expectedFreshStagingConfirmation
  if (-not ($hasVerifiedBackup -or $hasLocalBackupCandidate -or $isVerifiedFreshStaging)) {
    throw "Apply blocked: verify a backup, or explicitly verify a fresh empty staging project"
  }
  if ($hasLocalBackupCandidate) {
    $defaultVerifierPath = Join-Path $PSScriptRoot "verify-supabase-backup-restore.ps1"
    $usesTestVerifier = [IO.Path]::GetFullPath($LocalBackupVerifierPath) -ne
      [IO.Path]::GetFullPath($defaultVerifierPath)
    if (
      $usesTestVerifier -and
      ($env:VANTARE_DEPLOY_WRAPPER_TEST_MODE -ne "true" -or
        $ProjectRef -ne "abcdefghijklmnopqrst")
    ) {
      throw "Apply blocked: alternate local backup verifier is test-only"
    }
    if (-not (Test-Path -LiteralPath $LocalBackupVerifierPath -PathType Leaf)) {
      throw "Apply blocked: local backup verifier is missing"
    }
    $resolvedLocalBackup = Resolve-Path -LiteralPath $VerifiedLocalBackup
    $localBackupRoot = Split-Path -Parent $resolvedLocalBackup
    & $LocalBackupVerifierPath `
      -ArchivePath $resolvedLocalBackup `
      -BackupRoot $localBackupRoot `
      -ExpectedProjectRef $ProjectRef `
      -MaxAgeHours 26
    Write-Output "Recent encrypted local backup restored successfully."
  }

  Invoke-CheckedCommand "supabase" @(
    "db", "push",
    "--linked",
    "--include-all",
    "--yes",
    "--workdir", "."
  )

  & $functionsDeploy -ProjectRef $ProjectRef

  $deployedJson = & supabase functions list --project-ref $ProjectRef --output json
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to verify deployed Supabase Functions"
  }
  $deployedFunctions = @($deployedJson | ConvertFrom-Json)
  $requiredFunctions = @(
    "billing-checkout",
    "billing-portal",
    "billing-webhook",
    "license-credential"
  )
  $missingFunctions = @($requiredFunctions | Where-Object {
    $requiredName = $_
    -not ($deployedFunctions | Where-Object {
      $_.name -eq $requiredName -and $_.status -eq "ACTIVE"
    })
  })
  if ($missingFunctions.Count -gt 0) {
    throw "Deployment verification failed for: $($missingFunctions -join ', ')"
  }

  Write-Output "Billing migrations and approved Functions deployed in the required order."
} finally {
  Pop-Location
}
