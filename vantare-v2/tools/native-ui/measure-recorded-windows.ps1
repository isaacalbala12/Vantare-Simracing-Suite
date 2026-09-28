param(
    [int] $Rounds = 3,
    [int] $Samples = 8,
    [int] $PortBase = 54710
)

$ErrorActionPreference = 'Stop'
if ($Rounds -lt 1 -or $Samples -lt 2) { throw 'Rounds and Samples must be positive; Samples must be at least 2' }
if ($PortBase -lt 1 -or $PortBase + $Rounds * 3 - 1 -gt 65535) { throw 'Port range is invalid' }

$hostExe = Join-Path $PSScriptRoot 'out/host-recorded.exe'
$fixtureRoot = Join-Path $PSScriptRoot '../../testdata'
$measure = Join-Path $PSScriptRoot 'measure-windows.ps1'
$clients = @(
    [pscustomobject]@{ Name = 'Wails'; Exe = (Join-Path $PSScriptRoot 'out/wails/vantare-native-go-wails.exe'); Flag = '-endpoint'; ModeFlag = '-mode' }
    [pscustomobject]@{ Name = 'Qt'; Exe = (Join-Path $PSScriptRoot 'out/package-qt-trimmed/vantare-native-go-qt.exe'); Flag = '--endpoint'; ModeFlag = '--mode' }
    [pscustomobject]@{ Name = 'Slint'; Exe = (Join-Path $PSScriptRoot 'slint/target/release/vantare-native-go-slint.exe'); Flag = '--endpoint'; ModeFlag = '--mode' }
)
foreach ($path in @($hostExe, $measure) + @($clients | ForEach-Object Exe)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing trial file: $path" }
}

$results = @()
for ($round = 0; $round -lt $Rounds; $round++) {
    for ($position = 0; $position -lt $clients.Count; $position++) {
        $candidate = $clients[($round + $position) % $clients.Count]
        $port = $PortBase + $round * $clients.Count + $position
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
            throw "Port $port is already in use"
        }
        $info = [System.Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $hostExe).Path)
        $info.UseShellExecute = $false
        $info.CreateNoWindow = $true
        $info.RedirectStandardOutput = $true
        $info.RedirectStandardError = $true
        foreach ($argument in @('-recorded', '-fixture-root', $fixtureRoot, '-port', "$port", '-recorded-cycles', '1000', '-recorded-interval', '100ms')) {
            [void] $info.ArgumentList.Add($argument)
        }
        $hostProcess = [System.Diagnostics.Process]::Start($info)
        if ($null -eq $hostProcess) { throw 'Could not start recorded Go host' }
        try {
            $ready = $false
            for ($attempt = 0; $attempt -lt 100; $attempt++) {
                if ($hostProcess.HasExited) { throw "Recorded Go host exited: $($hostProcess.StandardError.ReadToEnd())" }
                if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
                    $ready = $true
                    break
                }
                Start-Sleep -Milliseconds 100
            }
            if (-not $ready) { throw "Recorded Go host did not listen on port $port" }
            $endpoint = "http://127.0.0.1:$port/telemetry/overlay-v2/projection"
            $arguments = @($candidate.Flag, $endpoint, $candidate.ModeFlag, 'editor')
            $sample = & $measure -Executable $candidate.Exe -Arguments $arguments -Label editor -ExtraProcessIds @($hostProcess.Id) -WarmupSeconds 3 -Samples $Samples | ConvertFrom-Json
            if ($null -eq $sample -or $hostProcess.HasExited) { throw "Trial ended early: $($candidate.Name), round $($round + 1)" }
        } finally {
            if (-not $hostProcess.HasExited) {
                $hostProcess.Kill($true)
                $hostProcess.WaitForExit()
            }
            $hostLog = $hostProcess.StandardOutput.ReadToEnd()
            $hostError = $hostProcess.StandardError.ReadToEnd()
            $hostProcess.Dispose()
        }
        if ($hostError) { throw "Recorded Go host error: $hostError" }
        if ($hostLog -notmatch 'snapshot 100/') { throw "Fewer than 100 recorded snapshots published: $($candidate.Name), round $($round + 1)" }
        $results += [pscustomobject]@{
            Round = $round + 1
            Position = $position + 1
            Candidate = $candidate.Name
            RecordedFramesAtLeast = 100
            MedianWorkingSetMiB = $sample.MedianWorkingSetMiB
            MedianPrivateMiB = $sample.MedianPrivateMiB
            MeanCpuOneCorePercent = $sample.MeanCpuOneCorePercent
            MeanCpuMachinePercent = $sample.MeanCpuMachinePercent
            MedianGpuLocalMiB = $sample.MedianGpuLocalMiB
            ProcessCount = $sample.ProcessCount
            Samples = $sample.Samples
        }
    }
}
$results | ConvertTo-Json -Compress
