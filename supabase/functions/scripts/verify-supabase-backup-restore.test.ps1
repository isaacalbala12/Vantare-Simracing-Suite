$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "supabase-backup-common.ps1")

$testParent = Join-Path $env:LOCALAPPDATA "Vantare\test"
$testRoot = Join-Path $testParent "supabase-restore-$([guid]::NewGuid().ToString('N'))"
$payload = Join-Path $testRoot "payload"
$projectRef = "abcdefghijklmnopqrst"

try {
  Set-VantarePrivateDirectory -Path $testRoot
  New-Item -ItemType Directory -Path $payload | Out-Null

  Set-Content -LiteralPath (Join-Path $payload "roles.sql") `
    -Value "-- roles are inventoried separately" -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $payload "schema.sql") `
    -Value "create table public.vantare_backup_probe (id integer primary key);" `
    -Encoding ASCII
  $copyFixture = "COPY public.vantare_backup_probe (id) FROM stdin;`n1`n\.`n"
  [IO.File]::WriteAllText(
    (Join-Path $payload "data.sql"),
    $copyFixture,
    (New-Object Text.UTF8Encoding($false))
  )
  Set-Content -LiteralPath (Join-Path $payload "migration-history-schema.sql") `
    -Value "-- migration history schema" -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $payload "migration-history-data.sql") `
    -Value "-- migration history data" -Encoding ASCII

  New-VantareBackupManifest `
    -Directory $payload `
    -ProjectRef $projectRef `
    -CreatedAtUtc ([DateTimeOffset]::UtcNow.ToString("O")) `
    -SupabaseCliVersion "integration-test" `
    -PostgresVersion "17.6.1.132" | Out-Null

  $archive = Join-Path $testRoot "supabase-$projectRef-test.zip"
  Compress-Archive -Path (Join-Path $payload "*") -DestinationPath $archive
  $output = & (Join-Path $PSScriptRoot "verify-supabase-backup-restore.ps1") `
    -ArchivePath $archive `
    -BackupRoot $testRoot `
    -ExpectedProjectRef $projectRef
  if (-not ($output -match "restore_verification=PASS")) {
    throw "Disposable restore integration test did not report PASS"
  }

  Write-Output "supabase_backup_restore_integration=PASS"
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    Assert-VantarePathInsideRoot -Path $testRoot -Root $testParent
    [IO.Directory]::Delete($testRoot, $true)
  }
}
