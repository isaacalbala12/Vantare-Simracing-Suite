param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)][string]$BackupRoot,
  [Parameter(Mandatory = $true)][string]$SecretRoot,
  [Parameter(Mandatory = $true)][string]$SupabaseWorkDir,
  [ValidateRange(2, 365)][int]$RetentionDays = 30,
  [string]$VerifyScriptPath = (Join-Path $PSScriptRoot "verify-supabase-backup-restore.ps1")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "supabase-backup-common.ps1")

function Write-BackupEvent {
  param(
    [Parameter(Mandatory = $true)][string]$Status,
    [string]$Archive = "",
    [string]$Message = ""
  )
  $event = [ordered]@{
    atUtc = [DateTimeOffset]::UtcNow.ToString("O")
    projectRef = $ProjectRef
    status = $Status
    archive = $Archive
    message = $Message
  }
  $event | ConvertTo-Json -Compress | Add-Content `
    -LiteralPath (Join-Path $BackupRoot "backup-events.jsonl") `
    -Encoding UTF8
}

Assert-VantareWindowsHost
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI is required"
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required for restore verification"
}
if (-not (Test-Path -LiteralPath $SupabaseWorkDir -PathType Container)) {
  throw "The isolated Supabase work directory is missing"
}
$linkedProjectRefPath = Join-Path $SupabaseWorkDir "supabase\.temp\project-ref"
if (-not (Test-Path -LiteralPath $linkedProjectRefPath -PathType Leaf)) {
  throw "The isolated Supabase project link is missing"
}
$linkedProjectRef = (Get-Content -LiteralPath $linkedProjectRefPath -Raw).Trim()
if ($linkedProjectRef -cne $ProjectRef) {
  throw "The isolated Supabase project link does not match the backup target"
}
if (-not (Test-Path -LiteralPath $VerifyScriptPath -PathType Leaf)) {
  throw "Restore verification script is missing"
}

$backupAttributes = (Get-Item -LiteralPath $BackupRoot).Attributes
if (($backupAttributes -band [IO.FileAttributes]::Encrypted) -eq 0) {
  throw "Backup root must be encrypted with EFS"
}

$mutex = New-Object Threading.Mutex(
  $false,
  "Local\VantareSupabaseBackup_$ProjectRef"
)
$hasMutex = $false
$runDirectory = $null
$accessToken = $null
$databasePassword = $null

try {
  $hasMutex = $mutex.WaitOne(0)
  if (-not $hasMutex) {
    throw "Another Vantare Supabase backup is already running"
  }

  $timestamp = [DateTimeOffset]::UtcNow.ToString("yyyyMMddTHHmmssZ")
  $runDirectory = Join-Path $BackupRoot ".run-$timestamp-$([guid]::NewGuid().ToString('N'))"
  Assert-VantarePathInsideRoot -Path $runDirectory -Root $BackupRoot
  New-Item -ItemType Directory -Path $runDirectory | Out-Null

  $accessToken = Unprotect-VantareSecretFromFile `
    (Join-Path $SecretRoot "supabase-access-token.dpapi")
  $databasePassword = Unprotect-VantareSecretFromFile `
    (Join-Path $SecretRoot "supabase-db-password.dpapi")
  $env:SUPABASE_ACCESS_TOKEN = $accessToken
  $env:SUPABASE_DB_PASSWORD = $databasePassword

  function Invoke-SupabaseDump {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $commandLog = Join-Path $runDirectory ".supabase-command-$([guid]::NewGuid().ToString('N')).log"
    try {
      & supabase @Arguments --workdir $SupabaseWorkDir --yes *> $commandLog
      if ($LASTEXITCODE -ne 0) {
        throw "Supabase logical dump failed"
      }
    } finally {
      Remove-Item -LiteralPath $commandLog -Force -ErrorAction SilentlyContinue
    }
  }

  Invoke-SupabaseDump @(
    "db", "dump", "--linked", "--role-only",
    "--file", (Join-Path $runDirectory "roles.sql")
  )
  Invoke-SupabaseDump @(
    "db", "dump", "--linked",
    "--file", (Join-Path $runDirectory "schema.sql")
  )
  Invoke-SupabaseDump @(
    "db", "dump", "--linked", "--data-only", "--use-copy",
    "--exclude", "storage.buckets_vectors",
    "--exclude", "storage.vector_indexes",
    "--file", (Join-Path $runDirectory "data.sql")
  )
  Invoke-SupabaseDump @(
    "db", "dump", "--linked", "--schema", "supabase_migrations",
    "--file", (Join-Path $runDirectory "migration-history-schema.sql")
  )
  Invoke-SupabaseDump @(
    "db", "dump", "--linked", "--schema", "supabase_migrations",
    "--data-only", "--use-copy",
    "--file", (Join-Path $runDirectory "migration-history-data.sql")
  )

  $cliVersion = (& supabase --version | Select-Object -First 1).Trim()
  $postgresVersionPath = Join-Path $SupabaseWorkDir "supabase\.temp\postgres-version"
  $postgresVersion = if (Test-Path -LiteralPath $postgresVersionPath) {
    (Get-Content -LiteralPath $postgresVersionPath -Raw).Trim()
  } else {
    "unknown"
  }
  New-VantareBackupManifest `
    -Directory $runDirectory `
    -ProjectRef $ProjectRef `
    -CreatedAtUtc ([DateTimeOffset]::UtcNow.ToString("O")) `
    -SupabaseCliVersion $cliVersion `
    -PostgresVersion $postgresVersion | Out-Null
  Test-VantareBackupManifest -Directory $runDirectory | Out-Null

  $archiveName = "supabase-$ProjectRef-$timestamp.zip"
  $archivePath = Join-Path $BackupRoot $archiveName
  Compress-Archive -Path (Join-Path $runDirectory "*") `
    -DestinationPath $archivePath -CompressionLevel Optimal
  if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    throw "Backup archive was not created"
  }
  if (
    ((Get-Item -LiteralPath $archivePath).Attributes -band
      [IO.FileAttributes]::Encrypted) -eq 0
  ) {
    throw "Backup archive did not inherit EFS encryption"
  }

  & $VerifyScriptPath `
    -ArchivePath $archivePath `
    -BackupRoot $BackupRoot `
    -ExpectedProjectRef $ProjectRef

  $cutoff = [DateTime]::UtcNow.AddDays(-$RetentionDays)
  Get-ChildItem -LiteralPath $BackupRoot -File `
    -Filter "supabase-$ProjectRef-*.zip" |
    Where-Object { $_.LastWriteTimeUtc -lt $cutoff -and $_.FullName -ne $archivePath } |
    ForEach-Object {
      Assert-VantarePathInsideRoot -Path $_.FullName -Root $BackupRoot
      Remove-Item -LiteralPath $_.FullName -Force
    }

  Assert-VantarePathInsideRoot -Path $runDirectory -Root $BackupRoot
  [IO.Directory]::Delete($runDirectory, $true)
  $runDirectory = $null
  Write-BackupEvent -Status "PASS" -Archive $archiveName
  Write-Output "backup=PASS archive=$archiveName"
} catch {
  Write-BackupEvent -Status "FAIL" -Message $_.Exception.Message
  throw
} finally {
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
  $accessToken = $null
  $databasePassword = $null
  if ($hasMutex) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
