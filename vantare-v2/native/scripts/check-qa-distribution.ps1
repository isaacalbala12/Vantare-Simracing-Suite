[CmdletBinding()]
param([Parameter(Mandatory)][string]$TargetDirectory)
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath($TargetDirectory)
$native=Split-Path $PSScriptRoot
. (Join-Path $native 'packaging/no-qa.ps1')
& (Join-Path $native 'packaging/no-qa-tests.ps1') -EvidenceDirectory (Join-Path $target ('marker-negative-'+[guid]::NewGuid().ToString('N')))
Push-Location $native
$previousTarget=$env:CARGO_TARGET_DIR
$previousDuck=$env:DUCKDB_LIB_DIR
$previousData=@{}
$fixtureBefore=$env:VANTARE_LICENSE_PUBLIC_KEYS
$qaBefore=$env:VANTARE_QA_AMBIENT
try {
    foreach($pair in @(@('VANTARE_NATIVE_DATA_ROOT','native'),@('LOCALAPPDATA','local'),@('APPDATA','roaming'))) {
        $previousData[$pair[0]]=[Environment]::GetEnvironmentVariable($pair[0],'Process')
        $data=Join-Path $target ('qa-data/'+$pair[1])
        [IO.Directory]::CreateDirectory($data)|Out-Null
        [Environment]::SetEnvironmentVariable($pair[0],$data,'Process')
    }
    $env:CARGO_TARGET_DIR=$target
    $jobs=if($env:CARGO_BUILD_JOBS){$env:CARGO_BUILD_JOBS}else{'2'}
    & cargo build --release --locked --offline -p vantare-runtime -p vantare-services --features vantare-runtime/qa-e2e --bin vantare --bin vantare-core --bin vantare-services -j $jobs
    if($LASTEXITCODE){throw 'QA negative-control build failed.'}
    foreach($name in @('vantare','vantare-core','vantare-services')) {
        $rejected=$false
        try { Assert-NativeDistributionBinary (Join-Path $target "release/$name.exe") }
        catch { if($_.Exception.Message -ne 'QA executable in distribution payload.'){throw}; $rejected=$true }
        if(-not $rejected){throw "QA negative control escaped: $name"}
    }
    $rejected=$false
    try {Assert-NativeDistributionFeatures @('network','qa-e2e')}
    catch {$rejected=$true}
    if(-not $rejected){throw 'QA feature negative control escaped.'}
    Remove-Item Env:DUCKDB_LIB_DIR -ErrorAction SilentlyContinue
    . (Join-Path $native 'packaging/candidate.ps1') -NativeLibrary -NativeRoot (Join-Path $target 'unused-install-root')
    # Regression: an ambient public fixture key must never enter the package.
    $env:VANTARE_LICENSE_PUBLIC_KEYS='qa-rfc8032:11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo'
    $env:VANTARE_QA_AMBIENT='qa-fixture-public'
    # The runtime now links installer/write-engine (#1908): its Windows version
    # resource requires three numeric u16 components, even in this smoke package.
    Build-NativeCandidate -Destination (Join-Path $target 'release-package') -CandidateVersion '0.0.0' -CandidateChannel nightly -Profile Release -PermitDirty $true
    Assert-NativeDistributionTree (Join-Path $target 'release-package/payload')
} finally {
    $env:VANTARE_LICENSE_PUBLIC_KEYS=$fixtureBefore
    $env:VANTARE_QA_AMBIENT=$qaBefore
    foreach($name in $previousData.Keys){[Environment]::SetEnvironmentVariable($name,$previousData[$name],'Process')}
    $env:CARGO_TARGET_DIR=$previousTarget
    $env:DUCKDB_LIB_DIR=$previousDuck
    Pop-Location
}
