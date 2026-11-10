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
$phases=@()
function Save-DistributionPhase([string]$Name, [Diagnostics.Stopwatch]$Clock) {
    $Clock.Stop()
    $script:phases+=@{name=$Name;seconds=$Clock.Elapsed.TotalSeconds;jobs=$env:CARGO_BUILD_JOBS;wrapper=$env:RUSTC_WRAPPER}
    $script:phases | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'distribution-phases.json')
    Write-Host "[distribution] $Name terminó en $($Clock.Elapsed.TotalSeconds) s; jobs=$env:CARGO_BUILD_JOBS"
    if (Get-Command sccache -ErrorAction SilentlyContinue) {
        & sccache --show-stats --stats-format=json | Set-Content -LiteralPath (Join-Path $target "distribution-$Name-sccache.json")
        if ($LASTEXITCODE) { Write-Warning 'No se pudo recoger la estadística diagnóstica de sccache.' }
    }
}
try {
    foreach($pair in @(@('VANTARE_NATIVE_DATA_ROOT','native'),@('LOCALAPPDATA','local'),@('APPDATA','roaming'))) {
        $previousData[$pair[0]]=[Environment]::GetEnvironmentVariable($pair[0],'Process')
        $data=Join-Path $target ('qa-data/'+$pair[1])
        [IO.Directory]::CreateDirectory($data)|Out-Null
        [Environment]::SetEnvironmentVariable($pair[0],$data,'Process')
    }
    $env:CARGO_TARGET_DIR=$target
    $jobs=if($env:CARGO_BUILD_JOBS){$env:CARGO_BUILD_JOBS}else{'2'}
    try {
        Write-Host '[distribution] 1/3: control QA Release de Core/Services'
        $phase=[Diagnostics.Stopwatch]::StartNew()
        # Fixture trust is scoped to this QA compiler child, never the caller session.
        $env:VANTARE_LICENSE_PUBLIC_KEYS='qa-rfc8032:11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo'
        Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
        & cargo build --release --locked --offline -p vantare-runtime -p vantare-services --features vantare-runtime/qa-e2e --bin vantare --bin vantare-core --bin vantare-services -j $jobs --target-dir $target --timings
        if($LASTEXITCODE){throw 'QA negative-control build failed.'}
        Save-DistributionPhase 'qa-control' $phase
    } finally {$env:VANTARE_LICENSE_PUBLIC_KEYS=$fixtureBefore;$env:CARGO_TARGET_DIR=$target}
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
    # Regression: an ambient public fixture key must never enter the package.
    $env:VANTARE_LICENSE_PUBLIC_KEYS='qa-rfc8032:11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo'
    $env:VANTARE_QA_AMBIENT='qa-fixture-public'
    # The runtime now links installer/write-engine (#1908): its Windows version
    # resource requires three numeric u16 components, even in this smoke package.
    Write-Host '[distribution] 2/3: candidato Release limpio, con CRT estático y DuckDB bundled'
    $phase=[Diagnostics.Stopwatch]::StartNew()
    $null=& (Join-Path $native 'packaging/build-candidate.ps1') -Version '0.0.0' -Channel nightly -OutputDirectory (Join-Path $target 'release-package') -BuildProfile Release -AllowDirty
    Save-DistributionPhase 'clean-candidate' $phase
    Assert-NativeDistributionTree (Join-Path $target 'release-package/payload')
    & (Join-Path $native 'packaging/no-qa-tests.ps1') -EvidenceDirectory (Join-Path $target ('actual-exe-controls-'+[guid]::NewGuid().ToString('N'))) -CleanExecutable (Join-Path $target 'release-package/payload/bin/vantare.exe') -FixtureExecutable (Join-Path $target 'release/vantare-core.exe')


    # End-to-end configured authority control, without the QA feature: compile
    # through the real candidate builder, then require its byte gate to reject.
    # The production allowlist is never edited or populated with a test key.
    $testConfig=Join-Path $target 'configured-test-public.cfg'
    [IO.File]::WriteAllText($testConfig,'VANTARE_LICENSE_PUBLIC_KEYS=qa-rfc8032:11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',[Text.UTF8Encoding]::new($false))
    $rejected=$false
    Write-Host '[distribution] 3/3: candidato Release con registro TEST explícito, que debe rechazarse'
    $phase=[Diagnostics.Stopwatch]::StartNew()
    try {
        $null=& (Join-Path $native 'packaging/build-candidate.ps1') -Version '0.0.0' -Channel nightly -OutputDirectory (Join-Path $target 'configured-test-package') -ConfigFile $testConfig -BuildProfile Release -AllowDirty
    } catch {
        if($_.Exception.Message -cne 'QA executable in distribution payload.'){throw}
        $rejected=$true
    }
    if(-not $rejected){throw 'Explicit test license registry escaped real release packaging.'}
    Save-DistributionPhase 'test-registry-candidate' $phase
    foreach($name in @('vantare-core','vantare-services')) {
        $rejected=$false
        try {Assert-NativeDistributionBinary (Join-Path $target "x86_64-pc-windows-msvc/release/$name.exe")}
        catch {if($_.Exception.Message -cne 'QA executable in distribution payload.'){throw};$rejected=$true}
        if(-not $rejected){throw "Configured test license key missing from negative control: $name"}
    }
    if(Test-Path -LiteralPath (Join-Path $target 'configured-test-package/vantare-native-amd64-package.zip')){throw 'Rejected test registry produced a package.'}
    'Real non-QA candidate with explicit TEST license registry rejected end-to-end PASS'

} finally {
    $env:VANTARE_LICENSE_PUBLIC_KEYS=$fixtureBefore
    $env:VANTARE_QA_AMBIENT=$qaBefore
    foreach($name in $previousData.Keys){[Environment]::SetEnvironmentVariable($name,$previousData[$name],'Process')}
    $env:CARGO_TARGET_DIR=$previousTarget
    $env:DUCKDB_LIB_DIR=$previousDuck
    Pop-Location
}
