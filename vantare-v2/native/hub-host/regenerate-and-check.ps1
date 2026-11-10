param([string]$ArtifactDirectory)
$ErrorActionPreference='Stop'
if(-not $env:CARGO_TARGET_DIR){throw 'Invoke through native/scripts/compilar.ps1'}
$jobs=[int]$env:CARGO_BUILD_JOBS
if($jobs -lt 1){throw 'Build jobs missing from compiler queue'}
& cargo run --manifest-path (Join-Path $PSScriptRoot '../Cargo.toml') -p vantare-hub-host --example export-types -j $jobs
if($LASTEXITCODE){exit $LASTEXITCODE}
& (Join-Path $PSScriptRoot 'check.ps1') -ArtifactDirectory $ArtifactDirectory
exit $LASTEXITCODE
