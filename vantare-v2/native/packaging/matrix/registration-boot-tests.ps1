#requires -Version 5.1
param([string]$Root,[string]$TestVerifier,[string]$BootProbe)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaBootRoot=Assert-MatrixRoot $Root
if(Test-Path -LiteralPath $qaBootRoot){throw 'BOOT_TEST_NEEDS_FRESH_ROOT'}
if(-not $TestVerifier -or -not $BootProbe){throw 'BOOT_TEST_FIXTURES_REQUIRED'}
foreach($path in @($env:TEMP,$env:TMP,$env:LOCALAPPDATA)){$null=Assert-MatrixRoot $path}
[IO.Directory]::CreateDirectory($qaBootRoot)|Out-Null
$script:Packaging=Split-Path $PSScriptRoot -Parent
. (Join-Path $script:Packaging 'beta.ps1') -Library -Root $qaBootRoot
. (Join-Path $PSScriptRoot 'fixtures.ps1')
function Get-NativeShortcutFolder([string]$Name){
    if($Name -cnotin @('Programs','Startup','DesktopDirectory')){throw 'BOOT_TEST_FOLDER_REJECTED'}
    Join-Path $qaBootShell $Name
}
$hiveId=[guid]::NewGuid().ToString('N')
$hive='Registry::HKEY_CURRENT_USER\Software\VantareInstallerMatrix\'+$hiveId
New-Item -Path $hive -Force|Out-Null
Remove-PSDrive HKCU
New-PSDrive HKCU Registry $hive -Scope Global|Out-Null
$passed=0
$syncRegistration=${function:Sync-BetaRegistration}
function Assert-Boot([bool]$Value,[string]$Message){if(-not $Value){throw $Message};$script:passed++;"PASS $Message"}
function Wait-BootFile([string]$File,$Process){
    $deadline=[DateTime]::UtcNow.AddSeconds(40)
    while(-not(Test-Path -LiteralPath $File)){
        # Synchronize on the real process/file protocol; timeout only bounds failure.
        if($Process.WaitForExit(20) -or [DateTime]::UtcNow -ge $deadline){throw ('BOOT_TEST_PROCESS_FAILED: '+$File)}
    }
}
try{
    $assets=Join-Path $qaBootRoot 'assets'
    foreach($version in @('987','988','989')){New-MatrixPayload (Join-Path $assets ('v'+$version)) ('0.0.'+$version) $TestVerifier}
    $zip=Join-Path $assets 'v989.zip';New-NativeZip (Join-Path $assets 'v989') $zip
    $offer=@{schema=1;product='vantare-native';channel='beta';version='0.0.989';url=([uri]$zip).AbsoluteUri;sha256=(Get-NativeHash $zip);notes='new update notes'}|ConvertTo-Json
    $signed=Invoke-NativeProcess -Executable $TestVerifier -Arguments @('--matrix-sign') -InputText $offer
    if($signed.ExitCode){throw 'BOOT_TEST_SIGNING_FAILED'}
    $offerFile=Join-Path $assets 'offer.json';[IO.File]::WriteAllText($offerFile,$signed.Stdout)
    foreach($mode in @('failure','slow','confirmation-registration-failure','missing-windows-env','run-stage-fast','run-stage-ready-first')){
        Set-Item Function:Sync-BetaRegistration $syncRegistration
        $qaBootShell=Join-Path $qaBootRoot ('shell-'+$mode)
        $caseHive=$hive+'\'+$mode
        New-Item -Path $caseHive -Force|Out-Null
        Remove-PSDrive HKCU
        New-PSDrive HKCU Registry $caseHive -Scope Global|Out-Null
        $install=Join-Path $qaBootRoot $mode
        Initialize-MatrixCase 'boot' $install $assets
        $state=Read-NativeState $install
        $generation=Join-Path $install ('generations/'+$state.active.generation)
        $exe=Join-Path $generation 'bin/vantare-hub.exe'
        Copy-Item -LiteralPath $BootProbe -Destination $exe -Force
        [IO.File]::WriteAllText(($exe+'.sha256'),((Get-NativeHash $exe)+'  vantare-hub.exe'+"`n"))
        # Register's OS boundary is deliberately failing/blocked. Readiness and
        # lifecycle are the actual Hub Rust code; Confirm is the product engine.
        $register=@'
param([string]$Operation,[string]$Root)
if($Operation -cne 'Register' -or -not(Test-Path -LiteralPath (Join-Path $Root 'hub-ready'))){exit 9}
[IO.File]::WriteAllText((Join-Path $Root 'register-observed-ready'),'ready before Register')
[IO.File]::WriteAllText((Join-Path $Root 'register.pid'),$PID.ToString())
__RESULT__
'@
        $result=if($mode -cin @('failure','run-stage-fast')){'exit 7'}elseif($mode -ceq 'slow'){'$event=[Threading.ManualResetEvent]::new($false);try{$null=$event.WaitOne()}finally{$event.Dispose()}'}elseif($mode -ceq 'run-stage-ready-first'){'$deadline=[DateTime]::UtcNow.AddSeconds(60);while(-not(Test-Path -LiteralPath (Join-Path $Root ''release-register''))){if([DateTime]::UtcNow -ge $deadline){exit 8};Start-Sleep -Milliseconds 10};exit 7'}else{'exit 0'}
        [IO.File]::WriteAllText((Join-Path $generation 'candidate.ps1'),$register.Replace('__RESULT__',$result))
        if($mode.StartsWith('run-stage-')){
            Copy-Item -LiteralPath $BootProbe -Destination (Join-Path $generation 'bin/vantare.exe') -Force
            [IO.File]::WriteAllText((Join-Path $generation 'bin/vantare.exe.sha256'),((Get-NativeHash (Join-Path $generation 'bin/vantare.exe'))+'  vantare.exe'+"`n"))
            [IO.File]::WriteAllText((Join-Path $install 'run-stage-case'),'file barrier')
        }
        $manifest=Read-NativeManifest $generation 'beta' $false -Installed
        foreach($member in $manifest.files){$file=Join-Path $generation $member.path;$member.size=(Get-Item -LiteralPath $file).Length;$member.sha256=Get-NativeHash $file}
        Write-BetaJson (Join-Path $generation 'manifest.json') $manifest
        $state.active.manifest_sha256=Get-NativeHash (Join-Path $generation 'manifest.json')
        Set-NativeState $install $state
        $stateHash=Get-NativeHash (Join-Path $install 'state.json')
        $dataBefore=Get-MatrixData $install|ConvertTo-Json -Depth 10 -Compress
        if($mode.StartsWith('run-stage-')){
            $supervisor=Join-Path $install 'supervisor.ps1'
            $scriptText=". '"+(Join-Path $script:Packaging 'beta.ps1').Replace("'","''")+"' -Library -Root '"+$install.Replace("'","''")+"'`n"+
                ". '"+(Join-Path $PSScriptRoot 'guard.ps1').Replace("'","''")+"'`n"+
                '$ErrorActionPreference=''Stop'';Remove-PSDrive HKCU;New-PSDrive HKCU Registry '''+$caseHive+''' -Scope Global|Out-Null'+"`n"+
                'function Get-NativeShortcutFolder([string]$Name){if($Name -cnotin @(''Programs'',''Startup'',''DesktopDirectory'')){throw ''BOOT_FOLDER_REJECTED''};Join-Path '''+$qaBootShell.Replace("'","''")+''' $Name}'+"`n"+
                '$root=Assert-MatrixRoot '''+$install.Replace("'","''")+''';Run-BetaHub $root '''+$offerFile.Replace("'","''")+''''
            [IO.File]::WriteAllText($supervisor,$scriptText,[Text.UTF8Encoding]::new($true))
            $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName="$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe"
            $info.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$supervisor+'"';$info.UseShellExecute=$false;$info.CreateNoWindow=$true
            $info.RedirectStandardError=$true;$info.RedirectStandardOutput=$true
            $process=[Diagnostics.Process]::Start($info)
            $errors=$process.StandardError.ReadToEndAsync();$output=$process.StandardOutput.ReadToEndAsync();$hub=$null
            try{
                Wait-BootFile (Join-Path $install 'register-observed-ready') $process
                $hub=[Diagnostics.Process]::GetProcessById([int][IO.File]::ReadAllText((Join-Path $install 'hub-ready')))
                if($mode -ceq 'run-stage-fast'){Wait-BootFile (Join-Path $install 'registration-status.json') $process}
                Wait-BootFile (Join-Path $install 'staging/pending.json') $process
                $deadline=[DateTime]::UtcNow.AddSeconds(40)
                do{
                    $status=Get-Content -LiteralPath (Join-Path $install 'update-status.json') -Raw|ConvertFrom-Json
                    if($status.state -ceq 'ready' -and $status.version -ceq '0.0.989'){break}
                    if($process.WaitForExit(20) -or [DateTime]::UtcNow -ge $deadline){throw 'BOOT_STAGE_NOT_READY'}
                }while($true)
                $readyHash=Get-NativeHash (Join-Path $install 'update-status.json')
                if($mode -ceq 'run-stage-ready-first'){[IO.File]::WriteAllText((Join-Path $install 'release-register'),'ready already committed')}
                Wait-BootFile (Join-Path $install 'confirmation-complete') $process
                $registration=Get-Content -LiteralPath (Join-Path $install 'registration-status.json') -Raw|ConvertFrom-Json
                Assert-Boot ($registration.state -ceq 'warning' -and $registration.message) "$mode registration warning survives the first real Stage"
                Assert-Boot ($status.notes -ceq 'new update notes' -and (Get-NativeHash (Join-Path $install 'update-status.json')) -ceq $readyHash) "$mode concurrent ready and its update message stay intact"
                Assert-Boot (-not $hub.HasExited -and -not(Test-Path -LiteralPath (Join-Path $install 'boot-pending.json'))) "$mode real Run-BetaHub keeps app open with boot ACK"
                Assert-Boot ((Get-NativeHash (Join-Path $install 'state.json')) -ceq $stateHash) "$mode real Run-BetaHub does not roll back"
                Assert-Boot ((Get-MatrixData $install|ConvertTo-Json -Depth 10 -Compress) -ceq $dataBefore) "$mode Stage preserves all generation data"
                Write-NativeJson (Join-Path $install 'after-first-stage.json') @{registration=$registration;update=$status;ready_sha256=$readyHash}
                [IO.File]::WriteAllText((Join-Path $install 'allow-exit'),'user closes app')
                if(-not $process.WaitForExit(40000) -or $process.ExitCode){throw ('BOOT_SUPERVISOR_FAILED: '+$errors.Result)}
                Assert-Boot ($hub.HasExited) "$mode supervisor and app finish without orphan processes"
            }finally{
                if($null -ne $hub){if(-not $hub.HasExited){$hub.Kill();$hub.WaitForExit()};$hub.Dispose()}
                if(-not $process.HasExited){$process.Kill();$process.WaitForExit()}
                [IO.File]::WriteAllText((Join-Path $install 'supervisor-stderr.log'),$errors.Result)
                [IO.File]::WriteAllText((Join-Path $install 'supervisor-stdout.log'),$output.Result);$process.Dispose()
            }
            continue
        }
        $info=[Diagnostics.ProcessStartInfo]::new()
        $info.FileName=$exe;$info.Arguments='"'+$install+'"';$info.UseShellExecute=$false;$info.CreateNoWindow=$true
        $info.RedirectStandardInput=$true;$info.RedirectStandardError=$true
        $info.EnvironmentVariables['TEMP']=$qaBootRoot;$info.EnvironmentVariables['TMP']=$qaBootRoot;$info.EnvironmentVariables['LOCALAPPDATA']=Join-Path $qaBootRoot 'LocalAppData'
        if($mode -ceq 'missing-windows-env'){$info.EnvironmentVariables.Remove('WINDIR')}
        $process=[Diagnostics.Process]::Start($info)
        try{
            $errorText=$process.StandardError.ReadToEndAsync()
            Wait-BootFile (Join-Path $install 'app-open') $process
            if($mode -cne 'missing-windows-env'){Wait-BootFile (Join-Path $install 'register-observed-ready') $process}
            Assert-Boot (Test-BetaReady $install $process) "$mode app is ready before Register finishes"
            if($mode -ceq 'confirmation-registration-failure'){
                function Sync-BetaRegistration([string]$Directory,[string]$Version){
                    if(Test-Path -LiteralPath (Join-Path $Directory 'boot-pending.json')){throw 'Registry ran before boot ACK'}
                    [IO.File]::WriteAllText((Join-Path $Directory 'registration-observed-ack'),'ACK precedes registry')
                    throw 'Synthetic registry failure'
                }
            }else{Set-Item Function:Sync-BetaRegistration $syncRegistration}
            Assert-Boot (Confirm-BetaBoot $install $process 0) "$mode supervisor accepts boot"
            Assert-Boot (-not(Test-Path -LiteralPath (Join-Path $install 'boot-pending.json'))) "$mode boot ACK removes pending marker"
            if($mode -ceq 'confirmation-registration-failure'){
                Assert-Boot (Test-Path -LiteralPath (Join-Path $install 'registration-observed-ack')) 'Confirmation registry maintenance starts only after boot ACK'
            }
            Wait-BootFile (Join-Path $install 'confirmation-complete') $process
            $status=Get-Content -LiteralPath (Join-Path $install 'registration-status.json') -Raw|ConvertFrom-Json
            $update=Get-Content -LiteralPath (Join-Path $install 'update-status.json') -Raw|ConvertFrom-Json
            $expected=if($mode -ceq 'confirmation-registration-failure'){'current'}else{'warning'}
            Assert-Boot ($status.state -ceq $expected -and $update.state -ceq 'current' -and $update.version -ceq '0.0.988' -and $update.notes -ceq 'fixture notes') "$mode registration stays separate from update metadata"
            if($mode -ceq 'slow'){
                $registerPid=[int][IO.File]::ReadAllText((Join-Path $install 'register.pid'))
                Assert-Boot ($null -eq (Get-Process -Id $registerPid -ErrorAction SilentlyContinue)) 'Blocked Register child is terminated and reaped after its deadline'
            }
            Assert-Boot (-not $process.HasExited) "$mode app remains open after warning"
            Assert-Boot ((Get-NativeHash (Join-Path $install 'state.json')) -ceq $stateHash) "$mode does not roll back"
            Assert-Boot ((Get-MatrixData $install|ConvertTo-Json -Depth 10 -Compress) -ceq $dataBefore) "$mode all generations keep exact data"
            Write-NativeJson (Join-Path $install 'observation.json') @{ready_before_register=$true;app_open=$true;rollback=$false;status=$status;data=(Get-MatrixData $install)}
            $process.StandardInput.Close()
            if(-not $process.WaitForExit(5000) -or $process.ExitCode){throw ('BOOT_TEST_EXIT_FAILED: '+$errorText.Result)}
        }finally{
            if(-not $process.HasExited){$process.Kill();$process.WaitForExit()}
            [IO.File]::WriteAllText((Join-Path $install 'stderr.log'),$errorText.Result)
            $process.Dispose()
        }
    }
}finally{
    Set-Item Function:Sync-BetaRegistration $syncRegistration
    Remove-PSDrive HKCU
    New-PSDrive HKCU Registry HKEY_CURRENT_USER -Scope Global|Out-Null
    if($hive -cnotmatch '^Registry::HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}$'){throw 'BOOT_TEST_HIVE_REJECTED'}
    Remove-Item -LiteralPath $hive -Recurse -Force
}
"$passed registration boot checks PASS"
