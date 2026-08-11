[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$RuntimeDirectory,
    [string]$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
)

$ErrorActionPreference = "Stop"
$runtime = [System.IO.Path]::GetFullPath($RuntimeDirectory)
$repo = [System.IO.Path]::GetFullPath($RepoRoot)
$expectedPayload = @(
    "duckdb.dll",
    "sbom.spdx.json",
    "THIRD_PARTY_NOTICES.md",
    "vantare-telemetry-reader.exe"
)
$expectedUnit = @($expectedPayload + "manifest.json" | Sort-Object)

if (-not (Test-Path -LiteralPath $runtime -PathType Container)) {
    throw "Telemetry runtime directory is missing: $runtime"
}
$actualUnit = @(Get-ChildItem -Force -LiteralPath $runtime | ForEach-Object { $_.Name } | Sort-Object)
if ([string]::Join("`n", $actualUnit) -cne [string]::Join("`n", $expectedUnit)) {
    throw "Telemetry runtime must contain exactly: $($expectedUnit -join ', '). Found: $($actualUnit -join ', ')."
}

$trustSourcePath = Join-Path $repo "internal\telemetryanalysis\duckdbadapter\runtime_trust_generated.go"
if (-not (Test-Path -LiteralPath $trustSourcePath -PathType Leaf)) {
    throw "Compiled telemetry runtime trust source is missing: $trustSourcePath"
}
$trustSource = Get-Content -Raw -LiteralPath $trustSourcePath
if ($trustSource -notmatch 'productionManifestSHA256 = "([0-9a-f]{64})"') {
    throw "Compiled telemetry runtime trust digest is missing or malformed."
}
$trustedManifestHash = $Matches[1]
$manifestPath = Join-Path $runtime "manifest.json"
$manifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant()
if ($manifestHash -cne $trustedManifestHash) {
    throw "Telemetry runtime manifest is not trusted by this Vantare build."
}

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.protocol_version -ne 1 -or $manifest.helper_version -cne "1" -or
    $manifest.duckdb_version -cne "v1.5.5" -or $manifest.schema_version -ne 1 -or
    $manifest.os -cne "windows" -or $manifest.arch -cne "amd64") {
    throw "Telemetry runtime manifest is incompatible."
}
$manifestFiles = @($manifest.files)
if ($manifestFiles.Count -ne $expectedPayload.Count) {
    throw "Telemetry runtime manifest has an unexpected file inventory."
}
foreach ($name in $expectedPayload) {
    $entry = @($manifestFiles | Where-Object { $_.name -ceq $name })
    if ($entry.Count -ne 1) {
        throw "Telemetry runtime manifest is missing or duplicates $name."
    }
    $path = Join-Path $runtime $name
    $item = Get-Item -Force -LiteralPath $path
    if ($item.PSIsContainer -or (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
        throw "Telemetry runtime member must be a regular file: $name."
    }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
    if ($item.Length -ne [int64]$entry[0].size -or $hash -cne [string]$entry[0].sha256) {
        throw "Telemetry runtime member failed verification: $name."
    }
}

[pscustomobject]@{
    runtimeDirectory = $runtime
    manifestSha256 = $manifestHash
    members = $expectedUnit.Count
    status = "pass"
} | ConvertTo-Json -Compress
