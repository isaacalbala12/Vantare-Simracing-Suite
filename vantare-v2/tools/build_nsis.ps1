# Vantare NSIS installer wrapper (R03.B).
#
# Standard library only (PowerShell 5.1+, no external modules).
# Locates a working makensis.exe on the host (real NSIS 3.x takes precedence
# over the Wails3 shim, which is known to fail in some local environments),
# then builds bin/vantare-amd64-installer.exe from build/windows/nsis/project.nsi.
#
# Why this script exists:
#   - The Taskfile task create:nsis:installer calls `makensis` bare, which on
#     some hosts resolves to a wails3 shim that errors with 0x2 because it
#     cannot locate the real NSIS install.
#   - This wrapper keeps real-NSIS discovery, runtime verification and the
#     installer defines in one explicit, reproducible entry point.

[CmdletBinding()]
param(
    [string]$RepoRoot = (Resolve-Path "$PSScriptRoot/..").Path,
    [string]$BinDir = 'bin',
    [string]$AppName = 'vantare',
    [string]$NsiSubdir = 'build\windows\nsis',
    [string]$Arch = 'amd64',
    [ValidateSet('user', 'machine')][string]$InstallScope = 'user',
    [string]$RuntimeDirectory = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)

function Write-Step {
    param([string]$Message)
    Write-Host "[build-nsis] $Message" -ForegroundColor Cyan
}

function Resolve-MakeNsis {
    # Prefer a real NSIS install under Program Files (x86); fall back to makensis on PATH.
    $candidates = @(
        'C:\Program Files (x86)\NSIS\Bin\makensis.exe',
        'C:\Program Files\NSIS\Bin\makensis.exe'
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    $onPath = (Get-Command 'makensis' -ErrorAction SilentlyContinue)
    if ($null -ne $onPath -and $onPath.Path -and (Test-Path -LiteralPath $onPath.Path)) {
        return (Resolve-Path -LiteralPath $onPath.Path).Path
    }
    throw "Could not locate makensis.exe. Install NSIS 3.x from https://nsis.sourceforge.io/ or ensure 'makensis' is on PATH."
}

$nsiPath = Join-Path $RepoRoot $NsiSubdir
if (-not (Test-Path -LiteralPath (Join-Path $nsiPath 'project.nsi'))) {
    throw "project.nsi not found at $nsiPath"
}

# Match the call signature used by create:nsis:installer, but invoke the real
# binary directly. Scope and execution level are explicit CLI defines;
# project.nsi only supplies guarded defaults for manual builds.
$argFlag = $Arch.ToUpperInvariant()
$exePath = Join-Path (Join-Path $RepoRoot $BinDir) "$AppName.exe"
if (-not (Test-Path -LiteralPath $exePath)) {
    throw "Portable exe not found: $exePath (run 'task build' first)"
}
$runtimePath = if ($RuntimeDirectory) {
    [System.IO.Path]::GetFullPath($RuntimeDirectory)
} else {
    [System.IO.Path]::GetFullPath((Join-Path (Join-Path $RepoRoot $BinDir) 'runtime\telemetry\duckdb-v1'))
}
& (Join-Path $RepoRoot 'build\windows\telemetry-reader\verify-runtime.ps1') -RuntimeDirectory $runtimePath -RepoRoot $RepoRoot | Out-Null

# Generate the WebView2 bootstrapper only after every packaged input passed validation.
Write-Step "generating webview2bootstrapper"
& wails3 generate webview2bootstrapper -dir (Join-Path $RepoRoot 'build\windows\nsis') | Out-Null

$nsisExe = Resolve-MakeNsis
Write-Step "using NSIS binary: $nsisExe"

$defineName = "ARG_WAILS_${argFlag}_BINARY"
$requestLevel = if ($InstallScope -eq 'user') { 'user' } else { 'admin' }
$makensisArgs = @(
    "-D${defineName}=`"$exePath`""
    "-DVANTARE_TELEMETRY_RUNTIME=`"$runtimePath`""
    "-DWAILS_INSTALL_SCOPE=$InstallScope"
    "-DREQUEST_EXECUTION_LEVEL=$requestLevel"
    "project.nsi"
)
Write-Step "makensis $($makensisArgs -join ' ') (cwd=$nsiPath)"

Push-Location $nsiPath
try {
    & $nsisExe @makensisArgs
    if ($LASTEXITCODE -ne 0) {
        throw "makensis failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$installer = Join-Path (Join-Path $RepoRoot $BinDir) "$AppName-$Arch-installer.exe"
if (-not (Test-Path -LiteralPath $installer)) {
    throw "Installer not found at expected path: $installer"
}
Write-Step "installer built: $installer"
