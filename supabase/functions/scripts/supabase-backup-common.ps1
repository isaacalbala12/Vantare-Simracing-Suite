Set-StrictMode -Version Latest

function Assert-VantareWindowsHost {
  if ($env:OS -ne "Windows_NT") {
    throw "Vantare Supabase backup automation currently requires Windows"
  }
}

function Assert-VantarePathInsideRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Root
  )

  $fullRoot = [IO.Path]::GetFullPath($Root).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  )
  $fullPath = [IO.Path]::GetFullPath($Path)
  $prefix = $fullRoot + [IO.Path]::DirectorySeparatorChar
  if (-not $fullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path is outside the expected root"
  }
}

function Set-VantarePrivateDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)

  Assert-VantareWindowsHost
  New-Item -ItemType Directory -Path $Path -Force | Out-Null

  & cipher.exe /E /B $Path | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not enable EFS encryption for the private directory"
  }

  $attributes = (Get-Item -LiteralPath $Path).Attributes
  if (($attributes -band [IO.FileAttributes]::Encrypted) -eq 0) {
    throw "The private directory is not encrypted with EFS"
  }

  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $Path /inheritance:r `
    /grant:r "*$($sid):(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not restrict the private directory ACL"
  }
}

function Protect-VantareSecretToFile {
  param(
    [Parameter(Mandatory = $true)][string]$Secret,
    [Parameter(Mandatory = $true)][string]$Path
  )

  if ([string]::IsNullOrWhiteSpace($Secret)) {
    throw "Cannot protect an empty secret"
  }
  $secure = ConvertTo-SecureString $Secret -AsPlainText -Force
  $protected = ConvertFrom-SecureString $secure
  Set-Content -LiteralPath $Path -Value $protected -Encoding ASCII -NoNewline
}

function Unprotect-VantareSecretFromFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Protected secret file is missing"
  }
  $secure = Get-Content -LiteralPath $Path -Raw | ConvertTo-SecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function New-VantareBackupManifest {
  param(
    [Parameter(Mandatory = $true)][string]$Directory,
    [Parameter(Mandatory = $true)][string]$ProjectRef,
    [Parameter(Mandatory = $true)][string]$CreatedAtUtc,
    [Parameter(Mandatory = $true)][string]$SupabaseCliVersion,
    [Parameter(Mandatory = $true)][string]$PostgresVersion
  )

  $fileNames = @(
    "roles.sql",
    "schema.sql",
    "data.sql",
    "public-data.sql",
    "migration-history-schema.sql",
    "migration-history-data.sql"
  )
  $files = foreach ($name in $fileNames) {
    $path = Join-Path $Directory $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Required dump file is missing: $name"
    }
    $item = Get-Item -LiteralPath $path
    [ordered]@{
      name = $name
      bytes = [long]$item.Length
      sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }

  $manifest = [ordered]@{
    schemaVersion = 2
    kind = "vantare-supabase-logical-backup"
    projectRef = $ProjectRef
    createdAtUtc = $CreatedAtUtc
    supabaseCliVersion = $SupabaseCliVersion
    postgresVersion = $PostgresVersion
    contents = [ordered]@{
      roles = $true
      applicationSchema = $true
      databaseData = $true
      automatedRestoreScope = "public"
      migrationHistory = $true
      storageObjects = $false
      edgeFunctionSource = $false
      providerSecrets = $false
    }
    files = @($files)
  }
  $manifestPath = Join-Path $Directory "manifest.json"
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  return $manifestPath
}

function Test-VantareBackupManifest {
  param([Parameter(Mandatory = $true)][string]$Directory)

  $manifestPath = Join-Path $Directory "manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Backup manifest is missing"
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if (
    $manifest.schemaVersion -ne 2 -or
    $manifest.kind -ne "vantare-supabase-logical-backup"
  ) {
    throw "Backup manifest contract is invalid"
  }
  if (@($manifest.files).Count -ne 6) {
    throw "Backup manifest file inventory is incomplete"
  }
  foreach ($entry in @($manifest.files)) {
    if ([IO.Path]::GetFileName([string]$entry.name) -ne [string]$entry.name) {
      throw "Backup manifest contains an unsafe file name"
    }
    $path = Join-Path $Directory ([string]$entry.name)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Backup file is missing"
    }
    $item = Get-Item -LiteralPath $path
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ([long]$entry.bytes -ne [long]$item.Length -or $entry.sha256 -ne $hash) {
      throw "Backup file integrity check failed"
    }
  }
  return $manifest
}
