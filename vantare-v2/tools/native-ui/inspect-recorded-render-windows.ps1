param(
    [ValidateSet('qt', 'slint', 'wails')] [string] $Candidate,
    [int] $Port = 54682
)

$ErrorActionPreference = 'Stop'
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port must be between 1 and 65535' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is already in use" }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Start-Trial([string] $Executable, [string[]] $Arguments) {
    if (-not (Test-Path -LiteralPath $Executable)) { throw "Missing executable: $Executable" }
    $info = [Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $Executable).Path)
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    foreach ($argument in $Arguments) { [void] $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($info)
    if (-not $process) { throw "Cannot start $Executable" }
    return $process
}

$endpoint = "http://127.0.0.1:$Port/telemetry/overlay-v2/projection"
$exe = switch ($Candidate) {
    qt { Join-Path $PSScriptRoot 'out/package-qt-trimmed/vantare-native-go-qt.exe' }
    slint { Join-Path $PSScriptRoot 'slint/target/release/vantare-native-go-slint.exe' }
    wails { Join-Path $PSScriptRoot 'out/wails/vantare-native-go-wails.exe' }
}
$argsList = if ($Candidate -eq 'wails') { @('-endpoint', $endpoint, '-mode', 'control') } else { @('--endpoint', $endpoint, '--mode', 'control') }
$interval = if ($Candidate -eq 'wails') { '30s' } else { '18s' }
$phases = if ($Candidate -eq 'wails') {
    @(@{ Name = 'pit'; AtMs = 43000; Gear = '0' }, @{ Name = 'outlap'; AtMs = 72000; Gear = '1' })
} else {
    @(@{ Name = 'pit'; AtMs = 23000; Gear = '0' }, @{ Name = 'outlap'; AtMs = 41000; Gear = '1' })
}
$hostProcess = $null
$client = $null
try {
    # The longer interval gives the WebView reference time to expose its tree.
    # Only replay timing changes; all three LMU frame bytes remain SHA-pinned.
    $hostProcess = Start-Trial (Join-Path $PSScriptRoot 'out/host-recorded.exe') @('-recorded', '-recorded-interval', $interval, '-fixture-root', (Join-Path $PSScriptRoot '../../testdata'), '-port', "$Port")
    $ready = $false
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        if ($hostProcess.HasExited) { throw "Recorded host exited: $($hostProcess.ExitCode)" }
        if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
        Start-Sleep -Milliseconds 100
    }
    if (-not $ready) { throw 'Recorded host did not listen' }
    $client = Start-Trial $exe $argsList
    $watch = [Diagnostics.Stopwatch]::StartNew()
    foreach ($phase in $phases) {
        while ($watch.ElapsedMilliseconds -lt $phase.AtMs) { Start-Sleep -Milliseconds 50 }
        $client.Refresh()
        if ($client.HasExited) { throw "$Candidate client exited: $($client.ExitCode)" }
        if ($client.MainWindowHandle -eq [IntPtr]::Zero) { throw "$Candidate has no main window" }
        $deadline = $phase.AtMs + 12000
        do {
            $window = [Windows.Automation.AutomationElement]::FromHandle($client.MainWindowHandle)
            $items = $window.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
            $names = @($items | ForEach-Object { $_.Current.Name } | Where-Object { $_ })
            $motorIndex = [Array]::IndexOf($names, 'MOTOR · MARCHA')
            if ($motorIndex -ge 0) { break }
            Start-Sleep -Milliseconds 250
        } while ($watch.ElapsedMilliseconds -lt $deadline)
        if ($motorIndex -lt 0) { throw "$Candidate $($phase.Name): motor card absent from UI Automation tree; names=$($names -join '|')" }
        $tail = @($names | Select-Object -Skip ($motorIndex + 1) -First 6)
        $motor = if ($Candidate -eq 'wails') {
            if ($tail.Count -lt 3) { throw "$Candidate $($phase.Name): incomplete motor card" }
            "$($tail[0])$($tail[1])$($tail[2])"
        } else { $tail[0] }
        if ($motor -notmatch "^0 rpm\s*·\s*$($phase.Gear)$") {
            throw "$Candidate $($phase.Name): rendered motor '$motor', expected gear $($phase.Gear)"
        }
        [pscustomobject]@{ Candidate = $Candidate; Phase = $phase.Name; Gear = $phase.Gear; RenderedMotor = $motor; ElapsedMs = $watch.ElapsedMilliseconds }
    }
} finally {
    foreach ($process in @($client, $hostProcess)) {
        if ($null -ne $process) {
            if (-not $process.HasExited) { $process.Kill($true); $process.WaitForExit() }
            $process.Dispose()
        }
    }
}
