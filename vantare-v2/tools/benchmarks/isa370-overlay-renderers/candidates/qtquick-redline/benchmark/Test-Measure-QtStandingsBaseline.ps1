[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$measure = Join-Path $here 'Measure-QtStandingsBaseline.ps1'
if (-not (Test-Path -LiteralPath $measure -PathType Leaf)) {
    throw 'RED: the independent Qt Standings baseline aggregator is absent'
}

$temp = Join-Path ([IO.Path]::GetTempPath()) ("isa693-baseline-test-{0}" -f [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    function New-Trace {
        param([string]$Path, [int]$Run, [long[]]$Durations)
        $events = @()
        $qpc = 1000L
        for ($frame = 0; $frame -lt $Durations.Count; $frame++) {
            $sequence = 10 + $frame
            $logical = -2000.0 + 100.0 * $frame
            $events += [ordered]@{ event = 'model-apply-start'; frame = $frame; logicalMs = $logical; qpc = $qpc; sceneId = 'standings-overtake'; sequence = $sequence }
            $qpc += $Durations[$frame]
            $events += [ordered]@{ event = 'model-apply-end'; frame = $frame; logicalMs = $logical; qpc = $qpc; sceneId = 'standings-overtake'; sequence = $sequence }
            $qpc += 10
        }
        $last = $Durations.Count - 1
        $events += [ordered]@{ event = 'qml-sync'; frame = $last; logicalMs = -2000.0 + 100.0 * $last; qpc = $qpc; sceneId = 'standings-overtake'; sequence = 10 + $last }
        $qpc += 10
        $events += [ordered]@{ event = 'present'; frame = $last; logicalMs = -2000.0 + 100.0 * $last; qpc = $qpc; sceneId = 'standings-overtake'; sequence = 10 + $last }
        $document = [ordered]@{
            complete = $true
            events = $events
            expectedRecords = $Durations.Count
            qpcFrequency = 1000
            replaySha256 = ('a' * 64)
            schema = 'vantare.qt-redline.motion-trace.v1'
        }
        $payload = $document | ConvertTo-Json -Depth 10 -Compress
        $document.payloadSha256 = [Convert]::ToHexString(
            [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($payload))
        ).ToLowerInvariant()
        [IO.File]::WriteAllText($Path, ($document | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
    }

    New-Trace -Path (Join-Path $temp 'overtake-r01.trace.json') -Run 1 -Durations @(1, 2)
    New-Trace -Path (Join-Path $temp 'overtake-r02.trace.json') -Run 2 -Durations @(3, 20)
    $output = Join-Path $temp 'summary.json'
    & $measure -InputDirectory $temp -OutputPath $output -ExpectedRepetitions 2
    $summary = Get-Content -LiteralPath $output -Raw | ConvertFrom-Json
    if ($summary.status -ne 'FAIL') { throw 'threshold failure was not preserved' }
    $case = @($summary.scenarios)[0]
    if ($case.samples -ne 4 -or $case.modelApply.p50Ms -ne 2 -or $case.modelApply.p95Ms -ne 20 -or $case.modelApply.maxMs -ne 20) {
        throw 'aggregated percentiles differ from the synthetic oracle'
    }
    if ($case.runs -ne 2 -or $case.failures -notcontains 'MODEL_APPLY_P95' -or $case.failures -notcontains 'MODEL_APPLY_MAX') {
        throw 'causal threshold failures are incomplete'
    }
    Write-Output 'PASS: independent Qt Standings baseline aggregation and RED thresholds'
}
finally {
    if (Test-Path -LiteralPath $temp) {
        Remove-Item -LiteralPath $temp -Recurse -Force
    }
}
