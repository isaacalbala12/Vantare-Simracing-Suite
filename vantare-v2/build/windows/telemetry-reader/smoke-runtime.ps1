param(
    [Parameter(Mandatory = $true)][string]$RuntimeDirectory
)

$ErrorActionPreference = "Stop"
$RuntimeDirectory = [System.IO.Path]::GetFullPath($RuntimeDirectory)
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
if ($env:OS -cne "Windows_NT" -or -not [Environment]::Is64BitOperatingSystem) {
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
$verification = & (Join-Path $PSScriptRoot "verify-runtime.ps1") -RuntimeDirectory $RuntimeDirectory -RepoRoot $repoRoot | ConvertFrom-Json
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
    manifestSha256 = $verification.manifestSha256
    status = "pass"
} | ConvertTo-Json -Compress
