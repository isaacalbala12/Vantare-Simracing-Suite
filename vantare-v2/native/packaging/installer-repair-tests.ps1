#requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$VersionDirectory,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [ValidateSet('Missing','Corrupt')][string]$Damage='Missing',
    [switch]$ProbeOnly
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'beta.ps1') -Library -Root $PSScriptRoot
$evidence=Assert-NativePath $EvidenceDirectory
if(-not $evidence.StartsWith([IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa/'),[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $evidence)){throw 'Use fresh isolated evidence.'}
$key='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBetaQA1492'
$folder='Vantare QA1492'
$links=@((Join-Path ([Environment]::GetFolderPath('Programs')) $folder),(Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) ($folder+'.lnk')),(Join-Path ([Environment]::GetFolderPath('Startup')) ($folder+'.lnk')))
foreach($path in @($key)+$links){if(Test-Path -LiteralPath $path){throw 'An existing QA identity must be preserved.'}}
[IO.Directory]::CreateDirectory($evidence)|Out-Null
$root=Join-Path $evidence 'installed'
function Setup-Repair([int]$Expected=0){
    $p=Start-Process -FilePath (Join-Path $VersionDirectory 'VantareSetup.exe') -ArgumentList ('/S "/D='+$root+'"') -WindowStyle Hidden -PassThru
    try{if(-not $p.WaitForExit(180000) -or $p.ExitCode -ne $Expected){throw 'Setup exit code mismatch'}}finally{$p.Dispose()}
}
try {
    Setup-Repair
    $state=Read-NativeState $root
    $version=(Get-ItemProperty -LiteralPath $key).DisplayVersion
    $data=Join-Path $root ('generations/'+$state.active.generation+'/data')
    [IO.File]::WriteAllText((Join-Path $data 'profile.json'),'TEST ONLY: preserve these exact bytes')
    $index=Get-NativeDataIndex $data
    $ui=Read-NativeInstallerUi $root
    $ui.desktop=$true;Write-BetaJson (Join-Path $root 'installer-ui.json') $ui
    if($Damage -ceq 'Missing'){Remove-Item -LiteralPath (Join-Path $root 'Uninstall.exe')}
    else{[IO.File]::WriteAllBytes((Join-Path $root 'Uninstall.exe'),[byte[]](0,1,2,3))}
    $rejected=$false
    try{$null=Read-NativeInstallerUi $root}catch{$rejected=$true}
    if(-not $rejected){throw 'Installed uninstaller verification was weakened'}
    Write-Output "PASS ${Damage}: installed uninstaller remains strictly rejected"
    $request=Join-Path $evidence 'probe.json'
    Write-BetaJson $request @{operation='Probe';root=$root;qa=$true;qaIdentity='VantareNativeBetaQA1492';qaShortcutFolder='Vantare QA1492';qaLegacyShortcutFolder='Vantare Native Beta QA1492';qaPrefix='C:/tmp/ola2/1591-qa';uninstall=$false;silent=$true;version=$version;size=0}
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'installer-driver.ps1') -RequestFile $request > (Join-Path $evidence 'probe-result.json') 2>(Join-Path $evidence 'probe-error.log')
    if($LASTEXITCODE){throw "${Damage}: same-version Setup cannot probe repair of its own uninstaller"}
    $probe=Get-Content -LiteralPath (Join-Path $evidence 'probe-result.json') -Raw|ConvertFrom-Json
    if($probe.installed_version -cne $version -or -not $probe.desktop -or $probe.autostart){throw 'Probe lost version or saved preferences'}
    Write-Output "PASS ${Damage}: same-version repair is reachable, preferences preserved"
    if(-not $ProbeOnly){
        $before=Get-NativeHash (Join-Path $root 'state.json')
        $wrong=Join-Path $evidence 'wrong-version.json'
        $other=if($version -ceq '0.0.977'){'0.0.976'}else{'0.0.977'}
        Write-BetaJson $wrong @{operation='Install';root=$root;qa=$true;qaIdentity='VantareNativeBetaQA1492';qaShortcutFolder='Vantare QA1492';qaLegacyShortcutFolder='Vantare Native Beta QA1492';qaPrefix='C:/tmp/ola2/1591-qa';uninstall=$false;silent=$true;mode='repair';version=$other;size=0}
        $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
        $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'installer-driver.ps1')+'" -RequestFile "'+$wrong+'"'
        $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardError=$true;$info.RedirectStandardOutput=$true
        $p=[Diagnostics.Process]::Start($info)
        try{$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync();$p.WaitForExit();[IO.File]::WriteAllText((Join-Path $evidence 'wrong-version.log'),$out.GetAwaiter().GetResult()+$err.GetAwaiter().GetResult());if($p.ExitCode -ne 3){throw 'Different-version repair was accepted'}}finally{$p.Dispose()}
        if((Get-NativeHash (Join-Path $root 'state.json')) -cne $before -or (Get-NativeDataIndex $data) -cne $index){throw 'Rejected repair changed state/data'}
        Write-Output "PASS ${Damage}: different-version repair rejects without changing state/data"
        Setup-Repair
        $repaired=Read-NativeInstallerUi $root
        if($repaired.sha256 -cne $ui.sha256 -or -not $repaired.desktop -or $repaired.autostart -or (Get-NativeDataIndex (Join-Path $root ('generations/'+(Read-NativeState $root).active.generation+'/data'))) -cne $index){throw 'Repair did not restore exact uninstaller/preferences/data'}
        Write-Output "PASS ${Damage}: exact uninstaller hash, preferences and data restored"
    }
} finally {
    # Restore only the test uninstaller, then clean this test's registered shell entries.
    if(Test-Path -LiteralPath $key){
        Copy-Item -LiteralPath (Join-Path $VersionDirectory 'Uninstall.exe') -Destination (Join-Path $root 'Uninstall.exe') -Force
        if(Test-Path -LiteralPath (Join-Path $root 'state.json')){Uninstall-Beta $root|Out-Null}
        Uninstall-NativeRegistration $root
    }
}
