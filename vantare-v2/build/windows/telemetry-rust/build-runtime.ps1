[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [string]$BinDir = 'bin'
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($RepoRoot)
$manifest = Join-Path $root 'rust\telemetry\Cargo.toml'
if (-not (Test-Path -LiteralPath $manifest)) { throw "Rust telemetry manifest missing: $manifest" }

& cargo +1.95.0 build --manifest-path $manifest --release --locked
if ($LASTEXITCODE -ne 0) { throw "Rust telemetry release build failed: $LASTEXITCODE" }

$built = Join-Path $root 'rust\telemetry\target\release\vantare-telemetry.exe'
if (-not (Test-Path -LiteralPath $built)) { throw "Rust telemetry helper missing: $built" }
$reported = (& $built --version)
if ($LASTEXITCODE -ne 0 -or $reported -ne 'vantare-telemetry 0.1.0') {
    throw "Rust telemetry helper version mismatch: $reported"
}

$destination = Join-Path (Join-Path $root $BinDir) 'runtime\telemetry\rust-live-v1'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -LiteralPath $built -Destination (Join-Path $destination 'vantare-telemetry.exe') -Force
Write-Host "Rust telemetry helper prepared: $destination"
