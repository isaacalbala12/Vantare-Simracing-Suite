param(
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef = "ombjshwzqgeisazijduq",
  [string]$TaskName = "Vantare Supabase Production Backup",
  [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
  [string]$DailyAt = "03:00",
  [ValidateRange(2, 365)][int]$RetentionDays = 30,
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "Vantare\ops\supabase-backup"),
  [string]$BackupRoot = (Join-Path $env:LOCALAPPDATA "Vantare\backups\supabase\production"),
  [string]$SecretRoot = (Join-Path $env:LOCALAPPDATA "Vantare\secrets\supabase-backup"),
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "supabase-backup-common.ps1")

Assert-VantareWindowsHost
if (-not (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue)) {
  throw "Windows Scheduled Tasks cmdlets are required"
}
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) {
  throw "SUPABASE_ACCESS_TOKEN must be present only for installation"
}
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_PASSWORD)) {
  throw "SUPABASE_DB_PASSWORD must be present only for installation"
}

$sourceSupabaseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$sourceConfig = Join-Path $sourceSupabaseRoot "config.toml"
$sourceTemp = Join-Path $sourceSupabaseRoot ".temp"
if (-not (Test-Path -LiteralPath $sourceConfig -PathType Leaf)) {
  throw "Supabase config.toml is missing"
}
foreach ($name in @("project-ref", "pooler-url", "linked-project.json", "postgres-version")) {
  if (-not (Test-Path -LiteralPath (Join-Path $sourceTemp $name) -PathType Leaf)) {
    throw "Supabase linked metadata is incomplete: $name"
  }
}
$linkedProjectRef = (Get-Content -LiteralPath (Join-Path $sourceTemp "project-ref") -Raw).Trim()
if ($linkedProjectRef -cne $ProjectRef) {
  throw "Supabase linked metadata does not match the requested backup project"
}
$configText = Get-Content -LiteralPath $sourceConfig -Raw
if ($configText -notmatch "(?m)^project_id\s*=\s*`"$([regex]::Escape($ProjectRef))`"\s*$") {
  throw "Supabase config does not match the requested backup project"
}

Set-VantarePrivateDirectory -Path $InstallRoot
Set-VantarePrivateDirectory -Path $BackupRoot
Set-VantarePrivateDirectory -Path $SecretRoot

$installedScriptRoot = Join-Path $InstallRoot "scripts"
$installedSupabaseRoot = Join-Path $InstallRoot "project\supabase"
New-Item -ItemType Directory -Path $installedScriptRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $installedSupabaseRoot ".temp") -Force | Out-Null

foreach ($name in @(
  "supabase-backup-common.ps1",
  "backup-supabase-production.ps1",
  "verify-supabase-backup-restore.ps1"
)) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) `
    -Destination (Join-Path $installedScriptRoot $name) -Force
}
Copy-Item -LiteralPath $sourceConfig -Destination (Join-Path $installedSupabaseRoot "config.toml") -Force
foreach ($name in @("project-ref", "pooler-url", "linked-project.json", "postgres-version")) {
  Copy-Item -LiteralPath (Join-Path $sourceTemp $name) `
    -Destination (Join-Path $installedSupabaseRoot ".temp\$name") -Force
}

Protect-VantareSecretToFile `
  -Secret $env:SUPABASE_ACCESS_TOKEN `
  -Path (Join-Path $SecretRoot "supabase-access-token.dpapi")
Protect-VantareSecretToFile `
  -Secret $env:SUPABASE_DB_PASSWORD `
  -Path (Join-Path $SecretRoot "supabase-db-password.dpapi")

$runnerPath = Join-Path $installedScriptRoot "backup-supabase-production.ps1"
$arguments = @(
  "-NoLogo",
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy", "Bypass",
  "-File", ('"' + $runnerPath + '"'),
  "-ProjectRef", $ProjectRef,
  "-BackupRoot", ('"' + $BackupRoot + '"'),
  "-SecretRoot", ('"' + $SecretRoot + '"'),
  "-SupabaseWorkDir", ('"' + (Join-Path $InstallRoot "project") + '"'),
  "-RetentionDays", [string]$RetentionDays
) -join " "

$powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments
$time = [DateTime]::ParseExact($DailyAt, "HH:mm", [Globalization.CultureInfo]::InvariantCulture)
$trigger = New-ScheduledTaskTrigger -Daily -At $time
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -MultipleInstances IgnoreNew
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal `
  -UserId $currentIdentity `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Daily encrypted and restore-verified logical backup of Vantare production Supabase" `
  -Force | Out-Null

Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue

Write-Output "backup_task_install=PASS task=$TaskName daily_at=$DailyAt retention_days=$RetentionDays"
if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Output "backup_task_started=YES"
}
