$ErrorActionPreference='Stop'

function Get-OverlayCampaignPlan([int]$Rounds,[ValidateSet('engine','sampler','quiet')][string]$Study='engine') {
    if ($Rounds%2 -or $Rounds -gt 24 -or $Rounds -lt $(if ($Study -eq 'engine') { 8 } else { 6 })) { throw 'Use balanced even round counts: engine 8..24, sampler 6..24' }
    for ($round=1;$round -le $Rounds;$round++) {
        $pattern=if ($round%2) { @('A','B','B','A') } else { @('B','A','A','B') }
        $experiments=if ($round%2) { @('aa','ab') } else { @('ab','aa') }
        if ($Study -ne 'engine') { $experiments=@('ab') }
        foreach ($experiment in $experiments) {
            for ($slot=0;$slot -lt 4;$slot++) {
                [pscustomobject]@{round=$round;experiment=$experiment;slot=$slot;label=$pattern[$slot];directory="$experiment-round-$round-slot-$slot-$($pattern[$slot])"}
            }
        }
    }
}

function Assert-OverlayCapabilities($A,$B,$Core,[bool]$Stress) {
    foreach ($info in @($A,$B,$Core)) {
        if ($info.profile -ne 'release' -or $info.opt_level -ne '3' -or $info.dirty -ne $false -or $info.sha -notmatch '^[a-f0-9]{40}$' -or 'PAINT_STATS' -notin $info.features) { throw 'Clean instrumented Release provenance required before any observation' }
    }
    $left=@($A.measurement_capabilities | Sort-Object -Unique)
    $right=@($B.measurement_capabilities | Sort-Object -Unique)
    if (($left -join ',') -ne ($right -join ',')) { throw 'A and B capabilities differ; no observations started' }
    if ($Stress -and 'render_load' -notin $left) { throw 'Both UIs must support stress rendering' }
    if ($Stress -and 'render_load_uncapped' -notin $left) { throw 'Stress requires the uncapped capability in both UIs' }
}

function Add-OverlayAttemptEvent($Registry,$Event) {
    $path=[IO.Path]::GetFullPath($Registry)
    $digest=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($path.ToLowerInvariant())))
    $mutex=[Threading.Mutex]::new($false,"Global\VantareMeasurementLedger-$digest")
    $held=$false
    try {
        try { $held=$mutex.WaitOne(10000) } catch [Threading.AbandonedMutexException] { $held=$true }
        if (!$held) { throw 'Measurement ledger is busy' }
        [IO.File]::AppendAllText($path,($Event | ConvertTo-Json -Depth 12 -Compress)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
    } finally {
        if ($held) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

function Start-OverlayAttempt($Config) {
    $path=[IO.Path]::GetFullPath($Config.registry)
    [IO.Directory]::CreateDirectory((Split-Path $path)) | Out-Null
    $digest=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($path.ToLowerInvariant())))
    $mutex=[Threading.Mutex]::new($false,"Global\VantareMeasurementLedger-$digest")
    $held=$false
    try {
        try { $held=$mutex.WaitOne(10000) } catch [Threading.AbandonedMutexException] { $held=$true }
        if (!$held) { throw 'Measurement ledger is busy' }
        $history=if (Test-Path -LiteralPath $path) { @(Get-Content -LiteralPath $path | Where-Object { $_ } | ForEach-Object { $_ | ConvertFrom-Json }) } else { @() }
        $attempts=@($history | Where-Object { $_.event -eq 'start' -and $_.family -eq $Config.family })
        if ($attempts.Count -ge 3) {
            Add-OverlayAttemptEvent $path @{event='refused';family=$Config.family;date=(Get-Date -Format o);reason='three-attempt limit'}
            throw 'Three campaign attempts exhausted; preserve and report the actual noise floor'
        }
        if ($attempts.Count -and [string]::IsNullOrWhiteSpace($Config.attempt_reason)) {
            Add-OverlayAttemptEvent $path @{event='refused';family=$Config.family;date=(Get-Date -Format o);reason='missing repeat justification'}
            throw 'A repeated campaign requires an explicit reason, recorded before starting'
        }
        $id=[guid]::NewGuid().ToString('N')
        $event=@{event='start';id=$id;number=($attempts.Count+1);family=$Config.family;date=(Get-Date -Format o);config=$Config}
        Add-OverlayAttemptEvent $path $event
        return $event
    } finally {
        if ($held) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

function Invoke-OverlayCampaign($Config,[scriptblock]$Observe) {
    if (Test-Path -LiteralPath $Config.out) { throw 'Use fresh campaign evidence' }
    New-Item -ItemType Directory -Path $Config.out | Out-Null
    $attempt=Start-OverlayAttempt $Config
    $stage='preflight'
    try {
        Assert-OverlayCapabilities $Config.a_info $Config.b_info $Config.core_info ([bool]$Config.stress)
        if ($Config.study -ne 'sampler' -and $Config.a_hash -eq $Config.b_hash) { throw 'Engine A/B requires two distinct binaries' }
        if ($Config.study -eq 'sampler' -and $Config.a_hash -ne $Config.b_hash) { throw 'Sampling control requires the same UI binary' }
        $plan=@(Get-OverlayCampaignPlan $Config.rounds $Config.study)
        $declaration=@{protocol=3;rounds=$Config.rounds;study=$Config.study;primary_metric='ui.cycles_per_second';role=$Config.role;config=$Config;attempt=$attempt.id;max_attempts=3;noise_percent_limit=2.5}
        $declaration | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath "$($Config.out)/ab-plan.json"
        $order=[Collections.Generic.List[object]]::new()
        $stage='observations'
        foreach ($entry in $plan) {
            $engine=if ($entry.experiment -eq 'aa' -or $entry.label -eq 'A') { $Config.a } else { $Config.b }
            $mode=if ($Config.study -eq 'sampler' -and $entry.label -eq 'B') { 'light' } else { 'full' }
            $order.Add($entry)
            ConvertTo-Json -InputObject $order.ToArray() -Depth 8 | Set-Content -LiteralPath "$($Config.out)/ab-order.json"
            & $Observe $Config $entry $engine $mode
            $folder=Join-Path $Config.out $entry.directory
            if (!(Test-Path "$folder/complete.txt") -or !(Test-Path "$folder/summary.json")) { throw 'Observation did not produce complete evidence and summary' }
        }
        $stage='aggregation'
        & python (Join-Path $PSScriptRoot 'aggregate-overlay-ab.py') $Config.out > "$($Config.out)/aggregate.stdout.json"
        if ($LASTEXITCODE) { throw 'Balanced campaign aggregation failed' }
        $result=Get-Content -Raw -LiteralPath "$($Config.out)/ab-comparison.json" | ConvertFrom-Json
        $noise=if ($result.PSObject.Properties.Name -contains 'noise_percent_bound') { $result.noise_percent_bound } else { $null }
        Add-OverlayAttemptEvent $Config.registry @{event='finish';id=$attempt.id;family=$Config.family;date=(Get-Date -Format o);status='complete';verdict=$result.verdict;noise=$noise}
        return $result
    } catch {
        Add-OverlayAttemptEvent $Config.registry @{event='finish';id=$attempt.id;family=$Config.family;date=(Get-Date -Format o);status='failed';stage=$stage;reason=$_.Exception.Message}
        throw
    }
}

Export-ModuleMember -Function Get-OverlayCampaignPlan,Assert-OverlayCapabilities,Start-OverlayAttempt,Add-OverlayAttemptEvent,Invoke-OverlayCampaign
