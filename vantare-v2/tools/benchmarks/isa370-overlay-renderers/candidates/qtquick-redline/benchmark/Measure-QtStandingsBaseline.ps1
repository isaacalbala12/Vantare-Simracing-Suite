[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InputDirectory,
    [Parameter(Mandatory)][string]$OutputPath,
    [ValidateRange(1, 100)][int]$ExpectedRepetitions = 10
)

$ErrorActionPreference = 'Stop'
$inputRoot = [IO.Path]::GetFullPath($InputDirectory)
$output = [IO.Path]::GetFullPath($OutputPath)
if (-not (Test-Path -LiteralPath $inputRoot -PathType Container)) { throw "input directory is absent: $inputRoot" }
if (Test-Path -LiteralPath $output) { throw "output already exists: $output" }
if (-not (Test-Path -LiteralPath (Split-Path -Parent $output) -PathType Container)) { throw 'output parent is absent' }

$sceneByScenario = @{
    overtake = 'standings-overtake'
    full = 'standings-full'
    enter = 'standings-car-enters'
    retirement = 'standings-retirement'
    stress = 'standings-full'
}

function Get-Sha256Bytes([byte[]]$Bytes) {
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
}

function Get-Percentile([double[]]$Values, [double]$Quantile) {
    $sorted = @($Values | Sort-Object)
    if ($sorted.Count -eq 0) { throw 'percentile requires samples' }
    $index = [math]::Max(0, [math]::Ceiling($Quantile * $sorted.Count) - 1)
    return [double]$sorted[$index]
}

function Get-Metrics([double[]]$Values) {
    return [ordered]@{
        p50Ms = [math]::Round((Get-Percentile $Values 0.50), 6)
        p95Ms = [math]::Round((Get-Percentile $Values 0.95), 6)
        maxMs = [math]::Round((($Values | Measure-Object -Maximum).Maximum), 6)
    }
}

$traceFiles = @(Get-ChildItem -LiteralPath $inputRoot -File -Filter '*.trace.json' | Sort-Object Name)
if ($traceFiles.Count -eq 0) { throw 'no raw traces found' }
$runs = @()
foreach ($file in $traceFiles) {
    if ($file.Name -notmatch '^(?<scenario>[a-z0-9-]+)-r(?<run>[0-9]{2})\.trace\.json$') {
        throw "unexpected raw trace name: $($file.Name)"
    }
    $scenario = $Matches.scenario
    $run = [int]$Matches.run
    if (-not $sceneByScenario.ContainsKey($scenario)) { throw "unknown scenario: $scenario" }
    if ($file.Length -le 0 -or $file.Length -gt 8MB) { throw "raw trace size is invalid: $($file.Name)" }
    $bytes = [IO.File]::ReadAllBytes($file.FullName)
    $utf8 = [Text.UTF8Encoding]::new($false, $true)
    $document = $utf8.GetString($bytes) | ConvertFrom-Json
    if ($document.schema -ne 'vantare.qt-redline.motion-trace.v1' -or $document.complete -isnot [bool] -or -not $document.complete) {
        throw "raw trace contract is invalid: $($file.Name)"
    }
    if ([string]$document.replaySha256 -notmatch '^[0-9a-f]{64}$' -or [long]$document.qpcFrequency -le 0) {
        throw "raw trace custody is invalid: $($file.Name)"
    }
    $declaredPayload = [string]$document.payloadSha256
    $document.PSObject.Properties.Remove('payloadSha256')
    $compact = $document | ConvertTo-Json -Depth 20 -Compress
    $actualPayload = Get-Sha256Bytes ([Text.Encoding]::UTF8.GetBytes($compact))
    if ($declaredPayload -notmatch '^[0-9a-f]{64}$' -or $declaredPayload -ne $actualPayload) {
        throw "raw trace payload hash is invalid: $($file.Name)"
    }
    $events = @($document.events)
    $expectedRecords = [int]$document.expectedRecords
    if ($expectedRecords -le 0 -or $expectedRecords -gt 4096 -or $events.Count -lt $expectedRecords * 2 + 2) {
        throw "raw trace completeness is invalid: $($file.Name)"
    }
    $durations = @()
    $modelOpen = $null
    $completed = 0
    $lastQpc = 0L
    $presentCount = 0
    $lastPresentFrame = -1
    foreach ($event in $events) {
        $qpc = [long]$event.qpc
        $frame = [int]$event.frame
        if ($qpc -le $lastQpc -or $frame -lt 0 -or $frame -ge $expectedRecords) {
            throw "raw trace event order is invalid: $($file.Name)"
        }
        switch ([string]$event.event) {
            'model-apply-start' {
                if ($null -ne $modelOpen -or $frame -ne $completed) { throw "raw model start is invalid: $($file.Name)" }
                $modelOpen = $event
            }
            'model-apply-end' {
                if ($null -eq $modelOpen -or $frame -ne [int]$modelOpen.frame -or [long]$event.sequence -ne [long]$modelOpen.sequence) {
                    throw "raw model end is invalid: $($file.Name)"
                }
                $durations += 1000.0 * ($qpc - [long]$modelOpen.qpc) / [double]$document.qpcFrequency
                $modelOpen = $null
                $completed++
            }
            'qml-sync' { }
            'present' { $presentCount++; $lastPresentFrame = $frame }
            default { throw "raw trace event is unknown: $($file.Name)" }
        }
        $lastQpc = $qpc
    }
    if ($null -ne $modelOpen -or $completed -ne $expectedRecords -or $presentCount -le 0 -or $lastPresentFrame -lt 0) {
        throw "raw trace final completeness is invalid: $($file.Name)"
    }
    $sceneIds = @($events | ForEach-Object { [string]$_.sceneId } | Sort-Object -Unique)
    if ($sceneIds.Count -ne 1 -or $sceneIds[0] -ne $sceneByScenario[$scenario]) {
        throw "raw trace scene differs from filename: $($file.Name)"
    }
    $runs += [pscustomobject]@{
        scenario = $scenario
        sceneId = $sceneIds[0]
        repetition = $run
        traceFile = $file.Name
        traceSha256 = Get-Sha256Bytes $bytes
        replaySha256 = [string]$document.replaySha256
        expectedRecords = $expectedRecords
        presentations = $presentCount
        durations = [double[]]$durations
        modelApply = Get-Metrics ([double[]]$durations)
    }
}

$scenarios = @()
$globalStatus = 'PASS'
foreach ($group in @($runs | Group-Object scenario | Sort-Object Name)) {
    $orderedRuns = @($group.Group | Sort-Object repetition)
    if ($orderedRuns.Count -ne $ExpectedRepetitions) { throw "scenario $($group.Name) has $($orderedRuns.Count) runs" }
    $expectedRunIds = @(1..$ExpectedRepetitions)
    if (Compare-Object $expectedRunIds @($orderedRuns.repetition)) { throw "scenario $($group.Name) repetition inventory is invalid" }
    $samples = [double[]]@($orderedRuns | ForEach-Object { $_.durations })
    $metrics = Get-Metrics $samples
    $failures = @()
    if ($metrics.p95Ms -gt 8.0) { $failures += 'MODEL_APPLY_P95' }
    if ($metrics.maxMs -gt 16.67) { $failures += 'MODEL_APPLY_MAX' }
    if ($metrics.maxMs -gt 50.0) { $failures += 'HITCH_GT_50' }
    if ($failures.Count -gt 0) { $globalStatus = 'FAIL' }
    $scenarios += [ordered]@{
        id = $group.Name
        sceneId = $orderedRuns[0].sceneId
        runs = $orderedRuns.Count
        samples = $samples.Count
        modelApply = $metrics
        failures = $failures
        raw = @($orderedRuns | ForEach-Object {
            [ordered]@{
                repetition = $_.repetition; traceFile = $_.traceFile; traceSha256 = $_.traceSha256
                records = $_.expectedRecords; presentations = $_.presentations; modelApply = $_.modelApply
            }
        })
    }
}

$summary = [ordered]@{
    schema = 'vantare.qt-standings-baseline.v1'
    status = $globalStatus
    thresholds = [ordered]@{ modelApplyP95Ms = 8.0; modelApplyMaxMs = 16.67; hitchMs = 50.0 }
    repetitions = $ExpectedRepetitions
    replaySha256 = @($runs.replaySha256 | Sort-Object -Unique)
    scenarios = $scenarios
    toolingSha256 = (Get-FileHash -LiteralPath $MyInvocation.MyCommand.Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
$temporary = "$output.tmp"
if (Test-Path -LiteralPath $temporary) { throw "temporary output already exists: $temporary" }
[IO.File]::WriteAllText($temporary, ($summary | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
[IO.File]::Move($temporary, $output)
Write-Output "baseline=$globalStatus scenarios=$($scenarios.Count) raw=$($traceFiles.Count)"
