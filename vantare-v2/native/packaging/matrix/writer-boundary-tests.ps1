#requires -Version 5.1
param([string]$Root,[string]$Assets,[string]$WriteEngine)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaBoundaryRoot=Assert-MatrixRoot $Root
$null=Assert-MatrixRoot $Assets
if(Test-Path -LiteralPath $qaBoundaryRoot){throw 'WRITER_BOUNDARY_NEEDS_FRESH_ROOT'}
[IO.Directory]::CreateDirectory($qaBoundaryRoot)|Out-Null
$env:TEMP=$qaBoundaryRoot;$env:TMP=$qaBoundaryRoot
$env:LOCALAPPDATA=Join-Path $qaBoundaryRoot 'LocalAppData'
$hiveSuffix='Software\VantareInstallerMatrix\'+[guid]::NewGuid().ToString('N')
$hive='Registry::HKEY_CURRENT_USER\'+$hiveSuffix
if($hive -cnotmatch '^Registry::HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}$'){throw 'WRITER_BOUNDARY_HIVE_REJECTED'}
New-Item -Path $hive -Force|Out-Null
Remove-PSDrive HKCU
New-PSDrive HKCU Registry ('HKEY_CURRENT_USER\'+$hiveSuffix) -Scope Global|Out-Null
$packaging=Split-Path $PSScriptRoot -Parent
. (Join-Path $packaging 'candidate.ps1') -Library -Root $qaBoundaryRoot -Channel beta
$passed=0
function Assert-Boundary([bool]$Value,[string]$Message){if(-not $Value){throw $Message};$script:passed++;"PASS $Message"}
$install=Join-Path $qaBoundaryRoot 'install'
$engine=Join-Path $qaBoundaryRoot 'engine'
[IO.Directory]::CreateDirectory($engine)|Out-Null
Copy-Item -LiteralPath "$env:WINDIR/System32/cmd.exe" -Destination (Join-Path $engine 'Uninstall.exe')
[IO.File]::WriteAllText((Join-Path $engine 'installer-notices.txt'),'fixture')
$key='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBeta'
$run='HKCU:/Software/Microsoft/Windows/CurrentVersion/Run'
function Invoke-BoundaryWriter([string]$Operation,[string]$Version){
    $archive=Join-Path $Assets ('v'+$Version.Split('.')[2]+'.zip')
    Copy-Item -LiteralPath $archive -Destination (Join-Path $engine 'package.zip') -Force
    $request=@{operation=$Operation;root=$install;qa=$false;silent=$true;uninstall=($Operation -in @('Uninstall','Cleanup'));
        version=$Version;mode='auto';desktop=$false;autostart=$false;size=1;processId=2147483647;packageSha=(Get-NativeHash $archive)}
    $contractPath=Join-Path $qaBoundaryRoot ('writer-'+[guid]::NewGuid().ToString('N')+'.json')
    Write-NativeJson $contractPath @{request=$request;context=@{localAppData=$env:LOCALAPPDATA;registryPrefix=$hiveSuffix;shellRoot=$qaBoundaryRoot};payloadDirectory=$engine}
    Invoke-NativeProcess -Executable $WriteEngine -Arguments @($contractPath) -TimeoutMilliseconds 120000 -LogPath ($contractPath+'.log')
}
try{
    $result=Invoke-BoundaryWriter 'Install' '0.0.988'
    Assert-Boundary ($result.ExitCode -eq 0) 'Rust Setup finalizes the legacy Windows projection'
    $appLink=Join-Path $qaBoundaryRoot 'Programs/Vantare/Vantare Simracing Suite.lnk'
    $shell=New-Object -ComObject WScript.Shell
    $explorer=New-Object -ComObject Shell.Application
    $before=$shell.CreateShortcut($appLink)
    $expectedTarget=$before.TargetPath;$expectedArguments=$before.Arguments;$expectedIcon=$before.IconLocation
    $expectedVersion=(Get-ItemProperty -LiteralPath $key).DisplayVersion
    foreach($repeat in @(1,2)){
        $result=Invoke-BoundaryWriter 'Sync' '0.0.988'
        Assert-Boundary ($result.ExitCode -eq 0) ('Native shell sync repeat '+$repeat+' succeeds')
        $actual=$shell.CreateShortcut($appLink)
        Assert-Boundary ($actual.TargetPath -ceq $expectedTarget -and $actual.Arguments -ceq $expectedArguments -and $actual.IconLocation -ceq $expectedIcon -and (Get-ItemProperty -LiteralPath $key).DisplayVersion -ceq $expectedVersion) ('Native shell sync repeat '+$repeat+' preserves its projection')
    }
    Assert-Boundary ($explorer.NameSpace((Split-Path $appLink)).ParseName([IO.Path]::GetFileName($appLink)).ExtendedProperty('System.AppUserModel.ID') -ceq 'Vantare.SimracingSuite') 'Native shell persists AppUserModelID'
    Assert-Boundary (@(Get-ChildItem -LiteralPath (Split-Path $appLink) -Filter '*.lnk').Count -eq 2) 'Native shell sync creates no duplicate links'
    $operation=[IO.File]::Open((Join-Path $install '.operation.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try{$blocked=Invoke-BoundaryWriter 'Sync' '0.0.988'}finally{$operation.Dispose()}
    Assert-Boundary ($blocked.ExitCode -ne 0 -and (Get-ItemProperty -LiteralPath $key).DisplayVersion -ceq $expectedVersion) 'Native shell sync respects the operation owner'
    $foreign=$shell.CreateShortcut($appLink);$foreign.TargetPath=Join-Path $qaBoundaryRoot 'foreign.exe';$foreign.Arguments='foreign';$foreign.Save()
    $foreignBytes=[IO.File]::ReadAllBytes($appLink)
    $blocked=Invoke-BoundaryWriter 'Sync' '0.0.988'
    Assert-Boundary ($blocked.ExitCode -ne 0 -and [Convert]::ToBase64String([IO.File]::ReadAllBytes($appLink)) -ceq [Convert]::ToBase64String($foreignBytes)) 'Native shell sync refuses a foreign mandatory link without changing it'
    $own=$shell.CreateShortcut($appLink);$own.TargetPath=$expectedTarget;$own.Arguments=$expectedArguments;$own.IconLocation=$expectedIcon;$own.Save()
    $motionKey='HKCU:/Control Panel/Desktop/WindowMetrics'
    New-Item -Path $motionKey -Force|Out-Null
    foreach($motionType in @('String','DWord')){
        foreach($motionValue in @(0,1)){
            New-ItemProperty -LiteralPath $motionKey -Name MinAnimate -Value $motionValue -PropertyType $motionType -Force|Out-Null
            $legacyMotion=(Get-ItemProperty -LiteralPath $motionKey).MinAnimate -ceq '0'
            $probe=Invoke-BoundaryWriter 'Probe' '0.0.988'
            $actualMotion=($probe.Stdout|ConvertFrom-Json).reduced_motion
            Assert-Boundary ($probe.ExitCode -eq 0 -and $actualMotion -eq $legacyMotion) ('MinAnimate '+$motionType+' '+$motionValue+' matches PowerShell')
        }
    }
    $stateBytes=[IO.File]::ReadAllBytes((Join-Path $install 'state.json'))
    $state=Read-NativeState $install
    $data=Join-Path $install ('generations/'+$state.active.generation+'/data')
    [IO.Directory]::CreateDirectory((Join-Path $data 'empty/child'))|Out-Null
    [IO.File]::WriteAllBytes((Join-Path $data 'opaque.bin'),[byte[]]@(0,255,7,0))
    $dataBefore=Get-NativeDataIndex $data
    $appLink=Join-Path $qaBoundaryRoot 'Programs/Vantare/Vantare Simracing Suite.lnk'
    $linkBytes=[IO.File]::ReadAllBytes($appLink)
    $handle=[IO.File]::Open($appLink,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try{$result=Invoke-BoundaryWriter 'Install' '0.0.989'}finally{$handle.Dispose()}
    Assert-Boundary ($result.ExitCode -ne 0) 'Locked mandatory shortcut rejects Windows finalization'
    Assert-Boundary ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $install 'state.json'))) -ceq [Convert]::ToBase64String($stateBytes)) 'Shell failure restores exact Rust state bytes'
    Assert-Boundary ((Get-ItemProperty -LiteralPath $key).DisplayVersion -ceq '0.0.988') 'Shell resynchronization restores registry version without a byte transaction'
    Assert-Boundary ([Convert]::ToBase64String([IO.File]::ReadAllBytes($appLink)) -ceq [Convert]::ToBase64String($linkBytes)) 'Shell failure preserves owned shortcut bytes'
    Assert-Boundary ((Get-NativeDataIndex $data) -ceq $dataBefore) 'Shell failure preserves opaque data and empty folders'
    Assert-Boundary (@(Get-ChildItem -LiteralPath (Join-Path $install 'generations') -Directory).Count -eq 1) 'Failed generation is removed only after restoring its reference'
    Assert-Boundary (-not(Test-Path -LiteralPath (Join-Path $install 'boot-pending.json'))) 'Failed finalization does not leave a false boot trial'
    New-Item -Path $run -Force|Out-Null
    $legacyCommand='"'+$env:WINDIR+'\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $install 'beta.ps1')+'" -Root "'+$install+'"'
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $legacyCommand
    Set-ItemProperty -LiteralPath $run -Name OtherApp -Value 'foreign-app'
    $handle=[IO.File]::Open($appLink,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try{$result=Invoke-BoundaryWriter 'Uninstall' '0.0.988'}finally{$handle.Dispose()}
    Assert-Boundary ($result.ExitCode -ne 0) 'Uninstall shell failure remains visible after core retirement'
    Assert-Boundary (-not(Test-Path -LiteralPath (Join-Path $install 'state.json'))) 'Partial uninstall does not resurrect a removed state'
    Assert-Boundary ((Test-Path -LiteralPath $key) -and (Get-ItemProperty -LiteralPath $run).'VantareNative.Hub' -ceq $legacyCommand) 'Failed finalization retains registration and Run for retry'
    Assert-Boundary ((Get-NativeDataIndex $data) -ceq $dataBefore) 'Partial uninstall preserves exact data'
    $result=Invoke-BoundaryWriter 'Uninstall' '0.0.988'
    Assert-Boundary ($result.ExitCode -eq 0) 'Rust Uninstall resumes when manifest and state are already removed'
    Assert-Boundary (-not(Test-Path -LiteralPath $key) -and $null -eq (Get-ItemProperty -LiteralPath $run).PSObject.Properties['VantareNative.Hub']) 'Successful finalization retires registry and owned Run'
    Assert-Boundary ((Get-ItemProperty -LiteralPath $run).OtherApp -ceq 'foreign-app') 'Finalization preserves foreign Run value'
    $marker=Join-Path $install 'installer-cleanup.json';$exe=Join-Path $install 'Uninstall.exe'
    Assert-Boundary ((Test-Path -LiteralPath $marker) -and (Test-Path -LiteralPath $exe)) 'Deferred Cleanup owns hash-bound root uninstaller'
    [IO.File]::WriteAllBytes((Join-Path $install 'state.json'),$stateBytes)
    $result=Invoke-BoundaryWriter 'Cleanup' '0.0.988'
    Assert-Boundary ($result.ExitCode -ne 0 -and (Test-Path -LiteralPath $exe) -and (Test-Path -LiteralPath $marker)) 'Cleanup preserves a renewed installation'
    Remove-Item -LiteralPath (Join-Path $install 'state.json')
    $exeBytes=[IO.File]::ReadAllBytes($exe)
    [IO.File]::WriteAllText($exe,'changed fixture bytes')
    $result=Invoke-BoundaryWriter 'Cleanup' '0.0.988'
    Assert-Boundary ($result.ExitCode -ne 0 -and (Test-Path -LiteralPath $exe) -and (Test-Path -LiteralPath $marker)) 'Cleanup rejects a changed uninstaller hash'
    [IO.File]::WriteAllBytes($exe,$exeBytes)
    $result=Invoke-BoundaryWriter 'Cleanup' '0.0.988'
    Assert-Boundary ($result.ExitCode -eq 0 -and -not(Test-Path -LiteralPath $exe) -and -not(Test-Path -LiteralPath $marker)) 'Authorized Cleanup removes only its uninstaller and marker'
    Assert-Boundary (@(Get-ChildItem -LiteralPath $qaBoundaryRoot -Directory -Filter 'VantareSetup-*').Count -eq 0) 'Authorized Cleanup leaves no owned temporary directory or executable'
    Assert-Boundary ((Get-NativeDataIndex $data) -ceq $dataBefore) 'Cleanup preserves exact data and empty directories'
    Write-NativeJson (Join-Path $qaBoundaryRoot 'result.json') @{checks=$passed;data_unchanged=$true;foreign_run_preserved=$true}
}finally{
    Remove-PSDrive HKCU
    New-PSDrive HKCU Registry HKEY_CURRENT_USER -Scope Global|Out-Null
    if($hive -cnotmatch '^Registry::HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}$'){throw 'WRITER_BOUNDARY_HIVE_REJECTED'}
    Remove-Item -LiteralPath $hive -Recurse -Force
}
"$passed writer boundary checks PASS"
