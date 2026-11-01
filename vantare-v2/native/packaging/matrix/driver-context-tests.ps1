#requires -Version 5.1
param([string]$Root,[string]$TestVerifier)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaContextRoot=Assert-MatrixRoot $Root
if(Test-Path -LiteralPath $qaContextRoot){throw 'Driver tests need a fresh root'}
[IO.Directory]::CreateDirectory($qaContextRoot)|Out-Null
$script:Packaging=Split-Path $PSScriptRoot -Parent
. (Join-Path $script:Packaging 'beta.ps1') -Library -Root $qaContextRoot
. (Join-Path $PSScriptRoot 'fixtures.ps1')
$passed=0
function Assert-Context([bool]$Value,[string]$Message){if(-not $Value){throw $Message};$script:passed++;"PASS $Message"}
$hiveId=[guid]::NewGuid().ToString('N')
$hive='Registry::HKEY_CURRENT_USER\Software\VantareInstallerMatrix\'+$hiveId
New-Item -Path $hive -Force|Out-Null
Remove-PSDrive HKCU
New-PSDrive HKCU Registry $hive -Scope Global|Out-Null
try{
    $engine=Join-Path $qaContextRoot 'engine'
    [IO.Directory]::CreateDirectory($engine)|Out-Null
    foreach($name in @('candidate.ps1','beta.ps1')){Copy-Item -LiteralPath (Join-Path $script:Packaging $name) -Destination $engine}
    $driver=Get-Content -LiteralPath (Join-Path $script:Packaging 'installer-driver.ps1') -Raw
    $boundary=@'
Remove-PSDrive HKCU
New-PSDrive HKCU Registry 'HKEY_CURRENT_USER\Software\VantareInstallerMatrix\__HIVE__' -Scope Global|Out-Null
. (Join-Path $PSScriptRoot 'beta.ps1') -Library -Root $PSScriptRoot
function Get-NativeShortcutFolder([string]$Name){
    if($Name -cnotin @('Programs','Startup','DesktopDirectory')){throw 'Unexpected shell folder'}
    Join-Path '__QA__' $Name
}
'@
    $boundary=$boundary.Replace('__HIVE__',$hiveId).Replace('__QA__',$qaContextRoot.Replace("'","''"))
    $import=". (Join-Path `$PSScriptRoot 'beta.ps1') -Library -Root `$PSScriptRoot"
    if(-not $driver.Contains($import)){throw 'Driver import changed'}
    $driverPath=Join-Path $engine 'installer-driver.ps1'
    [IO.File]::WriteAllText($driverPath,$driver.Replace($import,$boundary),[Text.UTF8Encoding]::new($true))
    $payload=Join-Path $qaContextRoot 'payload'
    New-MatrixPayload $payload '0.0.989' $TestVerifier
    $zip=Join-Path $engine 'package.zip';New-NativeZip $payload $zip
    Copy-Item -LiteralPath "$env:WINDIR/System32/cmd.exe" -Destination (Join-Path $engine 'Uninstall.exe')
    [IO.File]::WriteAllText((Join-Path $engine 'installer-notices.txt'),'fixture')
    $target=Join-Path $qaContextRoot 'allowed/install'
    $template=@{operation='Probe';root=$target;qa=$true;qaIdentity='VantareInstallerQA1840';qaShortcutFolder='Vantare QA1840';qaLegacyShortcutFolder='Vantare Legacy QA1840';qaPrefix=(Join-Path $qaContextRoot 'allowed');silent=$true;uninstall=$false;version='0.0.989';size=1;mode='auto';desktop=$false;autostart=$true;packageSha=(Get-NativeHash $zip)}
    function Invoke-Context($Request){
        $file=Join-Path $qaContextRoot ('request-'+[guid]::NewGuid().ToString('N')+'.json')
        Write-NativeJson $file $Request
        $savedTemp=$env:TEMP;$savedTmp=$env:TMP;$savedLocal=$env:LOCALAPPDATA;$savedEncoding=[Console]::InputEncoding
        try{
            $env:TEMP=$qaContextRoot;$env:TMP=$qaContextRoot;$env:LOCALAPPDATA=Join-Path $qaContextRoot 'LocalAppData'
            [Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
            Invoke-NativeProcess -Executable "$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe" -Arguments @('-NoProfile','-ExecutionPolicy','Bypass','-File',$driverPath,'-RequestFile',$file) -InputText "continue`n" -TimeoutMilliseconds 30000 -LogPath ($file+'.log')
        }finally{$env:TEMP=$savedTemp;$env:TMP=$savedTmp;$env:LOCALAPPDATA=$savedLocal;[Console]::InputEncoding=$savedEncoding}
    }
    foreach($case in @('missing-field','public-identity','public-folder','relative-prefix','sibling-prefix','missing-root','real-root')){
        $request=$template.Clone()
        $reason=switch($case){
            'missing-field'{$request.Remove('qaIdentity');'Petición QA incompleta.'}
            'public-identity'{$request.qaIdentity='VantareNativeBeta';'Identidad QA inválida.'}
            'public-folder'{$request.qaShortcutFolder='Vantare';'Carpeta QA inválida.'}
            'relative-prefix'{$request.qaPrefix='relative';'Prefijo QA inválido.'}
            'sibling-prefix'{$request.root=Join-Path $qaContextRoot 'allowed-other/install';'QA fuera de su raíz aislada.'}
            'missing-root'{$request.root=$null;'QA necesita /D=<raíz aislada>.'}
            'real-root'{$request.qaPrefix=$qaContextRoot;$request.root=Join-Path $qaContextRoot 'LocalAppData/Programs/Vantare';'QA no puede usar la instalación del usuario.'}
        }
        $result=Invoke-Context $request
        Assert-Context ($result.ExitCode -ne 0 -and $result.Stderr.Contains($reason)) "QA rejects $case with its expected cause"
        Assert-Context (-not(Test-Path -LiteralPath $target)) "$case creates no installation"
    }
    $request=$template.Clone();$request.qa=$false;$request.operation='Install';$request.root=$null
    $result=Invoke-Context $request
    Assert-Context ($result.ExitCode -ne 0 -and $result.Stderr.Contains('NATIVE_ROOT_REQUIRED')) 'Every mutating request requires an explicit root'
    $legacy=Join-Path $qaContextRoot 'LocalAppData/Programs/Vantare Native Beta'
    [IO.Directory]::CreateDirectory($legacy)|Out-Null
    Write-NativeJson (Join-Path $legacy 'retained-data.json') @{schema=1;generation=('a'*32);version='0.0.975'}
    $request=$template.Clone();$request.qa=$false
    $result=Invoke-Context $request
    Assert-Context ($result.ExitCode -eq 0 -and ($result.Stdout|ConvertFrom-Json).root -ceq $target) 'Explicit root cannot be replaced by legacy discovery'
    $request.root=$null;$result=Invoke-Context $request
    Assert-Context ($result.ExitCode -eq 0 -and ($result.Stdout|ConvertFrom-Json).root -ceq $legacy) 'Probe without root preserves user-facing legacy discovery'
    $request=$template.Clone();$request.operation='Install'
    $result=Invoke-Context $request
    Assert-Context ($result.ExitCode -eq 0) 'TEST request installs with injected identity and prefix'
    $key='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/'+$template.qaIdentity
    Assert-Context ((Get-ItemProperty -LiteralPath $key).InstallLocation -ceq $target) 'Only injected uninstall identity is registered'
    Assert-Context (-not(Test-Path 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBeta')) 'Product uninstall identity is untouched'
    Assert-Context ([IO.File]::ReadAllText((Join-Path $target 'registration-identity.txt')) -ceq $template.qaIdentity) 'Installed identity comes from TEST request'
    Assert-Context (Test-Path -LiteralPath (Join-Path $qaContextRoot 'Startup/Vantare QA1840.lnk')) 'Startup link uses injected shell folder and identity'
    Write-NativeJson (Join-Path $qaContextRoot 'result.json') @{checks=$passed;identity_injected=$true;root_explicit=$true}
}finally{
    Remove-PSDrive HKCU
    New-PSDrive HKCU Registry HKEY_CURRENT_USER -Scope Global|Out-Null
    if($hive -cnotmatch '^Registry::HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}$'){throw 'Driver hive cleanup rejected'}
    Remove-Item -LiteralPath $hive -Recurse -Force
}
"$passed driver context checks PASS; evidence $qaContextRoot"
