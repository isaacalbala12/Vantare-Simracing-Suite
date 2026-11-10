param([Parameter(Mandatory)][string]$ArtifactDirectory)
$ErrorActionPreference='Stop'
if(-not $env:CARGO_TARGET_DIR){throw 'Run through native/scripts/compilar.ps1'}
$destination=[IO.Path]::GetFullPath($ArtifactDirectory)
$qa=[IO.Path]::GetFullPath($env:VANTARE_HUB_QA_ROOT)
$prefix=$qa.TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
if(-not $destination.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Artifact outside QA namespace'}
[IO.Directory]::CreateDirectory($destination)|Out-Null
$manifest=Join-Path $PSScriptRoot '../../native/Cargo.toml'
& cargo build --manifest-path $manifest --release -p vantare-hub-host --bin vantare-hub-host --features qa-e2e -j $env:CARGO_BUILD_JOBS
if($LASTEXITCODE){exit $LASTEXITCODE}
Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'release/vantare-hub-host.exe') -Destination (Join-Path $destination 'vantare-hub-host.exe')
& cargo build --manifest-path $manifest --release -p vantare-hub --bin vantare-hub -j $env:CARGO_BUILD_JOBS
if($LASTEXITCODE){exit $LASTEXITCODE}
Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'release/vantare-hub.exe') -Destination (Join-Path $destination 'vantare-hub-gpui.exe')
& cargo build --manifest-path $manifest --release -p vantare-hub --example ui-quality --features parity-capture -j $env:CARGO_BUILD_JOBS
if($LASTEXITCODE){exit $LASTEXITCODE}
Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'release/examples/ui-quality.exe') -Destination (Join-Path $destination 'vantare.exe')
$inventory=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '../../native/packaging/public-inventory.json') | ConvertFrom-Json
foreach($resource in $inventory.resources){
    $target=Join-Path $destination ('fixtures/'+$resource)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('../../native/ui/fixtures/'+$resource)) -Destination $target
}
exit 0
