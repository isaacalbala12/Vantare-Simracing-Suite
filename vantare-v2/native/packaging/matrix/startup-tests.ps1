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
. (Join-Path $script:Packaging 'beta.ps1') -Library -Root $qaStartupRoot
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
function Legacy-StartupCommand([string]$Directory){'"'+$env:WINDIR+'\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $Directory 'beta.ps1')+'" -Root "'+$Directory+'"'}
function Confirm-StartupFixture([string]$Directory){
    if(-not(Test-Path -LiteralPath (Join-Path $Directory 'boot-pending.json'))){return}
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName="$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe";$info.Arguments='-NoProfile -NonInteractive -Command "[void][Console]::In.ReadLine()"'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true
    $process=[Diagnostics.Process]::Start($info)
    try{
        [IO.File]::WriteAllText((Join-Path $Directory 'hub-ready'),$process.Id.ToString())
        if(-not(Confirm-BetaBoot $Directory $process 0)){throw 'STARTUP_FIXTURE_ACK_FAILED'}
    }finally{
        $process.StandardInput.Close()
        if(-not $process.WaitForExit(3000)){$process.Kill();$process.WaitForExit()}
        $process.Dispose()
    }
}
try{
    $engine=Join-Path $qaStartupRoot 'engine'
    [IO.Directory]::CreateDirectory($engine)|Out-Null
    foreach($name in @('candidate.ps1','beta.ps1')){Copy-Item -LiteralPath (Join-Path $script:Packaging $name) -Destination $engine}
    $boundary="Remove-PSDrive HKCU`nNew-PSDrive HKCU Registry '"+$hive+"' -Scope Global|Out-Null`n"+
        ". '"+(Join-Path $PSScriptRoot 'guard.ps1')+"'`n"+
        'function Get-NativeShortcutFolder([string]$Name){if($Name -cnotin @(''Programs'',''Startup'',''DesktopDirectory'')){throw ''STARTUP_FOLDER_REJECTED''};Join-Path '''+$shellRoot.Replace("'","''")+''' $Name}'
    $driver=[IO.File]::ReadAllText((Join-Path $script:Packaging 'installer-driver.ps1'))
    $import=". (Join-Path `$PSScriptRoot 'beta.ps1') -Library -Root `$PSScriptRoot"
    $driverBoundary=$boundary+"`n"+$import+"`n"+
        $boundary+"`n"+'$null=Assert-MatrixRoot (([IO.File]::ReadAllText($RequestFile)|ConvertFrom-Json).root)'
    $driverBoundary+="`n"+'$fixtureRoot=([IO.File]::ReadAllText($RequestFile)|ConvertFrom-Json).root'+"`n"+
        'if(Test-Path -LiteralPath (Join-Path $fixtureRoot ''fail-uninstall'')){function Get-NativeKnownMembers([string]$Channel){throw ''Synthetic uninstall failure''}}'+"`n"+
        'if(Test-Path -LiteralPath (Join-Path $fixtureRoot ''deny-run'')){function Remove-ItemProperty([string]$LiteralPath,[string]$Name,[string]$ErrorAction){if($LiteralPath.EndsWith(''/Run'')){throw [UnauthorizedAccessException]::new(''Synthetic Run denial'')};Microsoft.PowerShell.Management\Remove-ItemProperty @PSBoundParameters}}'+"`n"
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
    $dispatch="if (`$NativeLibrary) { return }"
    if(-not $source.Contains($dispatch)){throw 'STARTUP_DISPATCH_CHANGED'}
    $guard=$boundary+"`n"+'$commandRoot=Get-Variable NativeRoot -ValueOnly -ErrorAction SilentlyContinue;if(-not $commandRoot){$commandRoot=$Root};$null=Assert-MatrixRoot $commandRoot'+"`n"+
        'if(Test-Path -LiteralPath (Join-Path $commandRoot ''fail-options'')){function Write-NativeInstallerOptions([string]$Directory,[byte[]]$Bytes){throw ''Synthetic options write failure''}}'+"`n"
    $guard+='if($NativeCommand -ceq ''UninstallInstalled'' -and (Test-Path -LiteralPath (Join-Path $commandRoot ''fail-shell-finalize''))){function Get-NativeProgramsFolder{throw ''Synthetic finalizer failure''}}'+"`n"
    $guard+=@'
$script:FixtureLock=${function:Open-NativeLock}
function Wait-StartupBarrier([string]$Directory,[string]$Name){
    [IO.File]::WriteAllText((Join-Path $Directory ($Name+'.entered')),'barrier')
    $deadline=[DateTime]::UtcNow.AddSeconds(30)
    while(-not(Test-Path -LiteralPath (Join-Path $Directory ($Name+'.release')))){
        if([DateTime]::UtcNow -ge $deadline){throw 'STARTUP_BARRIER_TIMEOUT'}
        Start-Sleep -Milliseconds 10 # Synchronize on a file barrier, never a timing assumption.
    }
}
function Open-NativeLock([string]$Path){
    if($NativeCommand -ceq 'Register' -and (Test-Path -LiteralPath (Join-Path $Path 'before-lock'))){Wait-StartupBarrier $Path 'before-lock'}
    $owned=& $script:FixtureLock $Path
    if($NativeCommand -ceq 'Register' -and (Test-Path -LiteralPath (Join-Path $Path 'after-lock'))){Wait-StartupBarrier $Path 'after-lock'}
    $owned
}
$script:FixtureOptional=${function:Sync-NativeOptionalShortcuts}
function Sync-NativeOptionalShortcuts([string]$Directory,[string]$Folder,$Ui,[bool]$Remove=$false,[string]$LaunchTarget,[switch]$ExistingOnly){
    if($null -ne $Ui -and $Ui.autostart -and -not $Remove -and $null -ne (Get-NativeLegacyRun $Directory)){throw 'DUPLICATE_STARTUP_ATTEMPT'}
    if($null -ne $Ui -and $Ui.autostart -and -not $Remove -and (Test-Path -LiteralPath (Join-Path $Directory 'fail-startup-migration'))){return}
    & $script:FixtureOptional @PSBoundParameters
}
'@
    $guard+="`n"
    [IO.File]::WriteAllText($candidate,$source.Replace($dispatch,($guard+$dispatch)),[Text.UTF8Encoding]::new($true))
    $manifest=Read-NativeManifest $generation 'beta' $false -Installed
    foreach($member in $manifest.files){$file=Join-Path $generation $member.path;$member.size=(Get-Item -LiteralPath $file).Length;$member.sha256=Get-NativeHash $file}
    Write-BetaJson (Join-Path $generation 'manifest.json') $manifest
    $state.active.manifest_sha256=Get-NativeHash (Join-Path $generation 'manifest.json')
    Set-NativeState $install $state
    function Invoke-Startup([string]$Value,[string]$Operation='SetStartup'){
        # Exactly the generation script/operation used by the Hub StartupChange.
        Invoke-NativeProcess -Executable "$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe" -Arguments @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$candidate,'-Operation',$Operation,'-Root',$install,'-Startup',$Value) -TimeoutMilliseconds 30000 -LogPath (Join-Path $qaStartupRoot ('startup-'+[guid]::NewGuid().ToString('N')+'.log'))
    }
    $run='HKCU:/Software/Microsoft/Windows/CurrentVersion/Run'
    New-Item -Path $run -Force|Out-Null
    Set-ItemProperty -LiteralPath $run -Name OtherApp -Value 'foreign-app'
    $legacyCommand=Legacy-StartupCommand $install
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $legacyCommand
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
    $result=Invoke-Startup on
    Assert-Startup ($result.ExitCode -eq 0 -and (Read-NativeInstallerUi $install).autostart -and (Test-Path -LiteralPath $link)) 'SetStartup accepts the casing allowed by its PowerShell parameter binding'
    $result=Invoke-Startup off
    Assert-Startup ($result.ExitCode -eq 0 -and -not(Read-NativeInstallerUi $install).autostart -and -not(Test-Path -LiteralPath $link)) 'Lowercase OFF removes the same installer Startup link'
    $foreign=(New-Object -ComObject WScript.Shell).CreateShortcut($link)
    $foreign.TargetPath="$env:WINDIR/System32/cmd.exe";$foreign.Save()
    $linkHash=Get-NativeHash $link;$optionsHash=Get-NativeHash (Join-Path $install 'installer-ui.json')
    $result=Invoke-Startup On
    Assert-Startup ($result.ExitCode -ne 0 -and (Get-NativeHash $link) -ceq $linkHash -and (Get-NativeHash (Join-Path $install 'installer-ui.json')) -ceq $optionsHash) 'A foreign Startup link is preserved and options are not changed'
    $null=Assert-MatrixRoot $link;Remove-Item -LiteralPath $link
    $result=Invoke-Startup On
    Assert-Startup ($result.ExitCode -eq 0) 'Startup can be enabled again after the conflict is removed'
    foreach($foreignCommand in @('legacy-entry',('"'+(Join-Path $qaStartupRoot 'foreign/bin/vantare-hub.exe')+'"'),($legacyCommand.Replace($install,(Join-Path $qaStartupRoot 'foreign'))))){
        Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $foreignCommand
        $result=Invoke-Startup On
        Assert-Startup ($result.ExitCode -eq 0 -and (Get-ItemProperty -LiteralPath $run).'VantareNative.Hub' -ceq $foreignCommand) 'A foreign command reusing the Run name is preserved'
    }
    Remove-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub'
    $result=Invoke-Startup Off
    $uiPath=Join-Path $install 'installer-ui.json';$savedUi=[IO.File]::ReadAllBytes($uiPath)
    Remove-Item -LiteralPath $uiPath
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $legacyCommand
    $missingStartup=Join-Path $install 'fail-startup-migration';[IO.File]::WriteAllText($missingStartup,'simulate swallowed shortcut failure')
    $result=Invoke-Startup On Register
    Assert-Startup ($result.ExitCode -ne 0 -and $result.Stderr.Contains('se ha conservado el inicio Run') -and -not(Test-Path -LiteralPath $link) -and (Get-ItemProperty -LiteralPath $run).'VantareNative.Hub' -ceq $legacyCommand) 'Missing Startup after migration restores the valid Run and reports failure for the visible registration warning'
    Remove-Item -LiteralPath $missingStartup
    $foreign=(New-Object -ComObject WScript.Shell).CreateShortcut($link);$foreign.TargetPath="$env:WINDIR/System32/cmd.exe";$foreign.Save()
    $foreignHash=Get-NativeHash $link
    $result=Invoke-Startup On Register
    Assert-Startup ($result.ExitCode -ne 0 -and (Get-NativeHash $link) -ceq $foreignHash -and (Get-ItemProperty -LiteralPath $run).'VantareNative.Hub' -ceq $legacyCommand) 'Foreign Startup during migration is preserved while the valid Run is restored'
    Remove-Item -LiteralPath $link
    Remove-Item -LiteralPath (Join-Path $install 'startup-options.json')
    $rootBootstrap=Join-Path $install 'candidate.ps1';$rootBootstrapBytes=[IO.File]::ReadAllBytes($rootBootstrap)
    [IO.File]::WriteAllText($rootBootstrap,([IO.File]::ReadAllText($rootBootstrap).Replace('# vantare-launch-capabilities: background-v1','# frozen bootstrap without background capability')),[Text.UTF8Encoding]::new($true))
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $legacyCommand
    $result=Invoke-Startup On Register
    Assert-Startup ($result.ExitCode -eq 0 -and (Read-NativeStartupPreference $install) -and (Test-Path -LiteralPath $link) -and $null -eq (Get-ItemProperty -LiteralPath $run).PSObject.Properties['VantareNative.Hub']) 'Register migrates valid legacy Run into a root option and a single Startup link'
    Assert-Startup (-not(Test-Path -LiteralPath $uiPath) -and (Test-Path -LiteralPath (Join-Path $install 'startup-options.json')) -and (Get-NativeDataIndex $data) -ceq $dataBefore) 'Legacy migration never invents a GPUI uninstaller or rewrites data'
    $legacyLink=(New-Object -ComObject WScript.Shell).CreateShortcut($link)
    Assert-Startup ([IO.Path]::GetFullPath($legacyLink.TargetPath) -ieq [IO.Path]::GetFullPath("$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe") -and $legacyLink.Arguments.Contains((Join-Path $install 'beta.ps1'))) 'A frozen root bootstrap keeps its compatible PowerShell Startup route'
    [IO.File]::WriteAllBytes($rootBootstrap,$rootBootstrapBytes)
    $result=Invoke-Startup Off
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $legacyCommand
    $result=Invoke-Startup On Register
    Assert-Startup ($result.ExitCode -eq 0 -and -not(Read-NativeStartupPreference $install) -and -not(Test-Path -LiteralPath $link) -and $null -eq (Get-ItemProperty -LiteralPath $run).PSObject.Properties['VantareNative.Hub']) 'Register retires Run while respecting an explicit legacy OFF preference'
    [IO.File]::WriteAllBytes($uiPath,$savedUi)
    Remove-Item -LiteralPath (Join-Path $install 'startup-options.json')
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $legacyCommand
    $result=Invoke-Startup On Register
    Assert-Startup ($result.ExitCode -eq 0 -and -not(Read-NativeInstallerUi $install).autostart -and -not(Test-Path -LiteralPath $link) -and $null -eq (Get-ItemProperty -LiteralPath $run).PSObject.Properties['VantareNative.Hub']) 'Register respects the GPUI OFF preference during Run migration'
    foreach($barrier in @('before-lock','after-lock')){
        $result=Invoke-Startup On
        [IO.File]::WriteAllText((Join-Path $install $barrier),'pause Register')
        $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName="$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe"
        $info.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$candidate+'" -Operation Register -Root "'+$install+'"'
        $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardError=$true;$info.RedirectStandardOutput=$true
        $register=[Diagnostics.Process]::Start($info);$registerOut=$register.StandardOutput.ReadToEndAsync();$registerErr=$register.StandardError.ReadToEndAsync()
        try{
            $deadline=[DateTime]::UtcNow.AddSeconds(30)
            while(-not(Test-Path -LiteralPath (Join-Path $install ($barrier+'.entered')))){
                if($register.WaitForExit(20) -or [DateTime]::UtcNow -ge $deadline){throw ('REGISTER_BARRIER_FAILED: '+$registerErr.Result)}
            }
            $beforeOptions=Get-NativeHash $uiPath;$beforeLink=Get-NativeHash $link
            $result=Invoke-Startup Off
            if($barrier -ceq 'before-lock'){
                Assert-Startup ($result.ExitCode -eq 0 -and -not(Test-Path -LiteralPath $link)) 'User can disable Startup before the queued Register acquires the shared lock'
            }else{
                Assert-Startup ($result.ExitCode -ne 0 -and (Get-NativeHash $uiPath) -ceq $beforeOptions -and (Get-NativeHash $link) -ceq $beforeLink) 'SetStartup cannot interleave writes while Register owns the operation lock'
            }
            [IO.File]::WriteAllText((Join-Path $install ($barrier+'.release')),'resume Register')
            if(-not $register.WaitForExit(30000) -or $register.ExitCode){throw ('REGISTER_FAILED: '+$registerErr.Result)}
            Remove-Item -LiteralPath (Join-Path $install $barrier)
            if($barrier -ceq 'after-lock'){$result=Invoke-Startup Off}
            Assert-Startup (-not(Read-NativeInstallerUi $install).autostart -and -not(Test-Path -LiteralPath $link)) "$barrier Register cannot resurrect an explicitly disabled Startup link"
        }finally{
            if(-not $register.HasExited){$register.Kill();$register.WaitForExit()}
            [IO.File]::WriteAllText((Join-Path $qaStartupRoot ($barrier+'.stderr.log')),$registerErr.Result)
            [IO.File]::WriteAllText((Join-Path $qaStartupRoot ($barrier+'.stdout.log')),$registerOut.Result);$register.Dispose()
        }
    }
    $result=Invoke-Startup On
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $legacyCommand
    $failUninstall=Join-Path $install 'fail-uninstall';[IO.File]::WriteAllText($failUninstall,'fail before removal')
    $request.operation='Uninstall';$request.uninstall=$true
    $result=Invoke-StartupDriver $request
    Assert-Startup ($result.ExitCode -ne 0 -and (Test-Path -LiteralPath (Join-Path $install 'state.json')) -and (Get-ItemProperty -LiteralPath $run).'VantareNative.Hub' -ceq $legacyCommand) 'A failed Uninstall never removes the valid legacy Run value'
    Remove-Item -LiteralPath $failUninstall
    # The outer installed-uninstaller CLI calls beta in a second process.
    # Inject its OS boundaries as well; never let that child see the real HKCU.
    $rootBeta=Join-Path $install 'beta.ps1';$rootBetaSource=[IO.File]::ReadAllText($rootBeta)
    $betaDispatch='if ($BetaLibrary) { return }'
    if(-not $rootBetaSource.Contains($betaDispatch)){throw 'STARTUP_BETA_DISPATCH_CHANGED'}
    [IO.File]::WriteAllText($rootBeta,$rootBetaSource.Replace($betaDispatch,($boundary+"`n"+'$null=Assert-MatrixRoot $BetaRoot'+"`n"+$betaDispatch)),[Text.UTF8Encoding]::new($true))
    $failShell=Join-Path $install 'fail-shell-finalize';[IO.File]::WriteAllText($failShell,'fail after program uninstall')
    $result=Invoke-Startup On UninstallInstalled
    Assert-Startup ($result.ExitCode -ne 0 -and -not(Test-Path -LiteralPath (Join-Path $install 'state.json')) -and (Get-ItemProperty -LiteralPath $run).'VantareNative.Hub' -ceq $legacyCommand -and (Get-NativeDataIndex $data) -ceq $dataBefore) 'Outer finalizer failure after program removal still preserves Run and exact data'
    Remove-Item -LiteralPath $failShell
    $request.operation='Uninstall';$request.uninstall=$true
    $result=Invoke-StartupDriver $request
    Assert-Startup ($result.ExitCode -eq 0 -and -not(Test-Path -LiteralPath (Join-Path $install 'state.json'))) 'Installer driver resumes the partial uninstall after Hub activation'
    $values=Get-ItemProperty -LiteralPath $run
    Assert-Startup ($null -eq $values.PSObject.Properties['VantareNative.Hub'] -and -not(Test-Path -LiteralPath $link)) 'Uninstall leaves neither legacy Run nor Startup'
    Assert-Startup ($values.OtherApp -ceq 'foreign-app' -and (Get-NativeDataIndex $data) -ceq $dataBefore) 'Uninstall preserves foreign Run value and exact user data including empty directories'
    # Resume an older partial uninstall which already removed registration but
    # left the legacy Run value. The deferred uninstaller marker binds ownership.
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $legacyCommand
    $result=Invoke-StartupDriver $request
    Assert-Startup ($result.ExitCode -eq 0) 'Hash-bound partial uninstall can resume without its registration key'
    $values=Get-ItemProperty -LiteralPath $run
    Assert-Startup ($null -eq $values.PSObject.Properties['VantareNative.Hub'] -and $values.OtherApp -ceq 'foreign-app' -and (Get-NativeDataIndex $data) -ceq $dataBefore) 'Resumed uninstall retires Run while preserving foreign value and data'
    $setupRoot=Join-Path $qaStartupRoot 'legacy Setup'
    $setupCommand=Legacy-StartupCommand $setupRoot
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $setupCommand
    $request=@{operation='Install';root=$setupRoot;qa=$false;silent=$true;uninstall=$false;version='1.0.0';size=1;mode='auto';desktop=$false;autostart=$false;packageSha=(Get-NativeHash $zip)}
    $result=Invoke-StartupDriver $request
    Assert-Startup ($result.ExitCode -eq 0 -and (Read-NativeInstallerUi $setupRoot).autostart -and (Test-Path -LiteralPath $link) -and $null -eq (Get-ItemProperty -LiteralPath $run).PSObject.Properties['VantareNative.Hub']) 'Setup adopts a valid old Run when no preference existed and never leaves two starts'
    Confirm-StartupFixture $setupRoot
    Remove-Item -LiteralPath $link
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $setupCommand
    $request.mode='repair'
    $result=Invoke-StartupDriver $request
    Assert-Startup ($result.ExitCode -eq 0 -and (Read-NativeInstallerUi $setupRoot).autostart -and (Test-Path -LiteralPath $link) -and $null -eq (Get-ItemProperty -LiteralPath $run).PSObject.Properties['VantareNative.Hub']) 'Setup repair recreates the missing Startup link and preserves ON while retiring legacy Run'
    Confirm-StartupFixture $setupRoot
    Write-NativeStartupPreference $setupRoot $false
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $setupCommand
    $result=Invoke-StartupDriver $request
    Assert-Startup ($result.ExitCode -eq 0 -and -not(Read-NativeInstallerUi $setupRoot).autostart -and -not(Test-Path -LiteralPath $link) -and $null -eq (Get-ItemProperty -LiteralPath $run).PSObject.Properties['VantareNative.Hub']) 'Setup respects an existing OFF preference and removes both owned startup routes'
    Confirm-StartupFixture $setupRoot
    $setupState=Read-NativeState $setupRoot
    $setupData=Join-Path $setupRoot ('generations/'+$setupState.active.generation+'/data')
    [IO.Directory]::CreateDirectory((Join-Path $setupData 'empty'))|Out-Null
    [IO.File]::WriteAllText((Join-Path $setupData 'user.bin'),'setup user data')
    $setupDataBefore=Get-NativeDataIndex $setupData
    [IO.File]::WriteAllText((Join-Path $setupRoot 'deny-run'),'inject denied Run deletion')
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value $setupCommand
    $request.operation='Uninstall';$request.uninstall=$true
    $result=Invoke-StartupDriver $request
    $progressJson=$true
    foreach($line in ($result.Stdout -split "`n")){if($line.Trim()){try{$null=$line|ConvertFrom-Json}catch{$progressJson=$false}}}
    Assert-Startup ($result.ExitCode -eq 0 -and -not(Test-Path -LiteralPath (Join-Path $setupRoot 'state.json')) -and (Get-ItemProperty -LiteralPath $run).'VantareNative.Hub' -ceq $setupCommand -and $result.Stderr.Contains('No se pudo retirar el inicio Run') -and $progressJson) 'Denied Run deletion warns on stderr and preserves valid JSON progress while Uninstall completes'
    Assert-Startup ((Get-NativeDataIndex $setupData) -ceq $setupDataBefore) 'Run denial preserves exact user data and empty directories'
    $foreignRoot=Join-Path $qaStartupRoot 'foreign Run name'
    Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value 'foreign-app-using-our-name'
    $request.root=$foreignRoot;$request.operation='Install';$request.uninstall=$false;$request.mode='auto'
    $result=Invoke-StartupDriver $request
    Assert-Startup ($result.ExitCode -eq 0 -and -not(Read-NativeInstallerUi $foreignRoot).autostart -and (Get-ItemProperty -LiteralPath $run).'VantareNative.Hub' -ceq 'foreign-app-using-our-name') 'Setup does not adopt a foreign command reusing the Run name'
    $request.operation='Uninstall';$request.uninstall=$true
    $result=Invoke-StartupDriver $request
    Assert-Startup ($result.ExitCode -eq 0 -and -not(Test-Path -LiteralPath (Join-Path $foreignRoot 'state.json')) -and (Get-ItemProperty -LiteralPath $run).'VantareNative.Hub' -ceq 'foreign-app-using-our-name') 'Uninstall preserves a foreign command reusing the Run name'
    $badIndex=0
    foreach($badPreference in @('{invalid',('{"schema":1,"autostart":true}'+(' '*1100)),'{"schema":1,"autostart":"true"}')){
        $badIndex++;$badRoot=Join-Path $qaStartupRoot ('damaged-option-'+$badIndex)
        $null=Open-NativeRoot $badRoot -Initialize
        [IO.File]::WriteAllText((Join-Path $badRoot 'startup-options.json'),$badPreference)
        Set-ItemProperty -LiteralPath $run -Name 'VantareNative.Hub' -Value (Legacy-StartupCommand $badRoot)
        $request.root=$badRoot;$request.operation='Probe';$request.uninstall=$false;$request.mode='auto'
        $result=Invoke-StartupDriver $request
        Assert-Startup ($result.ExitCode -eq 0 -and -not($result.Stdout|ConvertFrom-Json).autostart -and $null -eq (Read-NativeStartupPreference $badRoot)) "Damaged legacy option $badIndex is no preference and Probe stays usable"
        $request.operation='Install'
        $result=Invoke-StartupDriver $request
        Assert-Startup ($result.ExitCode -eq 0 -and (Read-NativeInstallerUi $badRoot).autostart -and (Test-Path -LiteralPath $link) -and $null -eq (Get-ItemProperty -LiteralPath $run).PSObject.Properties['VantareNative.Hub']) "Setup recovers damaged legacy option $badIndex and migrates the valid Run"
        $request.operation='Uninstall';$request.uninstall=$true
        $result=Invoke-StartupDriver $request
        Assert-Startup ($result.ExitCode -eq 0 -and -not(Test-Path -LiteralPath $link)) "Recovered damaged option $badIndex uninstalls normally"
    }
    Write-NativeJson (Join-Path $qaStartupRoot 'result.json') @{checks=$passed;run_removed=$true;startup_removed=$true;data_unchanged=(((Get-NativeDataIndex $data) -ceq $dataBefore) -and ((Get-NativeDataIndex $setupData) -ceq $setupDataBefore))}
}finally{
    Remove-PSDrive HKCU
    New-PSDrive HKCU Registry HKEY_CURRENT_USER -Scope Global|Out-Null
    if($hive -cnotmatch '^Registry::HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}$'){throw 'STARTUP_TEST_HIVE_REJECTED'}
    Remove-Item -LiteralPath $hive -Recurse -Force
}
"$passed startup lifecycle checks PASS"
