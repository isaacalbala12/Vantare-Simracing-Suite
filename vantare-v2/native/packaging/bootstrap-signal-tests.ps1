#requires -Version 5.1
param([Parameter(Mandatory)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'beta.ps1') -Library -Root $PSScriptRoot
$evidence = Assert-NativePath $EvidenceDirectory
[IO.Directory]::CreateDirectory($evidence) | Out-Null
function Assert-Beta([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERT: $Message" }
    Write-Output "PASS $Message"
}
function Reject-Beta([scriptblock]$Action, [string]$Message) {
    $failed = $false
    try { $null = & $Action } catch { $failed = $true }
    Assert-Beta $failed $Message
}
. (Join-Path $PSScriptRoot 'bootstrap-tests.ps1')
$root = Join-Path $evidence 'signal-root'
Remove-Item Env:VANTARE_STARTUP_WINDOW, Env:VANTARE_STARTUP_PID -ErrorAction SilentlyContinue
Complete-BetaBootstrap $root
$bootstrap = Start-TestBootstrap $root $false
try {
    Complete-BetaBootstrap $root
    Assert-Beta $bootstrap.Process.HasExited 'signal waits for actual process exit'
    $handles = Open-NativeBinaryGuard $root
    foreach ($handle in $handles.Values) { $handle.Dispose() }
    Assert-Beta $true 'exclusive image guard obtained after exit'
} finally { Stop-TestBootstrap $bootstrap }

# Rollback can outwait a lost message, using the actual process handle, not sleeps.
foreach($lostWindow in @($false,$true)){
    $bootstrap=Start-TestBootstrap $root $true
    if($lostWindow){$env:VANTARE_STARTUP_WINDOW='1'}
    $workerScript=Join-Path $evidence ('natural-'+$lostWindow+'.ps1')
    $product=(Join-Path $PSScriptRoot 'beta.ps1').Replace("'","''")
    $directory=$root.Replace("'","''")
    [IO.File]::WriteAllText($workerScript,(". '$product' -Library -Root '$directory'`n"+"Complete-BetaBootstrap '$directory' 50 -AllowNaturalExit -NaturalExitMilliseconds 10000`n"))
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$workerScript+'"'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardError=$true
    $worker=[Diagnostics.Process]::Start($info)
    try {
        # Complete emits stderr only after its short signal wait expires.
        $waiting=$worker.StandardError.ReadLineAsync()
        Assert-Beta ($waiting.Wait(20000) -and $null -ne $waiting.Result -and -not $worker.HasExited) 'rollback reached the natural-exit wait'
        Assert-Beta (-not $bootstrap.Process.HasExited) 'natural-exit wait never kills the bootstrap'
        $bootstrap.Process.StandardInput.Close()
        Assert-Beta ($worker.WaitForExit(15000) -and $worker.ExitCode -eq 0) 'rollback wait accepts actual exit after ignored/lost signal'
        $handles=Open-NativeBinaryGuard $root
        foreach($handle in $handles.Values){$handle.Dispose()}
        Assert-Beta $true 'exclusive guard available after natural exit'
    } finally {
        Stop-TestBootstrap $bootstrap
        $null=$worker.WaitForExit(15000);$worker.Dispose()
    }
}

# Successful registration remains valid if a voluntary close wins the next poll.
foreach($exitCode in @(0,7)){
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $env:WINDIR 'System32/cmd.exe'
    $info.Arguments='/D /C exit /B '+$exitCode
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $process=[Diagnostics.Process]::Start($info)
    try {
        $null=$process.WaitForExit(10000)
        [IO.File]::WriteAllText((Join-Path $root 'hub-ready'),$process.Id.ToString())
        Assert-Beta ((Test-BetaReady $root $process) -eq ($exitCode -eq 0)) 'ready marker requires either a live Hub or successful exit'
        if($exitCode -eq 0){Assert-Beta (Confirm-BetaBoot $root $process 0) 'voluntary close after registration does not cause failed boot'}
        Remove-Item -LiteralPath (Join-Path $root 'hub-ready')
        Assert-Beta (-not (Test-BetaReady $root $process)) 'exit zero alone never confirms an unregistered Hub'
    } finally {$process.Dispose()}
}
$bootstrap = Start-TestBootstrap $root $true
try {
    $timedOut = $false
    try { Complete-BetaBootstrap $root 100 } catch [TimeoutException] { $timedOut = $true }
    Assert-Beta $timedOut 'bounded handle wait reports typed timeout'
    Assert-Beta (-not $bootstrap.Process.HasExited) 'timeout never forces process exit'
    Reject-Beta {
        $handles = Open-NativeBinaryGuard $root
        foreach ($handle in $handles.Values) { $handle.Dispose() }
    } 'image guard remains exclusive while bootstrap is alive'
} finally { Stop-TestBootstrap $bootstrap }
