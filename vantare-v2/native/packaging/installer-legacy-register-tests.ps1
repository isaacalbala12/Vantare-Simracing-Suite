#requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$LegacyDirectory,
    [Parameter(Mandatory)][string]$ModernDirectory,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [ValidateSet('RollbackReinstall','LegacyUninstallReinstall')][string]$Recovery='RollbackReinstall',
    [switch]$ExpectGpuiAfterLegacyRegister
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'beta.ps1')
$evidence=Assert-NativePath $EvidenceDirectory
if(-not $evidence.StartsWith([IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa/'),[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $evidence)){throw 'Use fresh isolated evidence.'}
$key='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBetaQA1492'
$menu=Join-Path ([Environment]::GetFolderPath('Programs')) 'Vantare QA1492'
foreach($path in @($key,$menu,(Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Vantare QA1492.lnk'))){if(Test-Path -LiteralPath $path){throw 'Preserve existing QA identity.'}}
[IO.Directory]::CreateDirectory($evidence)|Out-Null
$root=Join-Path $evidence 'installed'
function Setup-LegacyTest([string]$Directory){
    $p=Start-Process -FilePath (Join-Path $Directory 'VantareSetup.exe') -ArgumentList ('/S /D='+$root) -WindowStyle Hidden -PassThru
    try{if(-not $p.WaitForExit(180000) -or $p.ExitCode){throw ('Setup failed at {0}, code {1}' -f $Directory,$p.ExitCode)}}finally{$p.Dispose()}
}
try {
    Setup-LegacyTest $LegacyDirectory
    $first=Read-NativeState $root
    $oldScript=Join-Path $root ('generations/'+$first.active.generation+'/candidate.ps1')
    if([IO.File]::ReadAllText($oldScript).Contains('Read-NativeInstallerUi')){throw 'Baseline already contains PR #1600; not a legacy regression'}
    $data=Join-Path $root ('generations/'+$first.active.generation+'/data')
    [IO.File]::WriteAllText((Join-Path $data 'profile.json'),'TEST ONLY legacy data')
    $dataHash=Get-NativeDataIndex $data
    Setup-LegacyTest $ModernDirectory
    $ui=Read-NativeInstallerUi $root;$ui.desktop=$true
    Write-BetaJson (Join-Path $root 'installer-ui.json') $ui
    Sync-NativeRegistration $root (Get-ItemProperty -LiteralPath $key).DisplayVersion
    $state=Read-NativeState $root
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $root ('generations/'+$state.active.generation+'/bin/vantare-hub.exe')
    $info.Arguments='--invalid-beta-start';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardError=$true
    $p=[Diagnostics.Process]::Start($info)
    try{$stderr=$p.StandardError.ReadToEndAsync();if(Confirm-BetaBoot $root $p 15){throw 'Failure did not roll back'};[IO.File]::WriteAllText((Join-Path $evidence 'failed-boot.log'),$stderr.GetAwaiter().GetResult())}finally{$p.Dispose()}
    if((Read-NativeState $root).active.generation -cne $first.active.generation){throw 'Did not restore real legacy generation'}
    if((Get-NativeDataIndex $data) -cne $dataHash){throw 'Rollback changed data'}
    # Execute exactly the old Register that the old Hub calls before hub-ready.
    # No runtime/Hub live instance or native-beta pipe is started on Isaac's SID.
    & powershell -NoProfile -ExecutionPolicy Bypass -File $oldScript -Operation Register -Root $root > (Join-Path $evidence 'legacy-register.log')
    if($LASTEXITCODE){throw 'Legacy Register failed before reproducing the finding'}
    $registration=Get-ItemProperty -LiteralPath $key
    [IO.File]::WriteAllText((Join-Path $evidence 'observed-registration.json'),($registration|Select-Object UninstallString,DisplayVersion,InstallLocation|ConvertTo-Json))
    if($ExpectGpuiAfterLegacyRegister -and -not $registration.UninstallString.Contains('Uninstall.exe')){throw 'Legacy Register replaced GPUI UninstallString with PowerShell after rollback'}
    if(-not $registration.UninstallString.Contains('uninstall-vantare.ps1')){throw 'Known legacy writer scenario was not reproduced'}
    Write-Output 'PASS known limitation reproduced: actual legacy Register restores PowerShell entry'
    if($Recovery -ceq 'LegacyUninstallReinstall'){
        # Follow exactly the PowerShell target from the old Windows entry.
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'uninstall-vantare.ps1') -Operation UninstallInstalled -Root $root > (Join-Path $evidence 'legacy-uninstall.log')
        if($LASTEXITCODE){throw 'Legacy uninstall failed'}
        if((Test-Path -LiteralPath $key) -or (Test-Path -LiteralPath (Join-Path $root 'Uninstall.exe'))){throw 'Legacy uninstall did not remove its registered components'}
        foreach($name in @('installer-ui.json','installer-notices.txt')){if(-not (Test-Path -LiteralPath (Join-Path $root $name))){throw 'Expected orphaned installer metadata was not reproduced'}}
        if((Get-NativeDataIndex $data) -cne $dataHash){throw 'Legacy uninstall changed preserved data'}
        Write-Output 'PASS old Windows entry uninstalls, retains orphaned metadata and exact data'
    }
    Setup-LegacyTest $ModernDirectory
    $restored=Read-NativeInstallerUi $root
    $state=Read-NativeState $root
    $active=Join-Path $root ('generations/'+$state.active.generation)
    $manifest=Read-NativeManifest $active 'beta'
    # The real B Register runs before the Hub publishes hub-ready; no live pipe.
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $active 'candidate.ps1') -Operation Register -Root $root > (Join-Path $evidence 'modern-register.log')
    if($LASTEXITCODE){throw 'Modern generation could not register after recovery'}
    $readyInfo=[Diagnostics.ProcessStartInfo]::new();$readyInfo.FileName=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $readyInfo.Arguments='-NoProfile -Command "Start-Sleep -Seconds 30"';$readyInfo.UseShellExecute=$false;$readyInfo.CreateNoWindow=$true
    $readyProcess=[Diagnostics.Process]::Start($readyInfo)
    try{
        [IO.File]::WriteAllText((Join-Path $root 'hub-ready'),$readyProcess.Id.ToString())
        if(-not (Confirm-BetaBoot $root $readyProcess 3)){throw 'B readiness protocol did not confirm recovery'}
    }finally{if(-not $readyProcess.HasExited){$readyProcess.Kill();$readyProcess.WaitForExit()};$readyProcess.Dispose()}
    $registration=Get-ItemProperty -LiteralPath $key
    if($registration.UninstallString -cne ('"'+(Join-Path $root 'Uninstall.exe')+'" /D="'+$root+'"') -or $registration.DisplayVersion -cne $manifest.version){throw 'Modern setup did not restore coherent GPUI registration'}
    if($restored.sha256 -cne (Get-NativeHash (Join-Path $ModernDirectory 'Uninstall.exe')) -or -not $restored.desktop -or $restored.autostart){throw 'Uninstaller or saved preferences were not restored'}
    $shell=New-Object -ComObject WScript.Shell
    $uninstallLink=$shell.CreateShortcut((Join-Path $menu 'Desinstalar.lnk'))
    $mainLink=$shell.CreateShortcut((Join-Path $menu 'Vantare Simracing Suite.lnk'))
    $desktop=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Vantare QA1492.lnk'
    if($uninstallLink.TargetPath -cne (Join-Path $root 'Uninstall.exe') -or -not (Test-NativeShortcutOwned $mainLink $root) -or -not (Test-NativeShortcutOwned ($shell.CreateShortcut($desktop)) $root)){throw 'Modern setup did not restore own shortcuts'}
    if((Get-NativeDataIndex (Join-Path $active 'data')) -cne $dataHash -or (Get-NativeDataIndex $data) -cne $dataHash){throw 'Recovery changed old or restored data'}
    foreach($name in @('candidate.ps1','beta.ps1','installer-notices.txt')){if(-not (Test-Path -LiteralPath (Join-Path $root $name))){throw 'Modern setup left orphaned bootstrap components'}}
    Write-Output "PASS ${Recovery}: B setup and actual B Register restore GPUI, shortcuts, preferences and exact data"
    Write-Output 'Readiness used an owned idle process fixture; successful live Hub startup remains separate SID/VM QA.'
}finally{
    if(Test-Path -LiteralPath $key){
        if(Test-Path -LiteralPath (Join-Path $root 'state.json')){Uninstall-Beta $root|Out-Null}
        Uninstall-NativeRegistration $root $true 'VantareNativeBetaQA1492' 'Vantare QA1492'
    }
}
