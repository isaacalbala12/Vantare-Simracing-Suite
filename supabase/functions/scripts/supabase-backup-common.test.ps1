$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "supabase-backup-common.ps1")

$testRoot = Join-Path $env:TEMP "vantare-backup-test-$([guid]::NewGuid().ToString('N'))"
try {
  New-Item -ItemType Directory -Path $testRoot | Out-Null

  $inside = Join-Path $testRoot "inside\file.txt"
  Assert-VantarePathInsideRoot -Path $inside -Root $testRoot
  $outsideRejected = $false
  try {
    Assert-VantarePathInsideRoot -Path (Join-Path $env:TEMP "outside.txt") -Root $testRoot
  } catch {
    $outsideRejected = $true
  }
  if (-not $outsideRejected) {
    throw "Outside-root path was accepted"
  }

  $secretPath = Join-Path $testRoot "secret.dpapi"
  Protect-VantareSecretToFile -Secret "only-for-local-roundtrip" -Path $secretPath
  if ((Unprotect-VantareSecretFromFile -Path $secretPath) -ne "only-for-local-roundtrip") {
    throw "DPAPI secret roundtrip failed"
  }

  foreach ($name in @(
    "roles.sql",
    "schema.sql",
    "data.sql",
    "public-data.sql",
    "migration-history-schema.sql",
    "migration-history-data.sql"
  )) {
    Set-Content -LiteralPath (Join-Path $testRoot $name) -Value "-- $name" -Encoding ASCII
  }
  New-VantareBackupManifest `
    -Directory $testRoot `
    -ProjectRef "ombjshwzqgeisazijduq" `
    -CreatedAtUtc "2026-08-02T00:00:00Z" `
    -SupabaseCliVersion "test" `
    -PostgresVersion "17.6.1.155" | Out-Null
  Test-VantareBackupManifest -Directory $testRoot | Out-Null

  Add-Content -LiteralPath (Join-Path $testRoot "data.sql") -Value "tampered"
  $tamperRejected = $false
  try {
    Test-VantareBackupManifest -Directory $testRoot | Out-Null
  } catch {
    $tamperRejected = $true
  }
  if (-not $tamperRejected) {
    throw "Tampered dump was accepted"
  }

  $installer = Get-Content -LiteralPath (Join-Path $PSScriptRoot "install-supabase-backup-task.ps1") -Raw
  if ($installer -match 'SUPABASE_(ACCESS_TOKEN|DB_PASSWORD)[^\r\n]*-Argument') {
    throw "Scheduled task arguments expose a Supabase secret"
  }
  foreach ($required in @(
    "ConvertFrom-SecureString",
    "cipher.exe /E",
    "StartWhenAvailable",
    "RunOnlyIfNetworkAvailable",
    "MultipleInstances IgnoreNew"
  )) {
    $combined = (Get-Content -LiteralPath (Join-Path $PSScriptRoot "supabase-backup-common.ps1") -Raw) + $installer
    if (-not $combined.Contains($required)) {
      throw "Required backup safety control is missing: $required"
    }
  }

  $runner = Get-Content -LiteralPath (Join-Path $PSScriptRoot "backup-supabase-production.ps1") -Raw
  if ($runner -match '\$VerifyScriptPath\s*=\s*\(Join-Path\s+\$PSScriptRoot') {
    throw "Runner uses PSScriptRoot before script parameter binding completes"
  }
  foreach ($requiredRunnerControl in @(
    '$ErrorActionPreference = "Continue"',
    '$stage = "roles_dump"',
    '"$($stage)_failed"',
    '[IO.Directory]::Delete($runDirectory, $true)'
  )) {
    if (-not $runner.Contains($requiredRunnerControl)) {
      throw "Runner safety control is missing: $requiredRunnerControl"
    }
  }

  Write-Output "supabase_backup_common_tests=PASS"
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    Assert-VantarePathInsideRoot -Path $testRoot -Root $env:TEMP
    [IO.Directory]::Delete($testRoot, $true)
  }
}
