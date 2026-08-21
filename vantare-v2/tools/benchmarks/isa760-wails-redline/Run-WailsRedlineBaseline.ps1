[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $OutputDirectory,
    [ValidateRange(1, 10)] [int] $Repetitions = 3,
    [ValidateSet('overtake', 'full', 'enter', 'retirement', 'stress104')]
    [string[]] $Scenarios = @('overtake', 'full', 'enter', 'retirement', 'stress104'),
    [ValidateRange(20, 120)] [int] $TimeoutSeconds = 60,
    [ValidateRange(100, 2000)] [int] $SampleIntervalMs = 500
)

$ErrorActionPreference = 'Stop'
$toolRoot = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $toolRoot '..\..\..')).Path
$binary = Join-Path $toolRoot 'host\bin\vantare-wails-redline-benchmark.exe'
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
if (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) { throw 'OutputDirectory must be absolute' }
if (Test-Path -LiteralPath $output) { throw "output directory already exists: $output" }
if (-not (Test-Path -LiteralPath $binary)) { throw "benchmark binary is missing: $binary" }

Push-Location $repoRoot
try {
    & git diff --quiet HEAD --
    if ($LASTEXITCODE -ne 0) { throw 'tracked worktree must be clean for a final benchmark run' }
    $untracked = @(& git ls-files --others --exclude-standard)
    if ($LASTEXITCODE -ne 0 -or $untracked.Count -ne 0) { throw 'untracked files are present in the worktree' }
    $head = (& git rev-parse HEAD).Trim()
}
finally { Pop-Location }

New-Item -ItemType Directory -Path $output | Out-Null
$runs = [System.Collections.Generic.List[object]]::new()
$logicalProcessors = [Environment]::ProcessorCount

function Get-ProcessTree([int] $RootPid) {
    $inventory = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name)
    $ids = [System.Collections.Generic.HashSet[int]]::new()
    [void]$ids.Add($RootPid)
    do {
        $added = $false
        foreach ($item in $inventory) {
            if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $added = $true }
        }
    } while ($added)
    return @($inventory | Where-Object { $ids.Contains([int]$_.ProcessId) })
}

foreach ($repetition in 1..$Repetitions) {
    foreach ($scenario in $Scenarios) {
        $runId = '{0}-r{1:D2}' -f $scenario, $repetition
        $tracePath = Join-Path $output "$runId.trace.json"
        $resourcePath = Join-Path $output "$runId.resources.json"
        $userData = Join-Path $output "$runId.webview2"
        $arguments = @('-scenario', $scenario, '-run-id', $runId, '-trace', $tracePath)
        $previousUserData = $env:WEBVIEW2_USER_DATA_FOLDER
        $env:WEBVIEW2_USER_DATA_FOLDER = $userData
        try {
            $process = Start-Process -FilePath $binary -ArgumentList $arguments -PassThru -WindowStyle Hidden
        }
        finally {
            if ($null -eq $previousUserData) { Remove-Item Env:\WEBVIEW2_USER_DATA_FOLDER -ErrorAction SilentlyContinue }
            else { $env:WEBVIEW2_USER_DATA_FOLDER = $previousUserData }
        }
        $started = Get-Date
        $knownPids = [System.Collections.Generic.HashSet[int]]::new()
        $lastCPU = @{}
        $accumulatedCPU = 0.0
        $samples = [System.Collections.Generic.List[object]]::new()
        while (-not $process.HasExited) {
            if (((Get-Date) - $started).TotalSeconds -gt $TimeoutSeconds) {
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                throw "benchmark timed out: $runId"
            }
            $tree = @(Get-ProcessTree $process.Id)
            $workingSet = [int64]0
            foreach ($item in $tree) {
                [void]$knownPids.Add([int]$item.ProcessId)
                $live = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
                if ($null -eq $live) { continue }
                $workingSet += [int64]$live.WorkingSet64
                $currentCPU = [double]$live.CPU
                if ($lastCPU.ContainsKey($item.ProcessId)) {
                    $delta = $currentCPU - [double]$lastCPU[$item.ProcessId]
                    if ($delta -gt 0) { $accumulatedCPU += $delta }
                }
                $lastCPU[$item.ProcessId] = $currentCPU
            }
            $samples.Add([pscustomobject]@{
                elapsedMs = [math]::Round(((Get-Date) - $started).TotalMilliseconds, 3)
                processes = $tree.Count
                workingSetBytes = $workingSet
                accumulatedCpuSeconds = [math]::Round($accumulatedCPU, 6)
            })
            Start-Sleep -Milliseconds $SampleIntervalMs
            $process.Refresh()
        }
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw "benchmark failed: $runId exit=$($process.ExitCode)" }
        if (-not (Test-Path -LiteralPath $tracePath)) { throw "trace missing: $runId" }
        Start-Sleep -Milliseconds 1000
        $residual = @($knownPids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
        if ($residual.Count -ne 0) { throw "owned residual processes after $runId`: $($residual -join ',')" }
        $durationSeconds = ((Get-Date) - $started).TotalSeconds
        $resource = [ordered]@{
            contractVersion = 'isa760-wails-resource-v1'
            runId = $runId
            sampleIntervalMs = $SampleIntervalMs
            logicalProcessors = $logicalProcessors
            wallSeconds = [math]::Round($durationSeconds, 6)
            accumulatedCpuSeconds = [math]::Round($accumulatedCPU, 6)
            normalizedCpuPercent = [math]::Round(($accumulatedCPU / $durationSeconds / $logicalProcessors) * 100, 3)
            peakWorkingSetBytes = ($samples.workingSetBytes | Measure-Object -Maximum).Maximum
            samples = $samples
        }
        $resource | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resourcePath -Encoding utf8NoBOM
        $runs.Add([pscustomobject]@{
            runId = $runId
            scenario = $scenario
            repetition = $repetition
            trace = [System.IO.Path]::GetFileName($tracePath)
            traceSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $tracePath).Hash.ToLowerInvariant()
            resources = [System.IO.Path]::GetFileName($resourcePath)
            resourcesSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resourcePath).Hash.ToLowerInvariant()
        })
        Write-Host "VALID $runId"
    }
}

$manifest = [ordered]@{
    contractVersion = 'isa760-wails-runset-v1'
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    gitHead = $head
    binarySha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $binary).Hash.ToLowerInvariant()
    replayCustody = [ordered]@{
        canonical = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $toolRoot 'replay\redline-viewmodels-v1.jsonl')).Hash.ToLowerInvariant()
        stress104 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $toolRoot 'replay\redline-viewmodels-stress104-v1.jsonl')).Hash.ToLowerInvariant()
    }
    os = [Environment]::OSVersion.VersionString
    logicalProcessors = $logicalProcessors
    repetitions = $Repetitions
    scenarios = $Scenarios
    runs = $runs
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $output 'manifest.json') -Encoding utf8NoBOM
Write-Host "VALID runset=$output runs=$($runs.Count)"
