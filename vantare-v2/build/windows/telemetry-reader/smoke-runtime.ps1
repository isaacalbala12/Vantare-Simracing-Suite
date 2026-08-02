param(
    [Parameter(Mandatory = $true)][string]$RuntimeDirectory
)

$ErrorActionPreference = "Stop"
$RuntimeDirectory = [System.IO.Path]::GetFullPath($RuntimeDirectory)
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
if (-not [System.OperatingSystem]::IsWindows() -or -not [Environment]::Is64BitOperatingSystem) {
    throw "Telemetry Analysis requires Windows 10/11 x64."
}
$version = [Environment]::OSVersion.Version
if ($version.Major -lt 10) {
    throw "Telemetry Analysis requires Windows 10 or newer. Detected $version."
}
$vcRuntime = Join-Path ([Environment]::GetFolderPath("System")) "vcruntime140.dll"
if (-not (Test-Path -LiteralPath $vcRuntime -PathType Leaf)) {
    throw "Microsoft Visual C++ Redistributable is required. Install the current x64 runtime and retry."
}
$manifestPath = Join-Path $RuntimeDirectory "manifest.json"
$trustSource = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "internal\telemetryanalysis\duckdbadapter\runtime_trust_generated.go")
if ($trustSource -notmatch 'productionManifestSHA256 = "([0-9a-f]{64})"') {
    throw "Compiled telemetry runtime trust digest is missing or malformed."
}
$manifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant()
if ($manifestHash -cne $Matches[1]) {
    throw "Telemetry runtime manifest is not trusted by this Vantare build."
}
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.protocol_version -ne 1 -or $manifest.helper_version -cne "1" -or
    $manifest.duckdb_version -cne "v1.5.5" -or $manifest.schema_version -ne 1 -or
    $manifest.os -cne "windows" -or $manifest.arch -cne "amd64") {
    throw "Telemetry runtime manifest is incompatible."
}
$expectedFiles = @("duckdb.dll", "sbom.spdx.json", "THIRD_PARTY_NOTICES.md", "vantare-telemetry-reader.exe")
$manifestFiles = @($manifest.files)
if ($manifestFiles.Count -ne $expectedFiles.Count) {
    throw "Telemetry runtime manifest has an unexpected file inventory."
}
foreach ($name in $expectedFiles) {
    $entry = @($manifestFiles | Where-Object { $_.name -ceq $name })
    if ($entry.Count -ne 1) {
        throw "Telemetry runtime manifest is missing or duplicates $name."
    }
    $path = Join-Path $RuntimeDirectory $name
    $item = Get-Item -LiteralPath $path
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
    if (-not $item.PSIsContainer -and $item.Length -eq [int64]$entry[0].size -and $hash -ceq [string]$entry[0].sha256) {
        continue
    }
    throw "Telemetry runtime member failed verification: $name."
}
$directoryFiles = @(Get-ChildItem -Force -LiteralPath $RuntimeDirectory | ForEach-Object { $_.Name } | Sort-Object)
$expectedDirectoryFiles = @($expectedFiles + "manifest.json" | Sort-Object)
if ([string]::Join("`n", $directoryFiles) -cne [string]::Join("`n", $expectedDirectoryFiles)) {
    throw "Telemetry runtime directory contains unmanifested members."
}
$helper = Join-Path $RuntimeDirectory "vantare-telemetry-reader.exe"
if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) {
    throw "Telemetry reader helper is missing from $RuntimeDirectory."
}
$request = '{"protocol_version":1,"request_id":"smoke-1","operation":"handshake","handshake":{"helper_version":"1","duckdb_version":"v1.5.5","schema_version":1,"os":"windows","arch":"amd64"}}'
$response = $request | & $helper
if ($LASTEXITCODE -ne 0) {
    throw "Telemetry reader helper failed its handshake smoke test (exit $LASTEXITCODE)."
}
$frame = $response | ConvertFrom-Json
if (-not $frame.ok -or $frame.request_id -ne "smoke-1" -or
    $frame.handshake.duckdb_version -ne "v1.5.5" -or $frame.handshake.arch -ne "amd64") {
    throw "Telemetry reader helper returned an incompatible handshake."
}
[pscustomobject]@{
    osVersion = $version.ToString()
    architecture = "amd64"
    vcRuntime = $vcRuntime
    helperVersion = $frame.handshake.helper_version
    duckdbVersion = $frame.handshake.duckdb_version
    status = "pass"
} | ConvertTo-Json -Compress
