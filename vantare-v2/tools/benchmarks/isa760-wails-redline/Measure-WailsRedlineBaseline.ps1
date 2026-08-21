[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $RunsetDirectory,
    [string] $OutputPath
)

$ErrorActionPreference = 'Stop'
$runset = (Resolve-Path -LiteralPath $RunsetDirectory).Path
$manifestPath = Join-Path $runset 'manifest.json'
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.contractVersion -ne 'isa760-wails-runset-v1') { throw 'invalid runset contract' }
if (-not $OutputPath) { $OutputPath = Join-Path $runset 'summary.json' }

function Get-Percentile([double[]] $Values, [double] $Percentile) {
    if ($Values.Count -eq 0) { throw 'cannot calculate a percentile over an empty set' }
    $sorted = @($Values | Sort-Object)
    $index = [math]::Max(0, [math]::Ceiling($Percentile * $sorted.Count) - 1)
    return [double]$sorted[$index]
}

$scenarioGroups = @{}
foreach ($run in $manifest.runs) {
    $tracePath = Join-Path $runset $run.trace
    $resourcePath = Join-Path $runset $run.resources
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $tracePath).Hash.ToLowerInvariant() -ne $run.traceSha256) { throw "trace hash mismatch: $($run.runId)" }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $resourcePath).Hash.ToLowerInvariant() -ne $run.resourcesSha256) { throw "resource hash mismatch: $($run.runId)" }
    $trace = Get-Content -Raw -LiteralPath $tracePath | ConvertFrom-Json
    $resource = Get-Content -Raw -LiteralPath $resourcePath | ConvertFrom-Json
    if ($trace.contractVersion -ne 'isa760-wails-redline-trace-v1' -or -not $trace.complete -or $trace.runId -ne $run.runId -or $trace.frames.Count -ne $trace.expectedFrames -or -not $trace.runtime.wailsBridge -or -not $trace.runtime.fontsReady) { throw "invalid trace: $($run.runId)" }
    if (@($trace.frames | Where-Object { $_.expectedRows -ne $_.observedRows }).Count -ne 0) { throw "row parity failure: $($run.runId)" }
    if ($resource.contractVersion -ne 'isa760-wails-resource-v1' -or $resource.runId -ne $run.runId) { throw "invalid resources: $($run.runId)" }
    if (-not $scenarioGroups.ContainsKey($run.scenario)) { $scenarioGroups[$run.scenario] = [System.Collections.Generic.List[object]]::new() }
    $scenarioGroups[$run.scenario].Add([pscustomobject]@{ trace = $trace; resources = $resource })
}

$summaries = foreach ($scenario in @($manifest.scenarios)) {
    $group = @($scenarioGroups[$scenario])
    $frames = @($group | ForEach-Object { $_.trace.frames })
    $commit = [double[]]@($frames.commitMs)
    $layout = [double[]]@($frames.layoutMs)
    $raf = [double[]]@($frames.rafSubmitMs)
    $lateness = [double[]]@($frames.scheduleLatenessMs)
    $layoutP95 = Get-Percentile $layout 0.95
    [ordered]@{
        scenario = $scenario
        runs = $group.Count
        frames = $frames.Count
        rowParity = 'VALID'
        commitMs = [ordered]@{ p50 = Get-Percentile $commit 0.50; p95 = Get-Percentile $commit 0.95; max = ($commit | Measure-Object -Maximum).Maximum }
        layoutMs = [ordered]@{ p50 = Get-Percentile $layout 0.50; p95 = $layoutP95; max = ($layout | Measure-Object -Maximum).Maximum }
        rafSubmitMs = [ordered]@{ p50 = Get-Percentile $raf 0.50; p95 = Get-Percentile $raf 0.95; max = ($raf | Measure-Object -Maximum).Maximum; equivalenceToPresentation = 'UNRESOLVED' }
        scheduleLatenessMs = [ordered]@{ p50 = Get-Percentile $lateness 0.50; p95 = Get-Percentile $lateness 0.95; max = ($lateness | Measure-Object -Maximum).Maximum }
        layoutP95Gate8ms = $(if ($layoutP95 -le 8) { 'VALID' } else { 'INVALID' })
        normalizedCpuPercent = [ordered]@{ median = Get-Percentile ([double[]]@($group.resources.normalizedCpuPercent)) 0.50; comparisonToQt = 'UNRESOLVED' }
        peakWorkingSetBytes = [ordered]@{ median = Get-Percentile ([double[]]@($group.resources.peakWorkingSetBytes)) 0.50; comparisonToQt = 'UNRESOLVED' }
    }
}

$summary = [ordered]@{
    contractVersion = 'isa760-wails-summary-v1'
    sourceManifestSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant()
    gitHead = $manifest.gitHead
    rendererComparison = [ordered]@{
        reactCommitVsQtModelApply = 'DEGRADED'
        rafSubmitVsQtFrameSwapped = 'UNRESOLVED'
        cpuAndMemoryVsQt = 'UNRESOLVED'
    }
    scenarios = $summaries
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding utf8NoBOM
$summary | ConvertTo-Json -Depth 8
