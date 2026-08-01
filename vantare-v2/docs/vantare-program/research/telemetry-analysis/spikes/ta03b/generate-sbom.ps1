param(
    [string]$OutputFile = (Join-Path $PSScriptRoot "..\..\evidence\duckdb-1.5.5-windows-amd64.spdx.json"),
    [string]$WorkDirectory = (Join-Path $env:TEMP ("vantare-ta03b-sbom-" + [guid]::NewGuid().ToString("N")))
)

$ErrorActionPreference = "Stop"

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Assert-Sha256 {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Expected
    )
    $actual = Get-Sha256 -Path $Path
    if ($actual -ne $Expected) {
        throw "Checksum mismatch for $Path. Expected $Expected, got $actual."
    }
}

function New-SpdxId {
    param([Parameter(Mandatory = $true)][string]$Name)
    return "SPDXRef-Package-" + ($Name -replace '[^A-Za-z0-9.-]', '-')
}

$componentsPath = Join-Path $PSScriptRoot "sbom-components.json"
$components = Get-Content -Raw -LiteralPath $componentsPath | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $WorkDirectory | Out-Null

$runtimeOutput = & (Join-Path $PSScriptRoot "run.ps1") -OutputDirectory (Join-Path $WorkDirectory "runtime") -Pages 5 | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
    throw "TA-03B runtime verification failed while generating the SBOM."
}

if ($runtimeOutput.archiveSha256 -ne $components.duckdb.binaryArchiveSha256) {
    throw "The verified binary archive does not match the SBOM input."
}
if ($runtimeOutput.librarySha256 -ne $components.duckdb.dllSha256) {
    throw "The verified DuckDB DLL does not match the SBOM input."
}
$expectedExtensions = @($components.duckdb.staticExtensions | Sort-Object)
$actualExtensions = @($runtimeOutput.runtime.staticExtensions | Sort-Object)
$extensionDelta = Compare-Object -ReferenceObject $expectedExtensions -DifferenceObject $actualExtensions
if ($extensionDelta) {
    throw "Static DuckDB extension inventory changed: $($extensionDelta | Out-String)"
}

$sourceArchive = Join-Path $WorkDirectory "libduckdb-src.zip"
Invoke-WebRequest -Uri "https://github.com/duckdb/duckdb/releases/download/v$($components.duckdb.version)/libduckdb-src.zip" -OutFile $sourceArchive
Assert-Sha256 -Path $sourceArchive -Expected $components.duckdb.sourceArchiveSha256

$rawRoot = "https://raw.githubusercontent.com/duckdb/duckdb/$($components.duckdb.commit)"
$duckDbLicense = Join-Path $WorkDirectory "duckdb-LICENSE"
Invoke-WebRequest -Uri "$rawRoot/LICENSE" -OutFile $duckDbLicense
Assert-Sha256 -Path $duckDbLicense -Expected $components.duckdb.licenseSha256

$vendoredLicenseDirectory = Join-Path $WorkDirectory "vendored-licenses"
New-Item -ItemType Directory -Force -Path $vendoredLicenseDirectory | Out-Null
foreach ($component in $components.vendoredComponents) {
    $licenseFile = Join-Path $vendoredLicenseDirectory (($component.name -replace '[^A-Za-z0-9.-]', '-') + ".LICENSE")
    Invoke-WebRequest -Uri "$rawRoot/$($component.path)" -OutFile $licenseFile
    Assert-Sha256 -Path $licenseFile -Expected $component.licenseSha256
}

$helperBinary = Join-Path $WorkDirectory "runtime\ta03b-duckdb-spike.exe"
$buildInfo = (& go version -m $helperBinary) -join "`n"
foreach ($module in $components.goModules) {
    if ($buildInfo -notmatch [regex]::Escape("$($module.module)`t$($module.version)")) {
        throw "Go build information does not contain $($module.module) $($module.version)."
    }
    $moduleInfo = & go mod download -json "$($module.module)@$($module.version)" | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $moduleInfo.Dir) {
        throw "Unable to resolve Go module $($module.module) $($module.version)."
    }
    Assert-Sha256 -Path (Join-Path $moduleInfo.Dir "LICENSE") -Expected $module.licenseSha256
}

$packages = [System.Collections.Generic.List[object]]::new()
$relationships = [System.Collections.Generic.List[object]]::new()
$helperId = New-SpdxId -Name "vantare-ta03b-duckdb-helper"
$duckDbId = New-SpdxId -Name "duckdb-runtime"

$packages.Add([ordered]@{
    name = "vantare-ta03b-duckdb-helper"
    SPDXID = $helperId
    versionInfo = "research-spike"
    downloadLocation = "NOASSERTION"
    filesAnalyzed = $false
    checksums = @([ordered]@{ algorithm = "SHA256"; checksumValue = $runtimeOutput.binarySha256 })
    licenseConcluded = "NOASSERTION"
    licenseDeclared = "NOASSERTION"
    copyrightText = "NOASSERTION"
})
$packages.Add([ordered]@{
    name = "duckdb.dll"
    SPDXID = $duckDbId
    versionInfo = $components.duckdb.version
    supplier = "Organization: DuckDB Foundation"
    downloadLocation = "https://github.com/duckdb/duckdb/releases/download/v$($components.duckdb.version)/libduckdb-windows-amd64.zip"
    filesAnalyzed = $false
    checksums = @([ordered]@{ algorithm = "SHA256"; checksumValue = $runtimeOutput.librarySha256 })
    licenseConcluded = "MIT"
    licenseDeclared = "MIT"
    copyrightText = "Copyright 2018-2025 Stichting DuckDB Foundation"
    externalRefs = @([ordered]@{
        referenceCategory = "PACKAGE-MANAGER"
        referenceType = "purl"
        referenceLocator = "pkg:github/duckdb/duckdb@v$($components.duckdb.version)"
    })
    comment = "Official Windows amd64 DLL; Authenticode=$($runtimeOutput.librarySignatureStatus); signer=$($runtimeOutput.librarySigner); source commit=$($components.duckdb.commit); source archive SHA256=$($components.duckdb.sourceArchiveSha256)."
})
$relationships.Add([ordered]@{ spdxElementId = $helperId; relationshipType = "DEPENDS_ON"; relatedSpdxElement = $duckDbId })

foreach ($module in $components.goModules) {
    $id = New-SpdxId -Name ("go-" + $module.name)
    $packages.Add([ordered]@{
        name = $module.module
        SPDXID = $id
        versionInfo = $module.version
        downloadLocation = "https://github.com/$($module.module -replace '^github.com/', '')"
        filesAnalyzed = $false
        licenseConcluded = $module.license
        licenseDeclared = $module.license
        copyrightText = "NOASSERTION"
        externalRefs = @([ordered]@{
            referenceCategory = "PACKAGE-MANAGER"
            referenceType = "purl"
            referenceLocator = "pkg:golang/$($module.module)@$($module.version)"
        })
        comment = "License file SHA256=$($module.licenseSha256); present in go version -m output of helper SHA256 $($runtimeOutput.binarySha256)."
    })
    $relationships.Add([ordered]@{ spdxElementId = $helperId; relationshipType = "DEPENDS_ON"; relatedSpdxElement = $id })
}

foreach ($extension in $components.duckdb.staticExtensions) {
    $id = New-SpdxId -Name ("duckdb-extension-" + $extension)
    $packages.Add([ordered]@{
        name = "duckdb-extension-$extension"
        SPDXID = $id
        versionInfo = $components.duckdb.version
        downloadLocation = "https://github.com/duckdb/duckdb/tree/$($components.duckdb.commit)/extension/$extension"
        filesAnalyzed = $false
        licenseConcluded = "MIT"
        licenseDeclared = "MIT"
        copyrightText = "Copyright 2018-2025 Stichting DuckDB Foundation"
        comment = "Reported as STATICALLY_LINKED by duckdb_extensions() in the exact DLL."
    })
    $relationships.Add([ordered]@{ spdxElementId = $duckDbId; relationshipType = "CONTAINS"; relatedSpdxElement = $id })
}

foreach ($component in $components.vendoredComponents) {
    $id = New-SpdxId -Name ("duckdb-vendored-" + $component.name)
    $packages.Add([ordered]@{
        name = $component.name
        SPDXID = $id
        versionInfo = "vendored-in-duckdb-$($components.duckdb.version)@$($components.duckdb.commit.Substring(0, 12))"
        downloadLocation = "$rawRoot/$($component.path)"
        filesAnalyzed = $false
        licenseConcluded = $component.licenseConcluded
        licenseDeclared = $component.licenseDeclared
        copyrightText = "NOASSERTION"
        comment = "Exact vendored source is identified by DuckDB tag commit and path; license file SHA256=$($component.licenseSha256)."
    })
    $relationships.Add([ordered]@{ spdxElementId = $duckDbId; relationshipType = "CONTAINS"; relatedSpdxElement = $id })
}

$document = [ordered]@{
    spdxVersion = "SPDX-2.3"
    dataLicense = "CC0-1.0"
    SPDXID = "SPDXRef-DOCUMENT"
    name = "vantare-ta03b-duckdb-1.5.5-windows-amd64"
    documentNamespace = "https://vantare.app/sbom/ta03b/duckdb-1.5.5-windows-amd64/$($runtimeOutput.binarySha256)"
    creationInfo = [ordered]@{
        created = "2026-08-01T00:00:00Z"
        creators = @("Tool: Vantare TA-03B generate-sbom.ps1")
        comment = "Generated from pinned official release assets, DuckDB commit, runtime static-extension inventory and the helper's Go build information."
    }
    documentDescribes = @($helperId, $duckDbId)
    packages = @($packages)
    relationships = @($relationships)
    comment = "Windows system dependencies observed with objdump: KERNEL32.dll, WS2_32.dll and RstrtMgr.DLL; they are operating-system components and are not redistributed by this runtime."
}

$outputDirectory = Split-Path -Parent $OutputFile
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$json = $document | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($OutputFile, $json + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output $OutputFile
