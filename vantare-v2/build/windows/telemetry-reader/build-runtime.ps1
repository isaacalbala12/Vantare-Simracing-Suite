param(
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [string]$DuckDBArchivePath = "",
    [string]$GccBin = "C:\msys64\ucrt64\bin",
    [switch]$UpdateTrustSource
)

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw "PowerShell 7 (pwsh) is required so generated JSON reproduces the trusted TA-03C runtime."
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$helperModule = Join-Path $repoRoot "tools\vantare-telemetry-reader"
$componentsPath = Join-Path $repoRoot "docs\vantare-program\research\telemetry-analysis\spikes\ta03b\sbom-components.json"
$approvedSBOM = Join-Path $repoRoot "docs\vantare-program\research\telemetry-analysis\evidence\duckdb-1.5.5-windows-amd64.spdx.json"
$sbomTools = Join-Path $repoRoot "docs\vantare-program\research\telemetry-analysis\spikes\ta03b\sbom-tools.ps1"
$trustSource = Join-Path $repoRoot "internal\telemetryanalysis\duckdbadapter\runtime_trust_generated.go"
$components = Get-Content -Raw -LiteralPath $componentsPath | ConvertFrom-Json
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
if ((Test-Path -LiteralPath $output) -and @(Get-ChildItem -Force -LiteralPath $output).Count -ne 0) {
    throw "OutputDirectory must be absent or empty so the runtime cannot retain unmanifested files: $output"
}
. $sbomTools
$work = Join-Path $env:TEMP ("vantare-telemetry-reader-build-" + [guid]::NewGuid().ToString("N"))
$extract = Join-Path $work "duckdb"
$buildA = Join-Path $work "build-a\vantare-telemetry-reader.exe"
$buildB = Join-Path $work "build-b\vantare-telemetry-reader.exe"

function Get-Sha256([string]$Path) {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Assert-Sha256([string]$Path, [string]$Expected) {
    $actual = Get-Sha256 $Path
    if ($actual -ne $Expected) {
        throw "Checksum mismatch for $Path. Expected $Expected, got $actual."
    }
}

function Write-Utf8([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Add-License([System.Text.StringBuilder]$Builder, [string]$Name, [string]$License, [string]$Path, [string]$ExpectedHash) {
    Assert-Sha256 $Path $ExpectedHash
    [void]$Builder.AppendLine("## $Name $([char]0x2014) $License")
    [void]$Builder.AppendLine()
    [void]$Builder.AppendLine(([System.IO.File]::ReadAllText($Path)).TrimEnd())
    [void]$Builder.AppendLine()
}

New-Item -ItemType Directory -Force -Path $work, $extract, (Split-Path $buildA), (Split-Path $buildB) | Out-Null
if (-not $DuckDBArchivePath) {
    $DuckDBArchivePath = Join-Path $work "libduckdb-windows-amd64.zip"
    Invoke-WebRequest -Uri "https://github.com/duckdb/duckdb/releases/download/v1.5.5/libduckdb-windows-amd64.zip" -OutFile $DuckDBArchivePath
}
$DuckDBArchivePath = [System.IO.Path]::GetFullPath($DuckDBArchivePath)
Assert-Sha256 $DuckDBArchivePath $components.duckdb.binaryArchiveSha256
Expand-Archive -LiteralPath $DuckDBArchivePath -DestinationPath $extract
$dll = Join-Path $extract "duckdb.dll"
$header = Join-Path $extract "duckdb.h"
Assert-Sha256 $dll $components.duckdb.dllSha256
Assert-Sha256 $header "1909449a72c907d11460c94da9afb3c22f80e70ec7fe196ca08948661fa8cf58"

if (-not (Test-Path (Join-Path $GccBin "gcc.exe"))) {
    throw "GCC UCRT64 not found at $GccBin. Install MSYS2 UCRT64 before building the telemetry reader."
}
$oldPath = $env:PATH
$oldCGO = $env:CGO_ENABLED
$oldFlags = $env:CGO_CFLAGS
$oldLinkerFlags = $env:CGO_LDFLAGS
try {
    $env:PATH = "$GccBin;$extract;$oldPath"
    $env:CGO_ENABLED = "1"
    $env:CGO_CFLAGS = "-I$extract"
    $env:CGO_LDFLAGS = "-L$extract -lduckdb"
    Push-Location $helperModule
    try {
        go build -trimpath -buildvcs=false -tags duckdb_use_lib -ldflags "-s -w -buildid=" -o $buildA .
        if ($LASTEXITCODE -ne 0) { throw "First telemetry reader build failed." }
        go build -trimpath -buildvcs=false -tags duckdb_use_lib -ldflags "-s -w -buildid=" -o $buildB .
        if ($LASTEXITCODE -ne 0) { throw "Second telemetry reader build failed." }
    } finally {
        Pop-Location
    }
} finally {
    $env:PATH = $oldPath
    $env:CGO_ENABLED = $oldCGO
    $env:CGO_CFLAGS = $oldFlags
    $env:CGO_LDFLAGS = $oldLinkerFlags
}
if ((Get-Sha256 $buildA) -ne (Get-Sha256 $buildB)) {
    throw "Telemetry reader builds are not reproducible."
}

$buildInfo = @(& go version -m $buildA)
Assert-ExactGoModuleInventory -BuildInfoLines $buildInfo -ExpectedModules $components.goModules

$approvedHash = Get-Sha256 $approvedSBOM
if ($approvedHash -ne "0eb21309fc8ea57e33ea2bce7a437ddcd5ee16185f419f4cfb4d9ff8a35d1427") {
    throw "Approved DuckDB SBOM changed; re-audit licenses before building."
}
$sbom = Get-Content -Raw -LiteralPath $approvedSBOM | ConvertFrom-Json
if ($sbom.packages.Count -ne 37) { throw "Approved package inventory is no longer exactly 37 components." }
$allowedLicenses = @("NOASSERTION", "MIT", "BSD-3-Clause", "MIT AND Unicode-3.0", "Apache-2.0", "BSL-1.0", "Zlib", "BSD-2-Clause AND Zlib", "BSD-2-Clause", "ICU")
foreach ($package in $sbom.packages) {
    if ($allowedLicenses -notcontains $package.licenseConcluded) {
        throw "Unreviewed license in SBOM: $($package.name) $($package.licenseConcluded)."
    }
}
$helperHash = Get-Sha256 $buildA
$sbom.packages[0].name = "vantare-telemetry-reader"
$sbom.packages[0].versionInfo = "1"
$sbom.packages[0].checksums[0].checksumValue = $helperHash
$sbom.name = "vantare-telemetry-reader-duckdb-1.5.5-windows-amd64"
$sbom.documentNamespace = "https://vantare.app/sbom/telemetry-reader/duckdb-1.5.5-windows-amd64/$helperHash"
$sbom.creationInfo.created = "2026-08-02T00:00:00Z"
$sbom.creationInfo.creators = @("Tool: Vantare build/windows/telemetry-reader/build-runtime.ps1")

$licenseDir = Join-Path $work "licenses"
New-Item -ItemType Directory -Force -Path $licenseDir | Out-Null
$notices = [System.Text.StringBuilder]::new()
[void]$notices.AppendLine("# Vantare Telemetry Reader $([char]0x2014) third-party notices")
[void]$notices.AppendLine()
[void]$notices.AppendLine("Runtime: DuckDB 1.5.5 Windows amd64; helper protocol 1.")
[void]$notices.AppendLine("Mbed TLS is redistributed under Apache-2.0. Zstandard is redistributed under BSD-3-Clause.")
[void]$notices.AppendLine("The exact component inventory and source URLs are in sbom.spdx.json.")
[void]$notices.AppendLine()

$duckLicense = Join-Path $licenseDir "duckdb.LICENSE"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/duckdb/duckdb/$($components.duckdb.commit)/LICENSE" -OutFile $duckLicense
Add-License $notices "DuckDB and statically linked DuckDB extensions" "MIT" $duckLicense $components.duckdb.licenseSha256
foreach ($module in $components.goModules) {
    $moduleInfo = & go mod download -json "$($module.module)@$($module.version)" | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $moduleInfo.Dir) { throw "Cannot resolve $($module.module)." }
    Add-License $notices $module.module $module.license (Join-Path $moduleInfo.Dir "LICENSE") $module.licenseSha256
}
$rawRoot = "https://raw.githubusercontent.com/duckdb/duckdb/$($components.duckdb.commit)"
foreach ($component in $components.vendoredComponents) {
    $licenseFile = Join-Path $licenseDir (($component.name -replace '[^A-Za-z0-9.-]', '-') + ".LICENSE")
    Invoke-WebRequest -Uri "$rawRoot/$($component.path)" -OutFile $licenseFile
    Add-License $notices $component.name $component.licenseConcluded $licenseFile $component.licenseSha256
}

New-Item -ItemType Directory -Force -Path $output | Out-Null
Copy-Item -LiteralPath $buildA -Destination (Join-Path $output "vantare-telemetry-reader.exe") -Force
Copy-Item -LiteralPath $dll -Destination (Join-Path $output "duckdb.dll") -Force
Write-Utf8 (Join-Path $output "THIRD_PARTY_NOTICES.md") ($notices.ToString().Replace("`r`n", "`n"))
Write-Utf8 (Join-Path $output "sbom.spdx.json") (($sbom | ConvertTo-Json -Depth 12) + "`n")

$files = @("duckdb.dll", "sbom.spdx.json", "THIRD_PARTY_NOTICES.md", "vantare-telemetry-reader.exe") | Sort-Object
$manifestFiles = foreach ($name in $files) {
    $path = Join-Path $output $name
    [ordered]@{ name = $name; size = (Get-Item -LiteralPath $path).Length; sha256 = Get-Sha256 $path }
}
$manifest = [ordered]@{
    protocol_version = 1
    helper_version = "1"
    duckdb_version = "v1.5.5"
    schema_version = 1
    os = "windows"
    arch = "amd64"
    files = @($manifestFiles)
}
$manifestPath = Join-Path $output "manifest.json"
Write-Utf8 $manifestPath (($manifest | ConvertTo-Json -Depth 6 -Compress) + "`n")
$manifestHash = Get-Sha256 $manifestPath
$generated = "// Code generated by build/windows/telemetry-reader/build-runtime.ps1; DO NOT EDIT.`n`npackage duckdbadapter`n`nconst productionManifestSHA256 = `"$manifestHash`"`n"
if ($UpdateTrustSource) {
    Write-Utf8 $trustSource $generated
} elseif ((Get-Content -Raw -LiteralPath $trustSource) -ne $generated) {
    throw "Runtime manifest is not trusted by the app. Review it, then rerun with -UpdateTrustSource."
}

$result = [ordered]@{
    outputDirectory = $output
    helperSha256 = $helperHash
    dllSha256 = Get-Sha256 (Join-Path $output "duckdb.dll")
    manifestSha256 = $manifestHash
    sbomPackages = $sbom.packages.Count
    reproducible = $true
}
Remove-Item -LiteralPath $work -Recurse -Force
$result | ConvertTo-Json -Compress
