#requires -Version 5.1
param([string]$Root,[string]$TestVerifier,[string]$BootProbe)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaBootRoot=Assert-MatrixRoot $Root
if(Test-Path -LiteralPath $qaBootRoot){throw 'BOOT_TEST_NEEDS_FRESH_ROOT'}
if(-not $TestVerifier -or -not $BootProbe){throw 'BOOT_TEST_FIXTURES_REQUIRED'}
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
    foreach($version in @('987','988')){New-MatrixPayload (Join-Path $assets ('v'+$version)) ('0.0.'+$version) $TestVerifier}
    foreach($mode in @('failure','slow','confirmation-registration-failure','missing-windows-env')){
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
__RESULT__
'@
        $result=if($mode -ceq 'failure'){'exit 7'}elseif($mode -ceq 'slow'){'$event=[Threading.ManualResetEvent]::new($false);try{$null=$event.WaitOne()}finally{$event.Dispose()}'}else{'exit 0'}
        [IO.File]::WriteAllText((Join-Path $generation 'candidate.ps1'),$register.Replace('__RESULT__',$result))
        $manifest=Read-NativeManifest $generation 'beta' $false -Installed
        foreach($member in $manifest.files){$file=Join-Path $generation $member.path;$member.size=(Get-Item -LiteralPath $file).Length;$member.sha256=Get-NativeHash $file}
        Write-BetaJson (Join-Path $generation 'manifest.json') $manifest
        $state.active.manifest_sha256=Get-NativeHash (Join-Path $generation 'manifest.json')
        Set-NativeState $install $state
        $stateHash=Get-NativeHash (Join-Path $install 'state.json')
        $dataBefore=Get-MatrixData $install|ConvertTo-Json -Depth 10 -Compress
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
            $status=Get-Content -LiteralPath (Join-Path $install 'update-status.json') -Raw|ConvertFrom-Json
            Assert-Boot ($status.state -ceq 'warning' -and $status.version -ceq '0.0.988' -and $status.notes -ceq 'fixture notes') "$mode registration warning preserves version and notes"
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
