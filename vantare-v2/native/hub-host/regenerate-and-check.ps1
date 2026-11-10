$ErrorActionPreference='Stop'
& cargo run --manifest-path (Join-Path $PSScriptRoot '../Cargo.toml') -p vantare-hub-host --example export-types -j 2
if($LASTEXITCODE){exit $LASTEXITCODE}
& (Join-Path $PSScriptRoot 'check.ps1')
exit $LASTEXITCODE
