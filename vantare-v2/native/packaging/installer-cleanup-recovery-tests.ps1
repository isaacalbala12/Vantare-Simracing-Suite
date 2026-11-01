#requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$VersionDirectory,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [ValidateSet('Handle','Interrupted')][string]$Boundary='Handle'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'beta.ps1') -Library -Root $PSScriptRoot
$evidence=Assert-NativePath $EvidenceDirectory
if(-not $evidence.StartsWith([IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa/'),[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $evidence)){throw 'Use fresh isolated evidence.'}
$key='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBetaQA1492'
$menu=Join-Path ([Environment]::GetFolderPath('Programs')) 'Vantare QA1492'
$desktop=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Vantare QA1492.lnk'
$startup=Join-Path ([Environment]::GetFolderPath('Startup')) 'Vantare QA1492.lnk'
foreach($path in @($key,$menu,$desktop,$startup)){if(Test-Path -LiteralPath $path){throw 'Preserve existing QA identity.'}}
[IO.Directory]::CreateDirectory($evidence)|Out-Null
$root=Join-Path $evidence 'installed'
$exe=Join-Path $root 'Uninstall.exe'
$marker=Join-Path $root 'installer-cleanup.json'
$helper=$null;$handle=$null
function Invoke-PublicSetup([string]$Label,[int]$Expected=0){
    $p=Start-Process -FilePath (Join-Path $VersionDirectory 'VantareSetup.exe') -ArgumentList ('/S /D='+$root) -WindowStyle Hidden -PassThru
    try{
        if(-not $p.WaitForExit(180000)){throw 'Retain owned Setup on timeout.'}
        [IO.File]::WriteAllText((Join-Path $evidence ($Label+'.exit')),$p.ExitCode.ToString())
        if($Expected -lt 0){if(-not $p.ExitCode){throw "Setup accepted unsafe state: $Label"}}
        elseif($p.ExitCode -ne $Expected){throw "Public Setup returned $($p.ExitCode), expected $Expected at $Label"}
    }finally{$p.Dispose()}
}
function Start-CleanupHost([string]$Driver,[string]$Request){
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$Driver+'" -RequestFile "'+$Request+'"'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    [Diagnostics.Process]::Start($info)
}
try {
    Invoke-PublicSetup 'initial'
    $state=Read-NativeState $root
    $data=Join-Path $root ('generations/'+$state.active.generation+'/data')
    [IO.Directory]::CreateDirectory((Join-Path $data 'hub'))|Out-Null
    [IO.File]::WriteAllBytes((Join-Path $data 'hub/profile.json'),[byte[]](0,1,13,10,255,42))
    [IO.File]::WriteAllText((Join-Path $data 'layout.json'),'TEST ONLY preserved layout')
    $index=Get-NativeDataIndex $data
    $requestFile=Join-Path $evidence 'uninstall.json'
    Write-BetaJson $requestFile @{operation='Uninstall';root=$root;qa=$true;qaIdentity='VantareNativeBetaQA1492';qaShortcutFolder='Vantare QA1492';qaLegacyShortcutFolder='Vantare Native Beta QA1492';qaPrefix='C:/tmp/ola2/1591-qa';uninstall=$true;silent=$true;version='0.0.978';size=0}
    $helper=Start-CleanupHost (Join-Path $PSScriptRoot 'installer-driver.ps1') $requestFile
    $out=$helper.StandardOutput.ReadToEndAsync();$err=$helper.StandardError.ReadToEndAsync()
    if(-not $helper.WaitForExit(60000) -or $helper.ExitCode){throw 'Deferred uninstall fixture failed'}
    [IO.File]::WriteAllText((Join-Path $evidence 'uninstall.log'),$out.GetAwaiter().GetResult()+$err.GetAwaiter().GetResult())
    $helper.Dispose();$helper=$null
    $retained=Join-Path $root 'retained-data.json';$retainedHash=Get-NativeHash $retained
    if((Test-Path -LiteralPath $key) -or (Test-Path -LiteralPath (Join-Path $root 'state.json')) -or -not (Test-Path -LiteralPath $exe)){throw 'Did not reach deferred cleanup'}
    $markerBytes=[IO.File]::ReadAllBytes($marker);$markerHash=Get-NativeHash $marker
    $cleanTemp=Join-Path $env:TEMP ('VantareSetup-'+$PID+'-'+[DateTime]::UtcNow.Ticks+'-0')
    [IO.Directory]::CreateDirectory($cleanTemp)|Out-Null
    foreach($name in @('candidate.ps1','beta.ps1','installer-driver.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $cleanTemp $name)}
    $driver=Join-Path $cleanTemp 'installer-driver.ps1'
    $cleanRequest=Join-Path $cleanTemp 'request.json'
    Write-BetaJson $cleanRequest @{operation='Cleanup';root=$root;qa=$true;qaIdentity='VantareNativeBetaQA1492';qaShortcutFolder='Vantare QA1492';qaLegacyShortcutFolder='Vantare Native Beta QA1492';qaPrefix='C:/tmp/ola2/1591-qa';uninstall=$true;silent=$true;version='0.0.978';size=0;processId=2147483647}
    $signal=Join-Path $cleanTemp 'at-boundary'
    if($Boundary -ceq 'Handle'){
        $handle=[IO.File]::Open($marker,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    }else{
        # A synchronization barrier ONLY in the private test copy lets us kill
        # the real host exactly after EXE deletion, before marker deletion.
        # No production failpoint, guessed sleep, or unrelated process kill.
        $text=[IO.File]::ReadAllText($driver).Replace("`r`n","`n")
        $anchor='            Remove-Item -LiteralPath $marker'+"`n"+'            $temporary='
        if(($text.Split([string[]]@($anchor),[StringSplitOptions]::None)).Length -ne 2){throw 'Cleanup boundary changed; review the fixture'}
        $pause='            [IO.File]::WriteAllText((Join-Path (Split-Path $RequestFile) ''at-boundary''), ''paused'')'+"`n"+'            [Console]::ReadLine() | Out-Null'+"`n"
        [IO.File]::WriteAllText($driver,$text.Replace($anchor,$pause+$anchor),[Text.UTF8Encoding]::new($true))
    }
    $helper=Start-CleanupHost $driver $cleanRequest
    $out=$helper.StandardOutput.ReadToEndAsync();$err=$helper.StandardError.ReadToEndAsync()
    if($Boundary -ceq 'Interrupted'){
        $deadline=[Diagnostics.Stopwatch]::StartNew()
        while(-not (Test-Path -LiteralPath $signal)){
            if($helper.HasExited -or $deadline.Elapsed.TotalSeconds -gt 60){throw 'Helper did not reach the synchronized boundary'}
            Start-Sleep -Milliseconds 20
        }
        $helper.Kill();$helper.WaitForExit()
    }elseif(-not $helper.WaitForExit(60000) -or $helper.ExitCode -ne 1){throw 'Marker handle did not fail Cleanup after deleting EXE'}
    [IO.File]::WriteAllText((Join-Path $evidence 'cleanup.log'),$out.GetAwaiter().GetResult()+$err.GetAwaiter().GetResult())
    $helper.Dispose();$helper=$null
    if($null -ne $handle){$handle.Dispose();$handle=$null}
    if((Test-Path -LiteralPath $exe) -or -not (Test-Path -LiteralPath $marker) -or (Get-NativeHash $marker) -cne $markerHash){throw 'Orphaned marker frontier not reproduced'}
    if((Get-NativeDataIndex $data) -cne $index -or (Get-NativeHash $retained) -cne $retainedHash){throw 'Cleanup frontier changed data'}
    Write-Output "PASS ${Boundary}: EXE absent, exact marker orphaned, exact retained data"
    # Unsafe lookalikes must not consume metadata or start a new generation.
    $invalid=@{schema=2;sha256=('0'*64)}
    Write-BetaJson $marker $invalid;$invalidHash=Get-NativeHash $marker
    Invoke-PublicSetup 'invalid-marker' -1
    if((Get-NativeHash $marker) -cne $invalidHash){throw 'Setup consumed invalid cleanup metadata'}
    [IO.File]::WriteAllBytes($marker,$markerBytes)
    Write-Output "PASS ${Boundary}: invalid marker is conserved and rejected"
    $owner=Join-Path $root '.vantare-native';$ownerBytes=[IO.File]::ReadAllBytes($owner)
    [IO.File]::WriteAllText($owner,'TEST ONLY unrecognized owner')
    Invoke-PublicSetup 'foreign-root' -1
    if((Get-NativeHash $marker) -cne $markerHash){throw 'Setup consumed marker from unrecognized root'}
    [IO.File]::WriteAllBytes($owner,$ownerBytes)
    Write-Output "PASS ${Boundary}: root ownership guard preserves marker"
    $identityFile=Join-Path $root 'registration-identity.txt'
    [IO.File]::WriteAllText($identityFile,'TESTForeignIdentity')
    Invoke-PublicSetup 'foreign-identity' -1
    if((Get-NativeHash $marker) -cne $markerHash -or [IO.File]::ReadAllText($identityFile) -cne 'TESTForeignIdentity'){throw 'Setup overwrote foreign identity or marker'}
    Remove-Item -LiteralPath $identityFile
    Write-Output "PASS ${Boundary}: foreign identity is conserved and rejected"
    Copy-Item -LiteralPath (Join-Path $VersionDirectory 'Uninstall.exe') -Destination $exe
    Invoke-PublicSetup 'pending-exe' 2
    if((Get-NativeHash $marker) -cne $markerHash -or (Get-NativeHash $exe) -cne (Get-NativeHash (Join-Path $VersionDirectory 'Uninstall.exe'))){throw 'Setup changed pending uninstaller'}
    Remove-Item -LiteralPath $exe
    Write-Output "PASS ${Boundary}: pending EXE cannot be reclaimed"
    New-Item -Path $key -Force|Out-Null
    Set-ItemProperty -LiteralPath $key -Name InstallLocation -Value $root
    Invoke-PublicSetup 'registered-root' 2
    if((Get-NativeHash $marker) -cne $markerHash -or (Get-ItemProperty -LiteralPath $key).InstallLocation -cne $root){throw 'Setup changed registered root'}
    Remove-Item -LiteralPath $key
    if((Test-Path -LiteralPath (Join-Path $root 'state.json')) -or (Test-Path -LiteralPath $exe) -or (Get-NativeDataIndex $data) -cne $index -or (Get-NativeHash $retained) -cne $retainedHash){throw 'Guard probes changed orphaned installation or data'}
    Write-Output "PASS ${Boundary}: registration guard rejects recovery without touching data"
    # The PUBLIC Setup must recover; no manual removal of the orphaned marker.
    Invoke-PublicSetup 'recover'
    $state=Read-NativeState $root
    $ui=Read-NativeInstallerUi $root
    if((Test-Path -LiteralPath $marker) -or $ui.sha256 -cne (Get-NativeHash (Join-Path $VersionDirectory 'Uninstall.exe')) -or (Get-ItemProperty -LiteralPath $key).UninstallString -cne ('"'+$exe+'" /D="'+$root+'"')){throw 'Public Setup did not restore coherent GPUI installation'}
    if((Get-NativeDataIndex $data) -cne $index -or (Get-NativeDataIndex (Join-Path $root ('generations/'+$state.active.generation+'/data'))) -cne $index){throw 'Public recovery changed old or adopted data'}
    Write-Output "PASS ${Boundary}: public Setup restores GPUI and exact data without manual cleanup"
    # A late OLD helper must preserve an already renewed installation, even
    # when an old marker reappears. Snapshot all root files before invoking it.
    Write-BetaJson $marker ([Text.Encoding]::UTF8.GetString($markerBytes)|ConvertFrom-Json)
    $before=@{}
    foreach($file in Get-ChildItem -LiteralPath $root -File){$before[$file.Name]=Get-NativeHash $file.FullName}
    $registered=(Get-ItemProperty -LiteralPath $key).UninstallString
    $helper=Start-CleanupHost $driver $cleanRequest
    $out=$helper.StandardOutput.ReadToEndAsync();$err=$helper.StandardError.ReadToEndAsync()
    if(-not $helper.WaitForExit(60000) -or $helper.ExitCode -ne 1){throw 'Old helper accepted a renewed installation'}
    [IO.File]::WriteAllText((Join-Path $evidence 'renewed-helper.log'),$out.GetAwaiter().GetResult()+$err.GetAwaiter().GetResult())
    $helper.Dispose();$helper=$null
    Invoke-PublicSetup 'renewed-pending' 2
    foreach($name in $before.Keys){if((Get-NativeHash (Join-Path $root $name)) -cne $before[$name]){throw "Renewed installation changed: $name"}}
    if((Get-ItemProperty -LiteralPath $key).UninstallString -cne $registered -or (Get-NativeDataIndex $data) -cne $index){throw 'Renewed registry or data changed'}
    # Remove only this deliberately recreated test marker after proving guards.
    Remove-Item -LiteralPath $marker
    Write-Output "PASS ${Boundary}: late helper and Setup conserve already renewed installation"
}finally{
    if($null -ne $handle){$handle.Dispose()}
    if($null -ne $helper){if(-not $helper.HasExited){$helper.Kill();$helper.WaitForExit()};$helper.Dispose()}
    if(Test-Path -LiteralPath $key){
        if(Test-Path -LiteralPath (Join-Path $root 'state.json')){Uninstall-Beta $root|Out-Null}
        Uninstall-NativeRegistration $root $true 'VantareNativeBetaQA1492' 'Vantare QA1492'
    }
}
