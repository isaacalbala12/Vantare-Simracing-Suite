[CmdletBinding()]
param(
    [string]$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\..")),
    [string]$BinDir = "bin",
    [string]$DuckDBArchivePath = "",
    [string]$GccBin = "C:\msys64\ucrt64\bin"
)

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw "PowerShell 7 (pwsh) is required to prepare the trusted TA-03C runtime."
}
$repo = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd("\")
$binInput = if ([System.IO.Path]::IsPathRooted($BinDir)) { $BinDir } else { Join-Path $repo $BinDir }
$bin = [System.IO.Path]::GetFullPath($binInput).TrimEnd("\")
$expectedBin = [System.IO.Path]::GetFullPath((Join-Path $repo "bin")).TrimEnd("\")
if (-not $bin.Equals($expectedBin, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "BinDir must resolve nominally and exactly to RepoRoot\bin. Expected=$expectedBin Actual=$bin"
}
$runtime = Join-Path $bin "runtime\telemetry\duckdb-v1"
$buildScript = Join-Path $repo "build\windows\telemetry-reader\build-runtime.ps1"
$verifyScript = Join-Path $repo "build\windows\telemetry-reader\verify-runtime.ps1"
$smokeScript = Join-Path $repo "build\windows\telemetry-reader\smoke-runtime.ps1"
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("vantare-runtime-prepare-" + [guid]::NewGuid().ToString("N"))
$builtRuntime = Join-Path $work "duckdb-v1"

function Assert-NotReparsePoint {
    param([string]$Path)
    try {
        $attributes = [System.IO.File]::GetAttributes($Path)
    } catch [System.IO.FileNotFoundException] {
        return
    } catch [System.IO.DirectoryNotFoundException] {
        return
    }
    if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing runtime destination containing a reparse point: $Path"
    }
}

function Assert-RuntimeDestinationSafe {
    foreach ($path in @(
        $bin,
        (Join-Path $bin "runtime"),
        (Join-Path $bin "runtime\telemetry"),
        (Join-Path $bin "runtime\telemetry\duckdb-v1")
    )) {
        Assert-NotReparsePoint -Path $path
    }
}

# Fail before building or entering any cleanup path. GetFullPath above is
# deliberately nominal: it validates the exact destination without following links.
Assert-RuntimeDestinationSafe

function Remove-ExactTemporaryDirectory {
    param([string]$Path)
    $full = [System.IO.Path]::GetFullPath($Path)
    $tempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd("\") + "\"
    if (-not $full.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not (Split-Path -Leaf $full).StartsWith("vantare-runtime-prepare-", [System.StringComparison]::Ordinal)) {
        throw "Refusing unsafe runtime preparation cleanup: $full"
    }
    if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Recurse -Force }
}

try {
    New-Item -ItemType Directory -Path $work | Out-Null
    $buildParameters = @{
        OutputDirectory = $builtRuntime
        GccBin = $GccBin
    }
    if ($DuckDBArchivePath) {
        $buildParameters.DuckDBArchivePath = [System.IO.Path]::GetFullPath($DuckDBArchivePath)
    }
    & $buildScript @buildParameters
    & $verifyScript -RuntimeDirectory $builtRuntime -RepoRoot $repo
    & $smokeScript -RuntimeDirectory $builtRuntime

    $runtimeParent = Split-Path -Parent $runtime
    Assert-RuntimeDestinationSafe
    New-Item -ItemType Directory -Force -Path $runtimeParent | Out-Null
    Assert-RuntimeDestinationSafe
    if (Test-Path -LiteralPath $runtime) {
        $actualRuntime = [System.IO.Path]::GetFullPath($runtime)
        $expectedRuntime = [System.IO.Path]::GetFullPath((Join-Path $bin "runtime\telemetry\duckdb-v1"))
        if (-not $actualRuntime.Equals($expectedRuntime, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to replace an unexpected runtime path: $actualRuntime"
        }
        Assert-RuntimeDestinationSafe
        Remove-Item -LiteralPath $actualRuntime -Recurse -Force
    }
    Move-Item -LiteralPath $builtRuntime -Destination $runtime
    & $verifyScript -RuntimeDirectory $runtime -RepoRoot $repo
} finally {
    Remove-ExactTemporaryDirectory $work
}
