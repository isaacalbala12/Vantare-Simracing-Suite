param([int] $Port = 54890)

$ErrorActionPreference = 'Stop'
$fixture = (Resolve-Path (Join-Path $PSScriptRoot '../../testdata')).Path
$hostExe = (Resolve-Path (Join-Path $PSScriptRoot 'out/host-recorded.exe')).Path
$info = [Diagnostics.ProcessStartInfo]::new($hostExe)
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
foreach ($argument in @('-recorded', '-recorded-scene', 'standings-44', '-fixture-root', $fixture, '-port', "$Port", '-recorded-cycles', '1000', '-recorded-interval', '100ms')) {
    [void] $info.ArgumentList.Add($argument)
}
$hostProcess = [Diagnostics.Process]::Start($info)
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 100; $attempt++) {
        if ($hostProcess.HasExited) { throw 'Recorded Go host exited' }
        if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
        Start-Sleep -Milliseconds 100
    }
    if (-not $ready) { throw 'Recorded Go host did not listen' }
    $endpoint = "http://127.0.0.1:$Port/telemetry/overlay-v2/projection"
    foreach ($candidate in @(
        @{Name = 'qt'; Exe = 'out/package-qt-trimmed/vantare-native-go-qt.exe'},
        @{Name = 'gpui'; Exe = 'gpui/target/release/vantare-native-go-gpui.exe'}
    )) {
        $exe = (Resolve-Path (Join-Path $PSScriptRoot $candidate.Exe)).Path
        & $exe --endpoint $endpoint --mode efficiency --expect-rows 44 --expect-snapshots 10
        if ($LASTEXITCODE -ne 0) { throw "$($candidate.Name) failed to receive 44 rows and ten snapshots: exit $LASTEXITCODE" }
        Write-Output "$($candidate.Name): 44 Go rows and ten snapshots OK"
    }
} finally {
    if (-not $hostProcess.HasExited) { $hostProcess.Kill($true); $hostProcess.WaitForExit() }
    $hostProcess.Dispose()
}
