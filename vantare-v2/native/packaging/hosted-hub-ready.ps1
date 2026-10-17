#requires -Version 7.0
param([Parameter(Mandatory)][string]$Setup,[Parameter(Mandatory)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
# This runner is intentionally unavailable on an operator's workstation/server.
if($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or $env:RUNNER_OS -cne 'Windows'){throw 'Requires a disposable GitHub-hosted Windows runner'}
$qaSetup=[IO.Path]::GetFullPath($Setup);$qaEvidence=[IO.Path]::GetFullPath($EvidenceDirectory)
$prefix=[IO.Path]::GetFullPath($env:RUNNER_TEMP)+[IO.Path]::DirectorySeparatorChar
if(-not $qaSetup.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or -not $qaEvidence.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'QA paths must belong to runner temp'}
$qaRoot=Join-Path $env:LOCALAPPDATA 'Programs/Vantare'
if((Test-Path -LiteralPath $qaRoot) -or (Test-Path -LiteralPath 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBeta')){throw 'Runner already contains a Vantare installation'}
$null=New-Item -ItemType Directory -Path $qaEvidence -Force
& (Join-Path $PSScriptRoot 'windows-software-adapters.ps1') -OutputFile (Join-Path $qaEvidence 'adapters-before-hub.json') -RequireSoftwareOnly
$source=(& git rev-parse HEAD).Trim()
[ordered]@{source=$source;setup_sha256=(Get-FileHash -LiteralPath $qaSetup -Algorithm SHA256).Hash;version='0.0.979';configuration='local-unconfigured';login_tested=$false;payments_tested=$false}|ConvertTo-Json|Set-Content (Join-Path $qaEvidence 'provenance.json')
$installed=$false;$hubProcess=$null
function Run-OwnedInstaller([string]$Exe,[string]$LogName){
    $p=Start-Process -FilePath $Exe -ArgumentList '/S' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $qaEvidence "$LogName.stdout.log") -RedirectStandardError (Join-Path $qaEvidence "$LogName.stderr.log")
    try{
        if(-not $p.WaitForExit(600000)){$p.Kill();$p.WaitForExit();throw "$LogName timeout"}
        $p.ExitCode|Set-Content (Join-Path $qaEvidence "$LogName.exit.txt")
        if($p.ExitCode -ne 0){throw "$LogName failed: $($p.ExitCode)"}
    }finally{$p.Dispose()}
}
try{
    Run-OwnedInstaller $qaSetup 'setup'
    $installed=$true
    . (Join-Path $PSScriptRoot 'candidate.ps1')
    $state=Read-NativeState $qaRoot
    $generation=Join-Path $qaRoot ('generations/'+$state.active.generation)
    $manifest=Read-NativeManifest $generation 'beta'
    if($manifest.build_profile -cne 'Release'){throw 'Requires a Release package'}
    $null=Get-Item -LiteralPath (Join-Path $generation 'bin/fixtures/standings-design-system.sequence.json')
    $ready=Join-Path $qaRoot 'hub-ready'
    if(Test-Path -LiteralPath $ready){throw 'Unexpected readiness marker before launch'}
    $cwd=Join-Path $qaEvidence 'empty-cwd';$null=New-Item -ItemType Directory -Path $cwd
    $psi=[Diagnostics.ProcessStartInfo]::new()
    $psi.FileName=Join-Path $generation 'bin/vantare-hub.exe'
    $psi.ArgumentList.Add('--control-stdin');$psi.ArgumentList.Add('--data-dir');$psi.ArgumentList.Add((Join-Path $qaRoot 'data'))
    $psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.WorkingDirectory=$cwd
    $psi.RedirectStandardInput=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
    $psi.StandardOutputEncoding=[Text.Encoding]::UTF8;$psi.StandardErrorEncoding=[Text.Encoding]::UTF8
    $psi.Environment['VANTARE_BETA_ROOT']=$qaRoot
    $started=[DateTime]::UtcNow;$hubProcess=[Diagnostics.Process]::Start($psi)
    $stdout=$hubProcess.StandardOutput.ReadToEndAsync();$stderr=$hubProcess.StandardError.ReadToEndAsync()
    $observed=$false;$window=0;$forced=$false
    try{
        $deadline=[DateTime]::UtcNow.AddSeconds(90)
        do{
            if(Test-Path -LiteralPath $ready){
                $marker=Get-Item -LiteralPath $ready
                if($marker.LastWriteTimeUtc -ge $started -and [IO.File]::ReadAllText($ready).Trim() -ceq [string]$hubProcess.Id){
                    $hubProcess.Refresh();$window=$hubProcess.MainWindowHandle.ToInt64()
                    if($window -ne 0){$observed=$true;break}
                }
            }
            if($hubProcess.HasExited){break}
            Start-Sleep -Milliseconds 100
        }while([DateTime]::UtcNow -lt $deadline)
    }finally{
        $hubProcess.StandardInput.Close()
        if(-not $hubProcess.WaitForExit(20000)){$forced=$true;$hubProcess.Kill();$hubProcess.WaitForExit()}
        [IO.File]::WriteAllText((Join-Path $qaEvidence 'hub.stdout.log'),$stdout.Result)
        [IO.File]::WriteAllText((Join-Path $qaEvidence 'hub.stderr.log'),$stderr.Result)
        $code=$hubProcess.ExitCode
        [ordered]@{pid=$hubProcess.Id;hub_ready=$observed;window=$window;exit=$code;exit_hex=('{0:X8}' -f $code);forced=$forced}|ConvertTo-Json|Set-Content (Join-Path $qaEvidence 'hub-result.json')
    }
    if(-not $observed -or $forced -or $code -ne 0){throw 'Real installed Hub readiness failed; preserve this result for VANTA-105 physical QA'}
}finally{
    if($null -ne $hubProcess){$hubProcess.Dispose()}
    if($installed){Run-OwnedInstaller (Join-Path $qaRoot 'Uninstall.exe') 'uninstall'}
}
