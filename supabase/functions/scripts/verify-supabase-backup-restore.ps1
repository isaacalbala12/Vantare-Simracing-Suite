param(
  [Parameter(Mandatory = $true)][string]$ArchivePath,
  [Parameter(Mandatory = $true)][string]$BackupRoot,
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ExpectedProjectRef = "",
  [ValidateRange(1, 168)][int]$MaxAgeHours = 26
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "supabase-backup-common.ps1")

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required for restore verification"
}
Assert-VantarePathInsideRoot -Path $ArchivePath -Root $BackupRoot
if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
  throw "Backup archive is missing"
}
if (
  ((Get-Item -LiteralPath $ArchivePath).Attributes -band
    [IO.FileAttributes]::Encrypted) -eq 0
) {
  throw "Backup archive is not encrypted with EFS"
}

$verifyDirectory = Join-Path $BackupRoot ".verify-$([guid]::NewGuid().ToString('N'))"
$containerName = "vantare-supabase-restore-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$containerStarted = $false

try {
  Assert-VantarePathInsideRoot -Path $verifyDirectory -Root $BackupRoot
  New-Item -ItemType Directory -Path $verifyDirectory | Out-Null
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $verifyDirectory
  $manifest = Test-VantareBackupManifest -Directory $verifyDirectory

  if ($ExpectedProjectRef -and $manifest.projectRef -cne $ExpectedProjectRef) {
    throw "Backup project reference does not match the deployment target"
  }
  $createdAt = [DateTimeOffset]::Parse(
    [string]$manifest.createdAtUtc,
    [Globalization.CultureInfo]::InvariantCulture
  )
  $age = [DateTimeOffset]::UtcNow - $createdAt.ToUniversalTime()
  if ($age.TotalMinutes -lt -5 -or $age.TotalHours -gt $MaxAgeHours) {
    throw "Backup is outside the permitted deployment age"
  }

  $postgresVersion = [string]$manifest.postgresVersion
  if ($postgresVersion -notmatch '^\d+\.\d+\.\d+\.\d+$') {
    throw "Backup manifest has no usable Supabase Postgres version"
  }
  $image = "public.ecr.aws/supabase/postgres:$postgresVersion"
  & docker run --detach --rm `
    --name $containerName `
    --env POSTGRES_PASSWORD=vantare-local-restore-only `
    $image | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not start the disposable restore database"
  }
  $containerStarted = $true

  $healthy = $false
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $health = (& docker inspect `
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' `
      $containerName 2>$null).Trim()
    if ($LASTEXITCODE -eq 0 -and $health -eq "healthy") {
      $healthy = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $healthy) {
    throw "Disposable restore database did not become healthy"
  }

  & docker exec $containerName mkdir -p /backup
  if ($LASTEXITCODE -ne 0) {
    throw "Could not prepare the disposable restore directory"
  }

  foreach ($name in @("schema.sql", "public-data.sql")) {
    & docker cp (Join-Path $verifyDirectory $name) "${containerName}:/backup/$name"
    if ($LASTEXITCODE -ne 0) {
      throw "Could not copy a dump file into the restore database"
    }
  }

  function Invoke-PrivateDockerPsql {
    param(
      [Parameter(Mandatory = $true)][string[]]$Arguments,
      [Parameter(Mandatory = $true)][string]$LogPath,
      [Parameter(Mandatory = $true)][string]$FailureMessage
    )
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      # psql can include row contents in COPY errors. Keep both streams inside
      # the EFS directory and let only the native exit code escape.
      $ErrorActionPreference = "Continue"
      & docker exec $containerName psql @Arguments 1> $LogPath 2>&1
      $psqlExitCode = $LASTEXITCODE
      if ($psqlExitCode -ne 0) {
        throw $FailureMessage
      }
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
      Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
    }
  }

  $schemaLog = Join-Path $verifyDirectory ".schema-restore.log"
  try {
    Invoke-PrivateDockerPsql `
      -Arguments @(
        "--username", "postgres",
        "--dbname", "postgres",
        "--single-transaction",
        "--set", "ON_ERROR_STOP=1",
        "--file", "/backup/schema.sql"
      ) `
      -LogPath $schemaLog `
      -FailureMessage "Schema restore verification failed"
  } finally {
    Remove-Item -LiteralPath $schemaLog -Force -ErrorAction SilentlyContinue
  }

  $dataLog = Join-Path $verifyDirectory ".data-restore.log"
  try {
    Invoke-PrivateDockerPsql `
      -Arguments @(
        "--username", "postgres",
        "--dbname", "postgres",
        "--single-transaction",
        "--set", "ON_ERROR_STOP=1",
        "--command", "SET session_replication_role = replica",
        "--file", "/backup/public-data.sql"
      ) `
      -LogPath $dataLog `
      -FailureMessage "Public data restore verification failed"
  } finally {
    Remove-Item -LiteralPath $dataLog -Force -ErrorAction SilentlyContinue
  }

  $tableCount = (& docker exec $containerName psql `
    --username postgres `
    --dbname postgres `
    --tuples-only `
    --no-align `
    --command "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"
  ).Trim()
  if ($LASTEXITCODE -ne 0 -or [int]$tableCount -lt 1) {
    throw "Restored backup has no public application tables"
  }

  Write-Output "restore_verification=PASS public_tables=$tableCount"
} finally {
  if ($containerStarted) {
    & docker rm --force $containerName 2>$null | Out-Null
  }
  if (Test-Path -LiteralPath $verifyDirectory) {
    Assert-VantarePathInsideRoot -Path $verifyDirectory -Root $BackupRoot
    [IO.Directory]::Delete($verifyDirectory, $true)
  }
}
