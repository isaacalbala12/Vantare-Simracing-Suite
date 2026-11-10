param([Parameter(Mandatory)][string]$ArtifactDirectory)
$ErrorActionPreference='Stop'
if(-not $env:CARGO_TARGET_DIR){throw 'Run through native/scripts/compilar.ps1'}
$destination=[IO.Path]::GetFullPath($ArtifactDirectory)
$qa=[IO.Path]::GetFullPath($env:VANTARE_HUB_QA_ROOT)
if(-not $destination.StartsWith($qa.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Artifact outside QA namespace'}
[IO.Directory]::CreateDirectory($destination)|Out-Null
& (Join-Path $PSScriptRoot '../../native/hub-host/check.ps1')
if($LASTEXITCODE){exit $LASTEXITCODE}
& cargo build --manifest-path (Join-Path $PSScriptRoot '../../native/Cargo.toml') --release -p vantare-hub-host --bin vantare-hub-host --features qa-e2e -j $env:CARGO_BUILD_JOBS
if($LASTEXITCODE){exit $LASTEXITCODE}
Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'release/vantare-hub-host.exe') -Destination (Join-Path $destination 'vantare-hub-host.exe')
& cargo build --manifest-path (Join-Path $PSScriptRoot '../../native/Cargo.toml') --release -p vantare-hub --example ui-quality --features parity-capture -j $env:CARGO_BUILD_JOBS
if($LASTEXITCODE){exit $LASTEXITCODE}
Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'release/examples/ui-quality.exe') -Destination (Join-Path $destination 'vantare.exe')
$inventory=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '../../native/packaging/public-inventory.json')|ConvertFrom-Json
foreach($resource in $inventory.resources){
    $target=Join-Path $destination ('fixtures/'+$resource)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('../../native/ui/fixtures/'+$resource)) -Destination $target
}
