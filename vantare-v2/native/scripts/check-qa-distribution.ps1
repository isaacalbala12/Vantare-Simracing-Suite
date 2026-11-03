[CmdletBinding()]
param([Parameter(Mandatory)][string]$TargetDirectory)
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath($TargetDirectory)
$native=Split-Path $PSScriptRoot
. (Join-Path $native 'packaging/no-qa.ps1')
Push-Location $native
$previousTarget=$env:CARGO_TARGET_DIR
$previousDuck=$env:DUCKDB_LIB_DIR
try {
    $env:CARGO_TARGET_DIR=$target
    $jobs=if($env:CARGO_BUILD_JOBS){$env:CARGO_BUILD_JOBS}else{'2'}
    & cargo build --locked --offline -p vantare-runtime -p vantare-services --features vantare-runtime/qa-e2e --bin vantare --bin vantare-core --bin vantare-services -j $jobs
    if($LASTEXITCODE){throw 'QA negative-control build failed.'}
    foreach($name in @('vantare','vantare-core','vantare-services')) {
        $rejected=$false
        try { Assert-NativeDistributionBinary (Join-Path $target "debug/$name.exe") }
        catch { if($_.Exception.Message -ne 'QA executable in distribution payload.'){throw}; $rejected=$true }
        if(-not $rejected){throw "QA negative control escaped: $name"}
    }
    $rejected=$false
    try {Assert-NativeDistributionFeatures @('network','qa-e2e')}
    catch {$rejected=$true}
    if(-not $rejected){throw 'QA feature negative control escaped.'}
    Remove-Item Env:DUCKDB_LIB_DIR -ErrorAction SilentlyContinue
    . (Join-Path $native 'packaging/candidate.ps1') -NativeLibrary -NativeRoot (Join-Path $target 'unused-install-root')
    Build-NativeCandidate -Destination (Join-Path $target 'release-package') -CandidateVersion '0.0.0-qa-exclusion' -CandidateChannel nightly -Profile Release -PermitDirty $true
} finally {
    $env:CARGO_TARGET_DIR=$previousTarget
    $env:DUCKDB_LIB_DIR=$previousDuck
    Pop-Location
}
