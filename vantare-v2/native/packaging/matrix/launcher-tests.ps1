#requires -Version 5.1
param([string]$Root,[string]$TestVerifier,[string]$BootProbe,[string]$WriteEngine,[string]$RootLauncher)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qa=Assert-MatrixRoot $Root
if(Test-Path -LiteralPath $qa){throw 'LAUNCHER_NEEDS_FRESH_QA_ROOT'}
foreach($path in @($TestVerifier,$BootProbe,$WriteEngine,$RootLauncher)){
    if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw 'LAUNCHER_BINARY_MISSING'}
}
[IO.Directory]::CreateDirectory($qa)|Out-Null
$script:Packaging=Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'support.ps1')
. (Join-Path $PSScriptRoot 'fixtures.ps1')
$install=Join-Path $qa 'install';$assets=Join-Path $qa 'assets';$payload=Join-Path $qa 'payload'
$shell=Join-Path $qa 'shell';$local=Join-Path $qa 'LocalAppData'
$registryId=[guid]::NewGuid().ToString('N')
$prefix='Software\VantareInstallerMatrix\'+$registryId+'\launcher'
$hive='HKCU:\'+$prefix
New-Item -Path $hive -Force|Out-Null
$passed=0
function Assert-Launch([bool]$Value,[string]$Message){if(-not $Value){throw "LAUNCHER_ASSERT: $Message"};$script:passed++;"PASS $Message"}
function Wait-LaunchFile([string]$Path,$Process){
    $deadline=[DateTime]::UtcNow.AddSeconds(45)
    while(-not(Test-Path -LiteralPath $Path)){
        if($Process.WaitForExit(20) -or [DateTime]::UtcNow -ge $deadline){
            if(-not $Process.HasExited){$Process.Kill();$Process.WaitForExit()}
            throw "LAUNCHER_WAIT_FAILED: $Path $($Process.StandardError.ReadToEnd()) $($Process.StandardOutput.ReadToEnd())"
        }
    }
}
function Invoke-Writer([string]$Action,[string]$Version=''){
    $contract=Join-Path $qa ('contract-'+[guid]::NewGuid().ToString('N')+'.json')
    $request=@{operation='Probe';root=$install;qa=$false;silent=$true;uninstall=$false;version='0.0.989';size=1;mode='auto';desktop=$true;autostart=$true;processId=2147483647;packageSha=('0'*64);logFile=($contract+'.log')}
    $directory=$assets
    if($Version){
        $request.operation='Install';$request.version=$Version;$request.packageSha=Get-NativeHash (Join-Path $payload 'package.zip')
        $directory=$payload
    }
    Write-NativeJson $contract @{request=$request;context=@{localAppData=$local;registryPrefix=$prefix;shellRoot=$shell};payloadDirectory=$directory;qaAction=$(if($Action){$Action}else{$null})}
    & $WriteEngine $contract | Out-Null
    if($LASTEXITCODE){throw "LAUNCHER_WRITER_FAILED: $Action $Version"}
}
function Start-Root([switch]$WrongToken) {
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $install 'Vantare.exe'
    $info.Arguments='--root -Root "'+$install+'" --background'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardOutput=$true
    $info.RedirectStandardError=$true
    $info.EnvironmentVariables['TEMP']=$qa;$info.EnvironmentVariables['TMP']=$qa
    $info.EnvironmentVariables['LOCALAPPDATA']=$local
    $info.EnvironmentVariables['VANTARE_QA_LOCAL_APP_DATA']=$local
    $info.EnvironmentVariables['VANTARE_QA_REGISTRY_PREFIX']=$prefix
    $info.EnvironmentVariables['VANTARE_QA_SHELL_ROOT']=$shell
    $info.EnvironmentVariables['VANTARE_QA_SESSION_PROBE']=$BootProbe
    if($WrongToken){$info.EnvironmentVariables['VANTARE_QA_WRONG_BOOT_TOKEN']='1'}
    [Diagnostics.Process]::Start($info)
}
try{
    $env:TEMP=$qa;$env:TMP=$qa;$env:LOCALAPPDATA=$local
    [IO.Directory]::CreateDirectory($assets)|Out-Null
    [IO.Directory]::CreateDirectory($payload)|Out-Null
    [IO.Directory]::CreateDirectory($shell)|Out-Null
    [IO.Directory]::CreateDirectory($local)|Out-Null
    Copy-Item -LiteralPath $RootLauncher -Destination (Join-Path $assets 'Vantare.exe')
    foreach($version in @('989','990')){
        $directory=Join-Path $assets ('v'+$version)
        New-MatrixPayload $directory ('0.0.'+$version) $TestVerifier
        Copy-Item -LiteralPath $RootLauncher -Destination (Join-Path $directory 'bin/vantare.exe') -Force
        Copy-Item -LiteralPath $BootProbe -Destination (Join-Path $directory 'bin/vantare-hub.exe') -Force
        [IO.File]::WriteAllText((Join-Path $directory 'bin/vantare.exe.sha256'),((Get-NativeHash (Join-Path $directory 'bin/vantare.exe'))+'  vantare.exe'+"`n"))
        [IO.File]::WriteAllText((Join-Path $directory 'bin/vantare-hub.exe.sha256'),((Get-NativeHash (Join-Path $directory 'bin/vantare-hub.exe'))+'  vantare-hub.exe'+"`n"))
        $manifest=Get-Content -LiteralPath (Join-Path $directory 'manifest.json') -Raw|ConvertFrom-Json
        foreach($member in $manifest.files){
            if($member.path -in @('bin/vantare.exe','bin/vantare.exe.sha256','bin/vantare-hub.exe','bin/vantare-hub.exe.sha256')){
                $file=Join-Path $directory $member.path;$member.size=(Get-Item -LiteralPath $file).Length;$member.sha256=Get-NativeHash $file
            }
        }
        $manifestPath=Join-Path $directory 'manifest.json'
        $null=Assert-MatrixRoot $manifestPath
        Remove-Item -LiteralPath $manifestPath -Force
        Write-NativeJson $manifestPath $manifest
        New-NativeZip $directory (Join-Path $assets ('v'+$version+'.zip'))
    }
    Copy-Item -LiteralPath "$env:WINDIR/System32/cmd.exe" -Destination (Join-Path $payload 'Uninstall.exe')
    [IO.File]::WriteAllText((Join-Path $payload 'installer-notices.txt'),'QA fixture')
    foreach($version in @('989','990')){
        Copy-Item -LiteralPath (Join-Path $assets ('v'+$version+'.zip')) -Destination (Join-Path $payload 'package.zip') -Force
        Invoke-Writer '' ('0.0.'+$version)
        Copy-Item -LiteralPath (Join-Path $assets 'Vantare.exe') -Destination (Join-Path $install 'Vantare.exe') -Force
        $process=Start-Root
        try{
            Wait-LaunchFile (Join-Path $install 'app-open') $process
            Assert-Launch (-not $process.HasExited) "Run $version keeps QA session alive"
            if($version -eq '990'){
                Wait-LaunchFile (Join-Path $install 'confirmation-complete') $process
                Assert-Launch (-not(Test-Path -LiteralPath (Join-Path $install 'boot-pending.json'))) 'root confirms active motor 2 before registration'
            }
            [IO.File]::WriteAllText((Join-Path $install 'allow-exit'),'QA child may exit')
            Assert-Launch ($process.WaitForExit(10000) -and $process.ExitCode -eq 0) "Run $version reaps its QA child"
        }finally{
            if(-not $process.HasExited){$process.Kill();$process.WaitForExit()}
            $process.Dispose()
        }
        Remove-Item -LiteralPath (Join-Path $install 'allow-exit') -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath (Join-Path $install 'app-open') -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath (Join-Path $install 'confirmation-complete') -ErrorAction SilentlyContinue
    }
    $link=Join-Path $shell 'Startup/Vantare.lnk'
    Assert-Launch (Test-Path -LiteralPath $link) 'Run projects injected Startup shortcut'
    Invoke-Writer 'SetStartupOff'
    Assert-Launch (-not(Test-Path -LiteralPath $link)) 'SetStartup Off removes only injected shortcut'
    Invoke-Writer 'SetStartupOn'
    Assert-Launch (Test-Path -LiteralPath $link) 'SetStartup On restores injected shortcut'
    $key=Join-Path $hive 'Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBeta'
    Assert-Launch ((Get-ItemProperty -LiteralPath $key).DisplayVersion -ceq '0.0.990') 'Register projects confirmed version in injected HKCU'
    $state=Get-Content -LiteralPath (Join-Path $install 'state.json') -Raw|ConvertFrom-Json
    $previous=$state.previous.generation
    Write-NativeJson (Join-Path $install 'boot-pending.json') @{schema=1;version='0.0.990';previous=$previous}
    Copy-Item -LiteralPath (Join-Path $assets 'Vantare.exe') -Destination (Join-Path $install 'Vantare.exe') -Force
    $process=Start-Root -WrongToken
    try{
        Assert-Launch ($process.WaitForExit(15000) -and $process.ExitCode -ne 0) 'wrong Hub token never confirms the boot'
        $state=Get-Content -LiteralPath (Join-Path $install 'state.json') -Raw|ConvertFrom-Json
        Assert-Launch ($state.active.generation -ceq $previous) 'wrong Hub token rolls back to the prior generation'
    }finally{
        if(-not $process.HasExited){$process.Kill();$process.WaitForExit()}
        $process.Dispose()
    }
}finally{
    if($hive -cnotmatch '^HKCU:\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}\\launcher$'){throw 'LAUNCHER_HIVE_REJECTED'}
    Remove-Item -LiteralPath $hive -Recurse -Force
}
"$passed launcher checks PASS"
