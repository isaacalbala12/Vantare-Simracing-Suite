param(
    [string]$OutputDirectory = (Join-Path $env:TEMP "vantare-ta03b-duckdb"),
    [int]$Pages = 50
)

$ErrorActionPreference = "Stop"

$duckDbVersion = "1.5.5"
$duckDbArchiveSha256 = "8375eb1fcf2212e8a0817950354815d4dde9dd383c2d9fa7b8975b71e278c1bd"
$duckDbArchiveUrl = "https://install.duckdb.org/v$duckDbVersion/libduckdb-windows-amd64.zip"
$duckDbFiles = [ordered]@{
    "duckdb.dll" = "2b7468a4ad844429e6af2fde0b5f91893e8130a5686a88f11442ab547c7ede46"
    "duckdb.lib" = "4c15219822ccb18714666f4550a3c766d5d02da1269be2d57c166c56347615d9"
    "duckdb.h" = "1909449a72c907d11460c94da9afb3c22f80e70ec7fe196ca08948661fa8cf58"
    "duckdb.hpp" = "14082d69de79260f16e915b594e3f8a3369590688f883f67e428ee7a42d96be9"
    "duckdb_extension.h" = "a5286decfe3098daf43744448ad718e0a252a1facb6d7329a649023e5aadad37"
}

function Assert-FileHash {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ExpectedSha256
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required file is missing: $Path"
    }
    $actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $ExpectedSha256) {
        throw "Checksum mismatch for $Path. Expected $ExpectedSha256, got $actualSha256."
    }
}

$gccDirectory = "C:\msys64\ucrt64\bin"
if (-not (Test-Path (Join-Path $gccDirectory "gcc.exe"))) {
    throw "MSYS2 UCRT64 GCC was not found at $gccDirectory. Install the documented Windows toolchain before running the spike."
}

$env:CGO_ENABLED = "1"

$binary = Join-Path $OutputDirectory "ta03b-duckdb-spike.exe"
$libraryDirectory = Join-Path $OutputDirectory "duckdb-$duckDbVersion"
$archive = Join-Path $OutputDirectory "libduckdb-windows-amd64-$duckDbVersion.zip"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

if (-not (Test-Path $archive)) {
    Invoke-WebRequest -Uri $duckDbArchiveUrl -OutFile $archive
}
$archiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
if ($archiveHash -ne $duckDbArchiveSha256) {
    throw "DuckDB archive checksum mismatch. Expected $duckDbArchiveSha256, got $archiveHash."
}
if (-not (Test-Path -LiteralPath $libraryDirectory)) {
    Expand-Archive -LiteralPath $archive -DestinationPath $libraryDirectory
}
foreach ($entry in $duckDbFiles.GetEnumerator()) {
    Assert-FileHash -Path (Join-Path $libraryDirectory $entry.Key) -ExpectedSha256 $entry.Value
}

$env:Path = "$gccDirectory;$libraryDirectory;$env:Path"
$env:CGO_CFLAGS = "-I$libraryDirectory"
$env:CGO_LDFLAGS = "-L$libraryDirectory -lduckdb"

$buildStarted = Get-Date
Push-Location $PSScriptRoot
try {
    go build -trimpath -ldflags="-buildid=" -tags=duckdb_use_lib -o $binary .
    if ($LASTEXITCODE -ne 0) {
        throw "The DuckDB spike failed to build."
    }
}
finally {
    Pop-Location
}
$buildMilliseconds = [int64]((Get-Date) - $buildStarted).TotalMilliseconds

Copy-Item -Force -LiteralPath (Join-Path $libraryDirectory "duckdb.dll") -Destination $OutputDirectory
Assert-FileHash -Path (Join-Path $OutputDirectory "duckdb.dll") -ExpectedSha256 $duckDbFiles["duckdb.dll"]
$runOutput = & $binary -work-dir $OutputDirectory -pages $Pages | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
    throw "The DuckDB spike failed its runtime checks."
}
$binaryInfo = Get-Item -LiteralPath $binary
$libraryInfo = Get-Item -LiteralPath (Join-Path $OutputDirectory "duckdb.dll")
$binaryHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $binary).Hash.ToLowerInvariant()
$libraryHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $libraryInfo.FullName).Hash.ToLowerInvariant()
$signature = Get-AuthenticodeSignature -LiteralPath $libraryInfo.FullName

[ordered]@{
    duckDbVersion = $duckDbVersion
    archiveSha256 = $archiveHash
    buildMilliseconds = $buildMilliseconds
    binaryBytes = $binaryInfo.Length
    binarySha256 = $binaryHash
    libraryBytes = $libraryInfo.Length
    librarySha256 = $libraryHash
    librarySignatureStatus = [string]$signature.Status
    librarySigner = [string]$signature.SignerCertificate.Subject
    packagedBytes = $binaryInfo.Length + $libraryInfo.Length
    runtime = $runOutput
} | ConvertTo-Json -Depth 5
