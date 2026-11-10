# QA checks and an immutable executable copy, within the compiler queue lease.
param([string]$ArtifactDirectory)
$ErrorActionPreference='Stop'
if(-not $env:CARGO_TARGET_DIR){throw 'Invoke through native/scripts/compilar.ps1'}
$jobs=[int]$env:CARGO_BUILD_JOBS
if($jobs -lt 1){throw 'Build jobs missing from compiler queue'}
$manifest=Join-Path $PSScriptRoot '../Cargo.toml'
& cargo fmt --manifest-path $manifest --all -- --check
if($LASTEXITCODE){exit $LASTEXITCODE}
& cargo clippy --manifest-path $manifest -p vantare-hub-host --all-targets --features qa-e2e -j $jobs -- -D warnings
if($LASTEXITCODE){exit $LASTEXITCODE}
& cargo nextest run --manifest-path $manifest -p vantare-hub-host --features qa-e2e --build-jobs $jobs
if($LASTEXITCODE){exit $LASTEXITCODE}
& cargo build --manifest-path $manifest -p vantare-hub-host --bin vantare-hub-host --features qa-e2e -j $jobs
if($LASTEXITCODE){exit $LASTEXITCODE}
if($ArtifactDirectory){
    $destination=[IO.Path]::GetFullPath($ArtifactDirectory)
    $qaRoot=if($env:VANTARE_HUB_QA_ROOT){[IO.Path]::GetFullPath($env:VANTARE_HUB_QA_ROOT)}else{[IO.Path]::GetFullPath([IO.Path]::GetTempPath())}
    $qaPrefix=$qaRoot.TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
    if(-not $destination.StartsWith($qaPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Artifact copy requires a child of the QA namespace'}
    [IO.Directory]::CreateDirectory($destination)|Out-Null
    Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'debug/vantare-hub-host.exe') -Destination (Join-Path $destination 'vantare-hub-host.exe')
}
exit 0
