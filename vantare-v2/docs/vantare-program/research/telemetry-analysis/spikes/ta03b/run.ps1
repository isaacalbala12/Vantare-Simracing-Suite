param(
    [string]$OutputDirectory = (Join-Path $env:TEMP "vantare-ta03b-duckdb"),
    [int]$Pages = 50
)

$ErrorActionPreference = "Stop"

$duckDbVersion = "1.5.5"
$duckDbArchiveSha256 = "8375eb1fcf2212e8a0817950354815d4dde9dd383c2d9fa7b8975b71e278c1bd"
$duckDbArchiveUrl = "https://install.duckdb.org/v$duckDbVersion/libduckdb-windows-amd64.zip"

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
if (-not (Test-Path (Join-Path $libraryDirectory "duckdb.dll"))) {
    Expand-Archive -LiteralPath $archive -DestinationPath $libraryDirectory
}

$env:Path = "$gccDirectory;$libraryDirectory;$env:Path"
$env:CGO_CFLAGS = "-I$libraryDirectory"
$env:CGO_LDFLAGS = "-L$libraryDirectory -lduckdb"

$buildStarted = Get-Date
go build -trimpath -ldflags="-buildid=" -tags=duckdb_use_lib -o $binary .
if ($LASTEXITCODE -ne 0) {
    throw "The DuckDB spike failed to build."
}
$buildMilliseconds = [int64]((Get-Date) - $buildStarted).TotalMilliseconds

Copy-Item -Force -LiteralPath (Join-Path $libraryDirectory "duckdb.dll") -Destination $OutputDirectory
$runOutput = & $binary -work-dir $OutputDirectory -pages $Pages | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
    throw "The DuckDB spike failed its runtime checks."
}
$binaryInfo = Get-Item -LiteralPath $binary
$libraryInfo = Get-Item -LiteralPath (Join-Path $OutputDirectory "duckdb.dll")
$binaryHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $binary).Hash.ToLowerInvariant()
$libraryHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $libraryInfo.FullName).Hash.ToLowerInvariant()

[ordered]@{
    duckDbVersion = $duckDbVersion
    archiveSha256 = $archiveHash
    buildMilliseconds = $buildMilliseconds
    binaryBytes = $binaryInfo.Length
    binarySha256 = $binaryHash
    libraryBytes = $libraryInfo.Length
    librarySha256 = $libraryHash
    packagedBytes = $binaryInfo.Length + $libraryInfo.Length
    runtime = $runOutput
} | ConvertTo-Json -Depth 5
