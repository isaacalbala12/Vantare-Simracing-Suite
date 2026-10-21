#requires -Version 5.1
param([Parameter(Mandatory)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'beta.ps1')
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
