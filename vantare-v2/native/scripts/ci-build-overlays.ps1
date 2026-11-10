# Build lifecycle's two real UI fixtures independently of the test feature graph.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $env:VANTARE_SLOT_TARGET) { throw 'Invocar por compilar.ps1.' }
$target = $env:VANTARE_SLOT_TARGET
Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
$env:VANTARE_NATIVE_DATA_ROOT = Join-Path $target 'qa-data'
$env:LOCALAPPDATA = $env:VANTARE_NATIVE_DATA_ROOT
$env:APPDATA = $env:VANTARE_NATIVE_DATA_ROOT
[IO.Directory]::CreateDirectory($env:VANTARE_NATIVE_DATA_ROOT) | Out-Null
& (Join-Path $PSScriptRoot '../runtime/tests/lifecycle/build-overlays.ps1') -TargetDirectory $target
$revision = & git -C (Split-Path $PSScriptRoot) rev-parse HEAD
if ($LASTEXITCODE) { throw 'No se pudo identificar el build de overlays.' }
$revision | Set-Content (Join-Path $target 'debug/lifecycle/source-sha.txt') -Encoding utf8
