#requires -Version 5.1
param([string]$Root,[string]$TestVerifier)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaStartupRoot=Assert-MatrixRoot $Root
if(Test-Path -LiteralPath $qaStartupRoot){throw 'STARTUP_TEST_NEEDS_FRESH_ROOT'}
if(-not $TestVerifier){throw 'STARTUP_TEST_VERIFIER_REQUIRED'}
foreach($path in @($env:TEMP,$env:TMP,$env:LOCALAPPDATA)){$null=Assert-MatrixRoot $path}
[IO.Directory]::CreateDirectory($qaStartupRoot)|Out-Null
$script:Packaging=Split-Path $PSScriptRoot -Parent
. (Join-Path $script:Packaging 'beta.ps1') -Root $qaStartupRoot
. (Join-Path $PSScriptRoot 'fixtures.ps1')
$shellRoot=Join-Path $qaStartupRoot 'shell'
function Get-NativeShortcutFolder([string]$Name){
    if($Name -cnotin @('Programs','Startup','DesktopDirectory')){throw 'STARTUP_FOLDER_REJECTED'}
    Join-Path $shellRoot $Name
}
$hiveId=[guid]::NewGuid().ToString('N')
$hive='Registry::HKEY_CURRENT_USER\Software\VantareInstallerMatrix\'+$hiveId
New-Item -Path $hive -Force|Out-Null
Remove-PSDrive HKCU
New-PSDrive HKCU Registry $hive -Scope Global|Out-Null
$passed=0
function Assert-Startup([bool]$Value,[string]$Message){if(-not $Value){throw $Message};$script:passed++;"PASS $Message"}
try{
    $engine=Join-Path $qaStartupRoot 'engine'
    [IO.Directory]::CreateDirectory($engine)|Out-Null
    foreach($name in @('candidate.ps1','beta.ps1')){Copy-Item -LiteralPath (Join-Path $script:Packaging $name) -Destination $engine}
    $boundary="Remove-PSDrive HKCU`nNew-PSDrive HKCU Registry '"+$hive+"' -Scope Global|Out-Null`n"+
        ". '"+(Join-Path $PSScriptRoot 'guard.ps1')+"'`n"+
        'function Get-NativeShortcutFolder([string]$Name){if($Name -cnotin @(''Programs'',''Startup'',''DesktopDirectory'')){throw ''STARTUP_FOLDER_REJECTED''};Join-Path '''+$shellRoot.Replace("'","''")+''' $Name}'
    $driver=[IO.File]::ReadAllText((Join-Path $script:Packaging 'installer-driver.ps1'))
    $import=". (Join-Path `$PSScriptRoot 'beta.ps1')"
    $driverBoundary=$boundary+"`n"+$import+" -Root '"+$engine.Replace("'","''")+"'`n"+
        $boundary+"`n"+'$null=Assert-MatrixRoot (([IO.File]::ReadAllText($RequestFile)|ConvertFrom-Json).root)'
    if(-not $driver.Contains($import)){throw 'STARTUP_DRIVER_IMPORT_CHANGED'}
    $driverPath=Join-Path $engine 'installer-driver.ps1'
    [IO.File]::WriteAllText($driverPath,$driver.Replace($import,$driverBoundary),[Text.UTF8Encoding]::new($true))
    $payload=Join-Path $qaStartupRoot 'payload'
    New-MatrixPayload $payload '1.0.0' $TestVerifier
    $zip=Join-Path $engine 'package.zip';New-NativeZip $payload $zip
    Copy-Item -LiteralPath "$env:WINDIR/System32/cmd.exe" -Destination (Join-Path $engine 'Uninstall.exe')
    [IO.File]::WriteAllText((Join-Path $engine 'installer-notices.txt'),'fixture')
    $install=Join-Path $qaStartupRoot 'instalacion con espacios'
    $request=@{operation='Install';root=$install;qa=$false;silent=$true;uninstall=$false;version='1.0.0';size=1;mode='auto';desktop=$false;autostart=$false;packageSha=(Get-NativeHash $zip)}
    function Invoke-StartupDriver($Request){
        $path=Join-Path $engine ('request-'+[guid]::NewGuid().ToString('N')+'.json')
        Write-NativeJson $path $Request
        $encoding=[Console]::InputEncoding
        try{
            [Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
            Invoke-NativeProcess -Executable "$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe" -Arguments @('-NoProfile','-ExecutionPolicy','Bypass','-File',$driverPath,'-RequestFile',$path) -InputText "continue`n" -TimeoutMilliseconds 30000 -LogPath ($path+'.log')
        }finally{[Console]::InputEncoding=$encoding}
    }
    $result=Invoke-StartupDriver $request
    Assert-Startup ($result.ExitCode -eq 0) 'Setup driver installs with Startup initially disabled'
    $state=Read-NativeState $install
    $generation=Join-Path $install ('generations/'+$state.active.generation)
    $data=Join-Path $generation 'data'
    [IO.Directory]::CreateDirectory((Join-Path $data 'empty'))|Out-Null
    [IO.File]::WriteAllText((Join-Path $data 'user.bin'),'opaque user data')
    $dataBefore=Get-NativeDataIndex $data
    $candidate=Join-Path $generation 'candidate.ps1'
    $source=[IO.File]::ReadAllText($candidate)
    $dispatch="if (`$MyInvocation.InvocationName -eq '.') { return }"
    if(-not $source.Contains($dispatch)){throw 'STARTUP_DISPATCH_CHANGED'}
    $guard=$boundary+"`n"+'$commandRoot=Get-Variable NativeRoot -ValueOnly -ErrorAction SilentlyContinue;if(-not $commandRoot){$commandRoot=$Root};$null=Assert-MatrixRoot $commandRoot'+"`n"+
        'if(Test-Path -LiteralPath (Join-Path $commandRoot ''fail-options'')){function Write-NativeInstallerOptions([string]$Directory,[byte[]]$Bytes){throw ''Synthetic options write failure''}}'+"`n"
    [IO.File]::WriteAllText($candidate,$source.Replace($dispatch,($guard+$dispatch)),[Text.UTF8Encoding]::new($true))
    $manifest=Read-NativeManifest $generation 'beta' $false -Installed
    foreach($member in $manifest.files){$file=Join-Path $generation $member.path;$member.size=(Get-Item -LiteralPath $file).Length;$member.sha256=Get-NativeHash $file}
    Write-BetaJson (Join-Path $generation 'manifest.json') $manifest
    $state.active.manifest_sha256=Get-NativeHash (Join-Path $generation 'manifest.json')
    Set-NativeState $install $state
    function Invoke-Startup([string]$Value){
        # Exactly the generation script/operation used by the Hub StartupChange.
        Invoke-NativeProcess -Executable "$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe" -Arguments @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$candidate,'-Operation','SetStartup','-Root',$install,'-Startup',$Value) -TimeoutMilliseconds 30000 -LogPath (Join-Path $qaStartupRoot ('startup-'+[guid]::NewGuid().ToString('N')+'.log'))
    }
    $run='HKCU:/Software/Microsoft/Windows/CurrentVersion/Run'
    New-Item -Path $run -Force|Out-Null
    Set-ItemProperty -LiteralPath $run -Name OtherApp -Value 'foreign-app'
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value 'legacy-entry'
    $link=Join-Path $shellRoot 'Startup/Vantare.lnk'
    $result=Invoke-Startup On
    Assert-Startup ($result.ExitCode -eq 0) 'Hub installer command enables Startup'
    Assert-Startup ((Read-NativeInstallerUi $install).autostart -and (Test-Path -LiteralPath $link)) 'Hub and Setup share installer options and Startup link'
    $shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut($link)
    Assert-Startup ($shortcut.TargetPath -ceq (Get-NativeLaunchTarget $install) -and $shortcut.Arguments.EndsWith(' --background')) 'Startup link uses installer background launcher'
    $values=Get-ItemProperty -LiteralPath $run
    Assert-Startup ($null -eq $values.PSObject.Properties['VantareNative.Hub'] -and $values.OtherApp -ceq 'foreign-app') 'Enabling Startup retires only the owned legacy Run value'
    $failOptions=Join-Path $install 'fail-options'
    [IO.File]::WriteAllText($failOptions,'injected I/O failure')
    $beforeLink=Get-NativeHash $link;$beforeOptions=Get-NativeHash (Join-Path $install 'installer-ui.json')
    $result=Invoke-Startup Off
    Assert-Startup ($result.ExitCode -ne 0 -and (Get-NativeHash $link) -ceq $beforeLink -and (Get-NativeHash (Join-Path $install 'installer-ui.json')) -ceq $beforeOptions) 'Options write failure restores exact original Startup bytes and preference'
    $null=Assert-MatrixRoot $failOptions;Remove-Item -LiteralPath $failOptions
    $result=Invoke-Startup Off
    Assert-Startup ($result.ExitCode -eq 0 -and -not(Test-Path -LiteralPath $link) -and -not(Read-NativeInstallerUi $install).autostart) 'Disabling Startup removes the installer link and preference'
    $foreign=(New-Object -ComObject WScript.Shell).CreateShortcut($link)
    $foreign.TargetPath="$env:WINDIR/System32/cmd.exe";$foreign.Save()
    $linkHash=Get-NativeHash $link;$optionsHash=Get-NativeHash (Join-Path $install 'installer-ui.json')
    $result=Invoke-Startup On
    Assert-Startup ($result.ExitCode -ne 0 -and (Get-NativeHash $link) -ceq $linkHash -and (Get-NativeHash (Join-Path $install 'installer-ui.json')) -ceq $optionsHash) 'A foreign Startup link is preserved and options are not changed'
    $null=Assert-MatrixRoot $link;Remove-Item -LiteralPath $link
    $result=Invoke-Startup On
    Assert-Startup ($result.ExitCode -eq 0) 'Startup can be enabled again after the conflict is removed'
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value 'legacy-entry'
    $request.operation='Uninstall';$request.uninstall=$true
    $result=Invoke-StartupDriver $request
    Assert-Startup ($result.ExitCode -eq 0 -and -not(Test-Path -LiteralPath (Join-Path $install 'state.json'))) 'Installer driver completes uninstall after Hub activation'
    $values=Get-ItemProperty -LiteralPath $run
    Assert-Startup ($null -eq $values.PSObject.Properties['VantareNative.Hub'] -and -not(Test-Path -LiteralPath $link)) 'Uninstall leaves neither legacy Run nor Startup'
    Assert-Startup ($values.OtherApp -ceq 'foreign-app' -and (Get-NativeDataIndex $data) -ceq $dataBefore) 'Uninstall preserves foreign Run value and exact user data including empty directories'
    # Resume an older partial uninstall which already removed registration but
    # left the legacy Run value. The deferred uninstaller marker binds ownership.
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value 'legacy-entry'
    $result=Invoke-StartupDriver $request
    Assert-Startup ($result.ExitCode -eq 0) 'Hash-bound partial uninstall can resume without its registration key'
    $values=Get-ItemProperty -LiteralPath $run
    Assert-Startup ($null -eq $values.PSObject.Properties['VantareNative.Hub'] -and $values.OtherApp -ceq 'foreign-app' -and (Get-NativeDataIndex $data) -ceq $dataBefore) 'Resumed uninstall retires Run while preserving foreign value and data'
    Write-NativeJson (Join-Path $qaStartupRoot 'result.json') @{checks=$passed;run_removed=$true;startup_removed=$true;data_unchanged=((Get-NativeDataIndex $data) -ceq $dataBefore)}
}finally{
    Remove-PSDrive HKCU
    New-PSDrive HKCU Registry HKEY_CURRENT_USER -Scope Global|Out-Null
    if($hive -cnotmatch '^Registry::HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}$'){throw 'STARTUP_TEST_HIVE_REJECTED'}
    Remove-Item -LiteralPath $hive -Recurse -Force
}
"$passed startup lifecycle checks PASS"
