#requires -Version 5.1
param([Parameter(Mandatory)][string]$InstalledRoot,[Parameter(Mandatory)][string]$EvidenceDirectory,[Parameter(Mandatory)][string]$ExpectedSid)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'candidate.ps1')
# Never open GPUI on the interactive user's desktop. The external QA runner
# creates a standard disposable user and an unselected private desktop.
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class StartupDesktop {
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern IntPtr GetThreadDesktop(uint thread);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder name,uint length,out uint needed);
}
'@
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if($sid -cne $ExpectedSid -or $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Use the expected disposable standard user'}
$name=[Text.StringBuilder]::new(256);$needed=[uint32]0
if(-not [StartupDesktop]::GetUserObjectInformation([StartupDesktop]::GetThreadDesktop([StartupDesktop]::GetCurrentThreadId()),2,$name,512,[ref]$needed) -or $name.ToString() -cnotmatch '^VantareHubQA_[a-f0-9]{32}$'){throw 'Requires an unselected VantareHubQA private desktop'}
$evidence=Assert-NativePath $EvidenceDirectory;$root=Open-NativeRoot $InstalledRoot
if(-not $root.StartsWith($evidence+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Installation outside owned evidence root'}
$state=Read-NativeState $root
$generation=Join-Path $root ('generations/'+$state.active.generation)
$manifest=Read-NativeManifest $generation 'beta'
if($manifest.build_profile -cne 'Release'){throw 'Readiness regression requires the real Release package'}
$fixtures=Join-Path $generation 'bin/fixtures'
$initial=Join-Path $fixtures 'standings-design-system.sequence.json'
if(-not(Test-Path -LiteralPath $initial)){throw 'Closed package lacks the initial Workshop scene'}
$hub=Join-Path $generation 'bin/vantare-hub.exe';$ready=Join-Path $root 'hub-ready'
$cwd=Join-Path $evidence 'isolated-cwd'
[IO.Directory]::CreateDirectory($cwd)|Out-Null
if(@(Get-ChildItem -LiteralPath $cwd -Force).Count){throw 'The launch CWD must be empty'}
$events=[Collections.Generic.List[object]]::new()
function Probe-Hub([string]$Case,[bool]$ExpectedReady,[string]$ExpectedDiagnostic=''){
    if(Test-Path -LiteralPath $ready){Remove-Item -LiteralPath $ready}
    $psi=[Diagnostics.ProcessStartInfo]::new();$psi.FileName=$hub
    $psi.Arguments='--control-stdin --data-dir "'+(Join-Path $evidence 'hub-data')+'"'
    $psi.WorkingDirectory=$cwd;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
    $psi.RedirectStandardInput=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
    $psi.StandardOutputEncoding=[Text.Encoding]::UTF8;$psi.StandardErrorEncoding=[Text.Encoding]::UTF8
    $psi.EnvironmentVariables['VANTARE_BETA_ROOT']=$root
    $started=[DateTime]::UtcNow;$process=[Diagnostics.Process]::Start($psi)
    $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
    $observed=$false;$window=0;$forced=$false
    try {
        # Poll only for the real application handshake; no simulated marker.
        $deadline=[DateTime]::UtcNow.AddSeconds(60)
        do {
            if(Test-Path -LiteralPath $ready){
                $marker=Get-Item -LiteralPath $ready
                if($marker.LastWriteTimeUtc -ge $started -and [IO.File]::ReadAllText($ready).Trim() -ceq [string]$process.Id){
                    $observed=$true;$process.Refresh();$window=$process.MainWindowHandle.ToInt64()
                    if(-not $ExpectedReady -or $window -ne 0){break}
                }
            }
            if($process.HasExited){break}
            Start-Sleep -Milliseconds 100
        }while([DateTime]::UtcNow -lt $deadline)
    } finally {
        $process.StandardInput.Close() # Existing production control protocol: EOF.
        if(-not $process.WaitForExit(20000)){$forced=$true;$process.Kill();$process.WaitForExit()}
        [IO.File]::WriteAllText((Join-Path $evidence "$Case.stdout.log"),$stdout.Result)
        [IO.File]::WriteAllText((Join-Path $evidence "$Case.stderr.log"),$stderr.Result)
        $code=$process.ExitCode
        $events.Add([ordered]@{case=$Case;pid=$process.Id;hub_ready=$observed;window=$window;exit=$code;exit_hex=('{0:X8}' -f $code);forced=$forced;cwd=$cwd;desktop=$name.ToString();sid=$sid})
        $events|ConvertTo-Json -Depth 5|Set-Content (Join-Path $evidence 'hub-startup-results.json') -Encoding UTF8
        $process.Dispose()
    }
    if($forced -or $observed -ne $ExpectedReady -or ($ExpectedReady -and ($code -ne 0 -or $window -eq 0)) -or (-not $ExpectedReady -and $code -eq 0)){throw "Hub startup regression failed: $Case"}
    # A graphics failure must not satisfy a deliberately missing-resource case.
    # CLI exposes only exit1, so retain and check its concrete file diagnostic.
    if($ExpectedDiagnostic -and -not $stderr.Result.Contains($ExpectedDiagnostic)){throw "Unexpected failure cause: $Case"}
}
# Deliberately broken installed copies prove missing assets cannot be hidden
# by the checkout still existing on the build server. Restore exact bytes/paths.
$held=Join-Path $evidence 'initial-scene-held.json'
[IO.File]::Move($initial,$held)
try{Probe-Hub 'missing-initial-scene' $false 'standings-design-system.sequence.json'}finally{[IO.File]::Move($held,$initial)}
$held=Join-Path $evidence 'fixtures-held'
[IO.Directory]::Move($fixtures,$held)
try{Probe-Hub 'missing-fixture-directory' $false 'use --escena'}finally{[IO.Directory]::Move($held,$fixtures)}
$null=Read-NativeManifest $generation 'beta'
Probe-Hub 'complete-package' $true
"3 isolated Release Hub startup checks PASS; $evidence"
