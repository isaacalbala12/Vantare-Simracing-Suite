param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)]
  [ValidateSet("preflight", "apply")]
  [string]$Mode,

  [string]$Confirmation = "",

  [string]$BackupConfirmation = ""
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
Assert-EnvironmentVariable "SUPABASE_DB_URL"

try {
  $databaseUri = [Uri]$env:SUPABASE_DB_URL
} catch {
  throw "SUPABASE_DB_URL is not a valid URI"
}
if ($databaseUri.Scheme -notin @("postgres", "postgresql")) {
  throw "SUPABASE_DB_URL must use postgres or postgresql"
}
$databaseUser = ($databaseUri.UserInfo -split ':', 2)[0]
$directHost = "db.$ProjectRef.supabase.co"
$poolerUser = "postgres.$ProjectRef"
$matchesDirect = $databaseUri.Host.Equals(
  $directHost,
  [StringComparison]::OrdinalIgnoreCase
)
$matchesPooler = $databaseUser.Equals(
  $poolerUser,
  [StringComparison]::Ordinal
)
if (-not ($matchesDirect -or $matchesPooler)) {
  throw "SUPABASE_DB_URL does not match SUPABASE_PROJECT_REF"
}

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI is required"
}

$scriptsRoot = $PSScriptRoot
$supabaseRoot = Resolve-Path (Join-Path $scriptsRoot "..\..")
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
$backups = @($backupInventory.backups | Where-Object { $null -ne $_ })
Write-Output "Supabase backup inventory count: $($backups.Count)"

Push-Location $supabaseRoot
try {
  Invoke-CheckedCommand "supabase" @(
    "db", "push",
    "--db-url", $env:SUPABASE_DB_URL,
    "--include-all",
    "--dry-run"
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
  if ($backups.Count -eq 0 -or $BackupConfirmation -cne $expectedBackupConfirmation) {
    throw "Apply blocked: a verified remote backup is required"
  }

  Invoke-CheckedCommand "supabase" @(
    "db", "push",
    "--db-url", $env:SUPABASE_DB_URL,
    "--include-all",
    "--yes"
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
