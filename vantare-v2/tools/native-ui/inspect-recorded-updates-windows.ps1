param(
    [ValidateSet('control', 'editor', 'overlay')] [string] $Mode = 'editor',
    [int] $Port = 54678,
    [ValidateSet('pit-sequence', 'standings-44')] [string] $Scene = 'pit-sequence',
    [int] $Cycles = 1,
    [int] $IntervalMilliseconds = 6000,
    [int] $ExpectedRows = 1,
    [int] $ExpectedSnapshots = 3
)

$ErrorActionPreference = 'Stop'
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port must be between 1 and 65535' }
if ($Cycles -lt 1 -or $IntervalMilliseconds -lt 1 -or $ExpectedRows -lt 1 -or $ExpectedSnapshots -lt 1) {
    throw 'Cycles, IntervalMilliseconds, ExpectedRows and ExpectedSnapshots must be positive'
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port is already in use"
}

function Start-TrialProcess([string] $Executable, [string[]] $Arguments) {
    if (-not (Test-Path -LiteralPath $Executable)) { throw "Missing executable: $Executable" }
    $info = [System.Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $Executable).Path)
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { [void] $info.ArgumentList.Add($argument) }
    $process = [System.Diagnostics.Process]::Start($info)
    if ($null -eq $process) { throw "Could not launch $Executable" }
    return $process
}

$hostExe = Join-Path $PSScriptRoot 'out/host-recorded.exe'
$endpoint = "http://127.0.0.1:$Port/telemetry/overlay-v2/projection"
$hostProcess = $null
$clients = @()
try {
    $hostProcess = Start-TrialProcess $hostExe @('-recorded', '-recorded-scene', $Scene, '-fixture-root', (Join-Path $PSScriptRoot '../../testdata'), '-port', "$Port", '-recorded-cycles', "$Cycles", '-recorded-interval', "${IntervalMilliseconds}ms")
    $ready = $false
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        if ($hostProcess.HasExited) { throw "Recorded host exited with code $($hostProcess.ExitCode)" }
        if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
            $ready = $true
            break
        }
        Start-Sleep -Milliseconds 100
    }
    if (-not $ready) { throw 'Recorded host did not open its loopback port' }

    $variants = @(
        [pscustomobject]@{
            Name = 'Qt'
            Exe = Join-Path $PSScriptRoot 'out/package-qt-trimmed/vantare-native-go-qt.exe'
            Args = @('--endpoint', $endpoint, '--mode', $Mode, '--expect-rows', "$ExpectedRows", '--expect-snapshots', "$ExpectedSnapshots")
        }
        [pscustomobject]@{
            Name = 'Slint'
            Exe = Join-Path $PSScriptRoot 'slint/target/release/vantare-native-go-slint.exe'
            Args = @('--endpoint', $endpoint, '--mode', $Mode, '--expect-rows', "$ExpectedRows", '--expect-snapshots', "$ExpectedSnapshots")
        }
        [pscustomobject]@{
            Name = 'Wails'
            Exe = Join-Path $PSScriptRoot 'out/wails/vantare-native-go-wails.exe'
            Args = @('-endpoint', $endpoint, '-mode', $Mode, '-expect-rows', "$ExpectedRows", '-expect-snapshots', "$ExpectedSnapshots")
        }
    )
    foreach ($variant in $variants) {
        $clients += [pscustomobject]@{
            Name = $variant.Name
            Process = Start-TrialProcess $variant.Exe $variant.Args
        }
    }

    $result = @()
    foreach ($client in $clients) {
        if (-not $client.Process.WaitForExit(20000)) {
            throw "$($client.Name) did not receive the recorded updates within 20 seconds"
        }
        $stdout = $client.Process.StandardOutput.ReadToEnd()
        $stderr = $client.Process.StandardError.ReadToEnd()
        $result += [pscustomobject]@{
            Mode = $Mode
            Scene = $Scene
            Candidate = $client.Name
            ExitCode = $client.Process.ExitCode
            ExpectedRows = $ExpectedRows
            ExpectedSnapshots = $ExpectedSnapshots
            Error = if ($client.Process.ExitCode -eq 0) { '' } else { ($stdout + $stderr).Trim() }
        }
    }
    $result | ConvertTo-Json -Compress
    if (@($result | Where-Object { $_.ExitCode -ne 0 }).Count -gt 0) { exit 1 }
} finally {
    foreach ($client in $clients) {
        if (-not $client.Process.HasExited) {
            $client.Process.Kill($true)
            $client.Process.WaitForExit()
        }
        $client.Process.Dispose()
    }
    if ($null -ne $hostProcess) {
        if (-not $hostProcess.HasExited) {
            $hostProcess.Kill($true)
            $hostProcess.WaitForExit()
        }
        $hostProcess.Dispose()
    }
}
