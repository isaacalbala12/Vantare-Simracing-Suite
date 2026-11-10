# Run this script through native/scripts/compilar.ps1, holding one build slot.
$ErrorActionPreference='Stop'
if(-not $env:CARGO_TARGET_DIR -or -not [IO.Path]::GetFullPath($env:CARGO_TARGET_DIR).StartsWith('D:\VantareServer\targets\',[StringComparison]::OrdinalIgnoreCase)){throw 'An isolated target on D: is required'}
$manifest=Join-Path $PSScriptRoot '../Cargo.toml'
& cargo fmt --manifest-path $manifest --all -- --check
if($LASTEXITCODE){exit $LASTEXITCODE}
& cargo clippy --manifest-path $manifest -p vantare-hub-host --all-targets --features qa-e2e -j 2 -- -D warnings
if($LASTEXITCODE){exit $LASTEXITCODE}
& cargo nextest run --manifest-path $manifest -p vantare-hub-host --features qa-e2e --build-jobs 2
if($LASTEXITCODE){exit $LASTEXITCODE}
& cargo build --manifest-path $manifest -p vantare-hub-host --features qa-e2e -j 2
exit $LASTEXITCODE
