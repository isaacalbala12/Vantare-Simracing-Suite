param([int] $Port = 54689)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port must be between 1 and 65535' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is already in use" }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
function StartTrial([string] $Exe, [string[]] $Arguments) {
    $info = [Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $Exe).Path)
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    foreach ($argument in $Arguments) { [void] $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($info)
    if (-not $process) { throw "Could not start $Exe" }
    return $process
}
function Names([Diagnostics.Process] $Process) {
    $Process.Refresh()
    if ($Process.HasExited -or $Process.MainWindowHandle -eq [IntPtr]::Zero) { return @() }
    $root = [Windows.Automation.AutomationElement]::FromHandle($Process.MainWindowHandle)
    $items = $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
    return @($items | ForEach-Object { $_.Current.Name } | Where-Object { $_ })
}
$rootDir = (Resolve-Path $PSScriptRoot).Path
$client = $null
$hostProcess = $null
try {
    $endpoint = "http://127.0.0.1:$Port/telemetry/overlay-v2/projection"
    $client = StartTrial (Join-Path $rootDir 'out/wails/vantare-native-go-wails.exe') @('-endpoint', $endpoint, '-mode', 'control', '-auto-close', '130s')
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $before = @()
    while ($watch.ElapsedMilliseconds -lt 45000) {
        if ($client.HasExited) { throw "Wails exited before host start: $($client.ExitCode)" }
        $before = @(Names $client)
        if (($before -contains 'RECONNECTING') -and ($before -contains 'STANDINGS · 0 coches')) { break }
        Start-Sleep -Milliseconds 250
    }
    if (($before -notcontains 'RECONNECTING') -or ($before -notcontains 'STANDINGS · 0 coches')) {
        throw "Wails did not expose zero rows and reconnecting state before host: $($before -join '|')"
    }
    $atStart = $watch.ElapsedMilliseconds
    $hostProcess = StartTrial (Join-Path $rootDir 'out/host-recorded.exe') @('-fixture', (Join-Path $rootDir '../../testdata/lmu-fixture.bin'), '-port', "$Port")
    $after = @()
    while ($watch.ElapsedMilliseconds -lt ($atStart + 30000)) {
        if ($client.HasExited) { throw "Wails exited before rendering rows: $($client.ExitCode)" }
        if ($hostProcess.HasExited) { throw "Go host exited: $($hostProcess.ExitCode)" }
        $after = @(Names $client)
        if ($after -contains 'STANDINGS · 44 coches') { break }
        Start-Sleep -Milliseconds 250
    }
    if ($after -notcontains 'STANDINGS · 44 coches') { throw 'Wails did not reconnect and render 44 rows after host start' }
    $initialReconnectMs = $watch.ElapsedMilliseconds - $atStart
    $hostProcess.Kill($true)
    $hostProcess.WaitForExit()
    $hostProcess.Dispose()
    $hostProcess = $null
    $atStop = $watch.ElapsedMilliseconds
    $duringStop = @()
    while ($watch.ElapsedMilliseconds -lt ($atStop + 15000)) {
        if ($client.HasExited) { throw "Wails exited after host stop: $($client.ExitCode)" }
        $duringStop = @(Names $client)
        if ($duringStop -contains 'RECONNECTING') { break }
        Start-Sleep -Milliseconds 250
    }
    if ($duringStop -notcontains 'RECONNECTING') { throw 'Wails did not show reconnecting after host stop' }
    $atRestart = $watch.ElapsedMilliseconds
    $hostProcess = StartTrial (Join-Path $rootDir 'out/host-recorded.exe') @('-fixture', (Join-Path $rootDir '../../testdata/lmu-fixture.bin'), '-port', "$Port")
    $afterRestart = @()
    while ($watch.ElapsedMilliseconds -lt ($atRestart + 30000)) {
        if ($client.HasExited) { throw "Wails exited before host restart: $($client.ExitCode)" }
        if ($hostProcess.HasExited) { throw "Go host exited after restart: $($hostProcess.ExitCode)" }
        $afterRestart = @(Names $client)
        if (($afterRestart -contains 'LIVE') -and ($afterRestart -contains 'STANDINGS · 44 coches')) { break }
        Start-Sleep -Milliseconds 250
    }
    if (($afterRestart -notcontains 'LIVE') -or ($afterRestart -notcontains 'STANDINGS · 44 coches')) {
        throw 'Wails did not recover its live 44-row view after host restart'
    }
    [pscustomobject]@{
        Candidate = 'Wails'
        BeforeHost = 'RECONNECTING; 0 rows'
        AfterHost = '44 rows'
        AfterStop = 'RECONNECTING'
        AfterRestart = '44 rows'
        InitialConnectMs = $initialReconnectMs
        RestartMs = $watch.ElapsedMilliseconds - $atRestart
    }
} finally {
    foreach ($process in @($client,$hostProcess)) {
        if ($null -ne $process) {
            if (-not $process.HasExited) { $process.Kill($true); $process.WaitForExit() }
            $process.Dispose()
        }
    }
}
