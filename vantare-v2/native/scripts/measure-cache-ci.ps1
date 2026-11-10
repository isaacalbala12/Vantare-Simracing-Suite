# Isolated Windows-hosted experiment. Invoke through compilar.ps1; never runs the app.
param([Parameter(Mandatory)][ValidateSet('compile', 'restore', 'sccache19')][string]$Mode)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or -not $env:VANTARE_SLOT_TARGET) {
    throw 'La medición requiere windows-latest y una reserva de compilar.ps1.'
}
$native = Split-Path $PSScriptRoot
$root = Join-Path $env:RUNNER_TEMP 'vantare-cache-measure'
[IO.Directory]::CreateDirectory($root) | Out-Null
$records = @()
$wrapper = $env:RUSTC_WRAPPER
$previousTarget = $env:CARGO_TARGET_DIR
. (Join-Path $PSScriptRoot 'slot-workspace.ps1')
function Measure-Core([string]$Name, [string]$Target, [bool]$UseCompilerCache) {
    Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
    if ($UseCompilerCache) { $env:RUSTC_WRAPPER = 'sccache' }
    else { Remove-Item Env:RUSTC_WRAPPER -ErrorAction SilentlyContinue }
    Set-VantareSlotWorkspace -Target $Target -NativeRoot $native
    $clock = [Diagnostics.Stopwatch]::StartNew()
    & cargo build -p vantare-runtime --bin vantare-core --target-dir $Target --locked --offline -j 4 --timings
    $result = $LASTEXITCODE
    $clock.Stop()
    $script:records += [ordered]@{name=$Name; seconds=$clock.Elapsed.TotalSeconds; exit=$result; target=$Target}
    [ordered]@{
        revision=(& git rev-parse HEAD)
        logical_cpus=[Environment]::ProcessorCount
        build_jobs=$env:CARGO_BUILD_JOBS
        rustup_toolchain=$env:RUSTUP_TOOLCHAIN
        incremental=$env:CARGO_INCREMENTAL
        records=$script:records
    } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $root "$Mode-metrics.json")
    if ($result) { throw "Medición $Name falló: $result" }
}
Push-Location $native
try {
    if ($Mode -eq 'compile') {
        foreach ($name in @('target-shared', 'sccache-first', 'sccache-second')) {
            if (Test-Path -LiteralPath (Join-Path $root $name)) { throw 'El experimento debe empezar sin targets.' }
        }
        Measure-Core 'cold-no-cache' (Join-Path $root 'target-shared') $false
        & sccache --zero-stats
        if ($LASTEXITCODE) { throw 'No se pudo iniciar el contador de sccache.' }
        Measure-Core 'sccache-first' (Join-Path $root 'sccache-first') $true
        & sccache --show-stats --stats-format=json | Set-Content (Join-Path $root 'sccache-first-stats.json')
        Measure-Core 'sccache-second' (Join-Path $root 'sccache-second') $true
        & sccache --show-stats --stats-format=json | Set-Content (Join-Path $root 'sccache-second-stats.json')
        [ordered]@{
            target_bytes=[long](Get-ChildItem (Join-Path $root 'target-shared') -Recurse -File | Measure-Object Length -Sum).Sum
        } | ConvertTo-Json | Set-Content (Join-Path $root 'target-size.json')
    } elseif ($Mode -eq 'sccache19') {
        & sccache --version | Set-Content (Join-Path $root 'sccache19-version.txt')
        & sccache --zero-stats
        if ($LASTEXITCODE) { throw 'No se pudo iniciar sccache 0.19.' }
        foreach ($name in @('sccache19-first', 'sccache19-second')) {
            $target = Join-Path $root $name
            if (Test-Path -LiteralPath $target) { throw 'El experimento requiere targets vacíos.' }
            Measure-Core $name $target $true
            & sccache --show-stats --stats-format=json | Set-Content (Join-Path $root "$name-stats.json")
        }
    } else {
        $target = Join-Path $root 'target-shared'
        if (-not (Test-Path -LiteralPath (Join-Path $target 'debug/vantare-core.exe'))) {
            throw 'Falta el binario del target restaurado; no se mide una caché vacía.'
        }
        Measure-Core 'target-restored-new-vm' $target $false
    }
} finally {
    [Environment]::SetEnvironmentVariable('RUSTC_WRAPPER', $wrapper, 'Process')
    [Environment]::SetEnvironmentVariable('CARGO_TARGET_DIR', $previousTarget, 'Process')
    Pop-Location
}
