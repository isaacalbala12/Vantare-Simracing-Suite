#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$VersionADirectory,
    [Parameter(Mandatory)][string]$VersionBDirectory,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [Parameter(Mandatory)][string]$TestVerifier,
    [Parameter(Mandatory)][string]$SigningKeyFile
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'beta.ps1') -Library -Root $PSScriptRoot
$evidence=Assert-NativePath $EvidenceDirectory
$prefix=[IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa/')
foreach($path in @($evidence,$VersionADirectory,$VersionBDirectory,$TestVerifier,$SigningKeyFile)){
    if(-not (Assert-NativePath $path).StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'QA requiere entradas y salida en su raíz aislada.'}
}
$key='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBetaQA1492'
$programs=Join-Path ([Environment]::GetFolderPath('Programs')) 'Vantare QA1492'
$legacy=Join-Path ([Environment]::GetFolderPath('Programs')) 'Vantare Native Beta QA1492'
$desktop=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Vantare QA1492.lnk'
$startup=Join-Path ([Environment]::GetFolderPath('Startup')) 'Vantare QA1492.lnk'
foreach($path in @($key,$programs,$legacy,$desktop,$startup)){if(Test-Path -LiteralPath $path){throw 'QA1492 existente: conservar y terminar.'}}
if(Test-Path -LiteralPath $evidence){throw 'No sobrescribir evidencia.'}
[IO.Directory]::CreateDirectory($evidence)|Out-Null
$root=Join-Path $evidence 'installed con espacios'
$script:Passed=0
function Assert-QA([bool]$Value,[string]$Message){if(-not $Value){throw "ASSERT: $Message"};$script:Passed++;Write-Output "PASS $Message"}
function Invoke-Exe([string]$Exe,[string]$Arguments,[int]$Expected=0){
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$Exe;$info.Arguments=$Arguments
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $process=[Diagnostics.Process]::Start($info)
    try{
        $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
        if(-not $process.WaitForExit(180000)){throw 'QA excedió su límite; no se mata el instalador.'}
        $text=$stdout.GetAwaiter().GetResult()+$stderr.GetAwaiter().GetResult()
        [IO.File]::WriteAllText((Join-Path $evidence ('process-'+[guid]::NewGuid().ToString('N')+'.log')),$text)
        Assert-QA ($process.ExitCode -eq $Expected) ("EXE código $Expected")
    }finally{$process.Dispose()}
}
function Setup([string]$Directory,[int]$Expected=0){Invoke-Exe (Join-Path $Directory 'VantareSetup.exe') ('/S "/D='+$root+'"') $Expected}
function Cancel-BeforeCopy {
    $hostDirectory=Join-Path $evidence 'cancel-host'
    [IO.Directory]::CreateDirectory($hostDirectory)|Out-Null
    foreach($name in @('candidate.ps1','beta.ps1','installer-driver.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $hostDirectory $name)}
    $archive=Join-Path $VersionBDirectory 'vantare-native-amd64-package.zip'
    Copy-Item -LiteralPath $archive -Destination (Join-Path $hostDirectory 'package.zip')
    $request=Join-Path $hostDirectory 'request.json'
    Write-BetaJson $request @{operation='Install';root=$root;qa=$true;qaIdentity='VantareNativeBetaQA1492';qaShortcutFolder='Vantare QA1492';qaLegacyShortcutFolder='Vantare Native Beta QA1492';qaPrefix='C:/tmp/ola2/1591-qa';silent=$true;uninstall=$false;version=$versionB;packageSha=(Get-NativeHash $archive);size=(Get-Item -LiteralPath $archive).Length;mode='auto';desktop=$false;autostart=$false}
    $before=Get-NativeHash (Join-Path $root 'state.json');$dataBefore=All-Data
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $hostDirectory 'installer-driver.ps1')+'" -RequestFile "'+$request+'"'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $process=[Diagnostics.Process]::Start($info)
    try{
        $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
        $process.StandardInput.WriteLine('cancel');$process.StandardInput.Close()
        if(-not $process.WaitForExit(180000)){throw 'Cancelación no terminó; conservar host.'}
        [IO.File]::WriteAllText((Join-Path $evidence 'cancel.log'),$stdout.GetAwaiter().GetResult()+$stderr.GetAwaiter().GetResult())
        Assert-QA ($process.ExitCode -eq 5) 'cancelar durante verificación devuelve 5 antes de copiar'
        Assert-QA ((Get-NativeHash (Join-Path $root 'state.json')) -ceq $before -and (All-Data) -ceq $dataBefore) 'cancelación mantiene estado y todos los datos exactos'
        Assert-QA (-not (Test-Path -LiteralPath (Join-Path $root 'boot-pending.json'))) 'cancelación no escribe boot-pending'
    }finally{$process.Dispose()}
}
function State {Read-NativeState $root}
function Data {Join-Path $root ('generations/'+(State).active.generation+'/data')}
function Snapshot([string]$Name,[string]$SnapshotRoot){
    $request=Join-Path $evidence ($Name+'-request.json')
    Write-BetaJson $request @{operation='Probe';root=$SnapshotRoot;qa=$true;qaIdentity='VantareNativeBetaQA1492';qaShortcutFolder='Vantare QA1492';qaLegacyShortcutFolder='Vantare Native Beta QA1492';qaPrefix='C:/tmp/ola2/1591-qa';silent=$false;uninstall=$false;version=$versionB;size=(Get-Item -LiteralPath (Join-Path $VersionBDirectory 'vantare-native-amd64-package.zip')).Length}
    $info=& (Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe') -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'installer-driver.ps1') -RequestFile $request
    if($LASTEXITCODE){throw 'Probe de captura falló.'}
    $null=$info|ConvertFrom-Json
    [IO.File]::WriteAllText((Join-Path $evidence ($Name+'.json')),($info -join "`n"),[Text.UTF8Encoding]::new($false))
}
function All-Data {
    $index=[ordered]@{}
    if(Test-Path -LiteralPath (Join-Path $root 'generations')){
        foreach($generation in @(Get-ChildItem -LiteralPath (Join-Path $root 'generations') -Directory|Sort-Object Name)){
            $path=Join-Path $generation.FullName 'data'
            if(Test-Path -LiteralPath $path){$index[$generation.Name]=Get-NativeDataIndex $path}
        }
    }
    ConvertTo-Json $index -Compress
}
function Rollback-FailedBoot {
    $exe=Join-Path $root ('generations/'+(State).active.generation+'/bin/vantare-hub.exe')
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$exe;$info.Arguments='--invalid-beta-start';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardError=$true
    $process=[Diagnostics.Process]::Start($info)
    try{
        $errors=$process.StandardError.ReadToEndAsync()
        Assert-QA (-not (Confirm-BetaBoot $root $process 15)) 'Hub con argumentos inválidos revierte realmente'
        Assert-QA ($process.HasExited -and $process.ExitCode -ne 0) 'fallo headless real, sin supervisor/IPC live'
        [IO.File]::WriteAllText((Join-Path $evidence ('failed-boot-'+[guid]::NewGuid().ToString('N')+'.log')),$errors.GetAwaiter().GetResult())
    }finally{$process.Dispose()}
}
function Uninstall {
    $before=All-Data
    Invoke-Exe (Join-Path $root 'Uninstall.exe') '/S'
    $timer=[Diagnostics.Stopwatch]::StartNew()
    while((Test-Path -LiteralPath (Join-Path $root 'Uninstall.exe')) -or (Test-Path -LiteralPath (Join-Path $root 'installer-cleanup.json'))){
        if($timer.Elapsed.TotalSeconds -gt 45){throw 'La limpieza diferida no terminó; conservar evidencia.'}
        Start-Sleep -Milliseconds 50
    }
    Assert-QA (-not (Test-Path -LiteralPath $key)) 'desinstalar retira únicamente el registro QA'
    Assert-QA (-not (Test-Path -LiteralPath $programs)) 'desinstalar retira Inicio propio'
    Assert-QA ((All-Data) -ceq $before) 'índice de todos los data de todas las generaciones idéntico'
    Assert-QA (Test-Path -LiteralPath (Join-Path $root 'retained-data.json')) 'referencia conservada durable'
    foreach($name in @('candidate.ps1','beta.ps1','installer-ui.json','Uninstall.exe')){Assert-QA (-not (Test-Path -LiteralPath (Join-Path $root $name))) ("desinstalar retira $name")}
}
function Signed-Package([string]$Directory,[string]$Label){
    $zip=Join-Path $Directory 'vantare-native-amd64-package.zip'
    $payload=Join-Path $evidence ($Label+'-TEST')
    $manifest=Expand-NativePackage $zip (Get-NativeHash $zip) $payload 'beta'
    Copy-Item -LiteralPath $TestVerifier -Destination (Join-Path $payload 'bin/vantare-services.exe') -Force
    $hash=Get-NativeHash (Join-Path $payload 'bin/vantare-services.exe')
    [IO.File]::WriteAllText((Join-Path $payload 'bin/vantare-services.exe.sha256'),"$hash  vantare-services.exe`n",[Text.UTF8Encoding]::new($false))
    foreach($file in $manifest.files){$item=Get-Item -LiteralPath (Join-Path $payload $file.path);$file.size=$item.Length;$file.sha256=Get-NativeHash $item.FullName}
    Remove-Item -LiteralPath (Join-Path $payload 'manifest.json')
    Write-NativeJson (Join-Path $payload 'manifest.json') $manifest
    $result="$payload.zip";New-NativeZip $payload $result;$result
}

# No llamada a Run-BetaHub ni autostart: native-beta comparte SID en esta sesión.
Setup $VersionADirectory
$first=(State).active.generation
$versionA=(Get-ItemProperty -LiteralPath $key).DisplayVersion
$versionB=([Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $VersionBDirectory 'VantareSetup.exe'))).ProductVersion
Assert-QA ((Read-BetaVersion $versionB) -gt (Read-BetaVersion $versionA)) 'A y B son versiones reales distintas'
Snapshot 'installed-snapshot' $root
Snapshot 'welcome-snapshot' (Join-Path $evidence 'fresh visual')
Assert-QA (-not (Test-Path -LiteralPath $desktop) -and -not (Test-Path -LiteralPath $startup)) '/S no añade escritorio ni startup'
Assert-QA ((Get-ItemProperty -LiteralPath $key).UninstallString -ceq ('"'+(Join-Path $root 'Uninstall.exe')+'" /D="'+$root+'"')) 'Programas usa Uninstall.exe propio y raíz exacta'
Assert-QA ((Get-ItemProperty -LiteralPath $key).NoModify -eq 1 -and (Get-ItemProperty -LiteralPath $key).NoRepair -eq 1) 'Programas conserva flags NSIS'
$shell=New-Object -ComObject WScript.Shell
Assert-QA (($shell.CreateShortcut((Join-Path $programs 'Desinstalar.lnk'))).TargetPath -ceq (Join-Path $root 'Uninstall.exe')) 'Inicio usa el mismo desinstalador'
foreach($relative in @('hub/profile.json','Vantare/native/layout.json','Vantare/native/launcher/profiles.json','Vantare/native/services/account-fixture.json')){
    $path=Join-Path (Data) $relative;[IO.Directory]::CreateDirectory((Split-Path $path))|Out-Null
    [IO.File]::WriteAllText($path,'{"kind":"TEST fixture","value":"conservar exacto"}',[Text.UTF8Encoding]::new($false))
}
$dataIndex=Get-NativeDataIndex (Data)
$session=[IO.File]::Open((Join-Path $root 'beta-session.lock'),'Open','ReadWrite','None')
try{Setup $VersionBDirectory 2;Invoke-Exe (Join-Path $root 'Uninstall.exe') '/S' 1}finally{$session.Dispose()}
$busy=[IO.File]::Open((Join-Path $root ('generations/'+$first+'/bin/vantare-hub.exe')),'Open','Read','Read')
try{Setup $VersionBDirectory 2}finally{$busy.Dispose()}
Assert-QA ((State).active.generation -ceq $first) 'locks conservan generación'
Cancel-BeforeCopy
Setup $VersionBDirectory
Assert-QA ((Get-NativeDataIndex (Data)) -ceq $dataIndex) 'Setup B conserva cuatro familias de datos'
Assert-QA ((Get-NativeHash (Join-Path $root 'candidate.ps1')) -ceq (Get-NativeHash (Join-Path $PSScriptRoot 'candidate.ps1'))) 'Setup renueva candidate al código vigente'
Assert-QA ((Get-NativeHash (Join-Path $root 'beta.ps1')) -ceq (Get-NativeHash (Join-Path $PSScriptRoot 'beta.ps1'))) 'Setup renueva beta al código vigente'
$pending=Get-NativeHash (Join-Path $root 'boot-pending.json');$generation=(State).active.generation
Setup $VersionBDirectory 4
Assert-QA ((Get-NativeHash (Join-Path $root 'boot-pending.json')) -ceq $pending -and (State).active.generation -ceq $generation) 'código 4 no altera marcador ni generación'
Setup $VersionADirectory 3
Assert-QA ((Get-NativeDataIndex (Data)) -ceq $dataIndex) 'downgrade conserva todos los datos'
Rollback-FailedBoot
Assert-QA ((State).active.generation -ceq $first -and (Get-ItemProperty -LiteralPath $key).DisplayVersion -ceq $versionA) 'rollback restaura A y su registro'
Assert-QA ((Read-NativeInstallerUi $root).kind -ceq 'rust-gpui') 'rollback conserva preferencias/desinstalador propio'
Uninstall
Setup $VersionBDirectory
Assert-QA ((Get-NativeDataIndex (Data)) -ceq $dataIndex) 'reinstalar B adopta referencia y datos'
$active=(State).active.generation
Remove-Item -LiteralPath (Join-Path $root "generations/$active/bin/vantare-hub.exe")
Setup $VersionBDirectory
Assert-QA ((State).active.generation -cne $active -and (Get-NativeDataIndex (Data)) -ceq $dataIndex) 'reparar mismo Setup recupera Hub y datos exactos'
Snapshot 'done-snapshot' $root
Uninstall
Setup $VersionADirectory 3
Assert-QA (-not (Test-Path -LiteralPath $key)) 'datos B rechazan A sin registro nuevo'

# Feed TEST: binarios reales A/B excepto services, reemplazado explícitamente por
# el verificador criptográfico aislado. Nunca ejecutar como una sesión live.
$signedA=Signed-Package $VersionADirectory 'feed-a'
$signedB=Signed-Package $VersionBDirectory 'feed-b'
$root=Join-Path $evidence 'feed-installed'
Install-Beta $root $signedA (Get-NativeHash $signedA)
[IO.File]::WriteAllText((Join-Path $root 'registration-identity.txt'),'VantareNativeBetaQA1492')
New-Item -Path $key|Out-Null
foreach($item in @{InstallLocation=$root;DisplayVersion=$versionA;ShortcutFolder='Vantare QA1492';LegacyShortcutFolder='Vantare Native Beta QA1492'}.GetEnumerator()){Set-ItemProperty -LiteralPath $key -Name $item.Key -Value $item.Value}
Copy-Item -LiteralPath (Join-Path $VersionADirectory 'Uninstall.exe') -Destination (Join-Path $root 'Uninstall.exe')
Write-BetaJson (Join-Path $root 'installer-ui.json') @{schema=1;kind='rust-gpui';uninstaller='Uninstall.exe';sha256=(Get-NativeHash (Join-Path $root 'Uninstall.exe'));desktop=$false;autostart=$false}
Sync-NativeRegistration $root $versionA
$bootstrap=@(Get-NativeHash (Join-Path $root 'candidate.ps1');Get-NativeHash (Join-Path $root 'beta.ps1');Get-NativeHash (Join-Path $root 'Uninstall.exe')) -join ':'
[IO.File]::WriteAllText((Join-Path (Data) 'feed-fixture.json'),'{"TEST":"feed data"}')
$feedData=Get-NativeDataIndex (Data);$feedGeneration=(State).active.generation
$manifest=@{schema=1;product='vantare-native';channel='beta';version=$versionB;url=([uri]$signedB).AbsoluteUri;sha256=(Get-NativeHash $signedB);notes='TEST ONLY signed update'}
$feed=Join-Path $evidence 'feed-TEST.json'
[IO.File]::WriteAllText($feed,(Invoke-BetaManifestTool $TestVerifier ($manifest|ConvertTo-Json) $SigningKeyFile),[Text.UTF8Encoding]::new($false))
Assert-QA (Stage-BetaUpdate $root $feed) 'feed TEST verifica firma y prepara B'
Assert-QA (Apply-BetaUpdate $root) 'feed TEST activa B'
Assert-QA ((Get-NativeDataIndex (Data)) -ceq $feedData) 'feed conserva índice de datos'
Assert-QA ((@(Get-NativeHash (Join-Path $root 'candidate.ps1');Get-NativeHash (Join-Path $root 'beta.ps1');Get-NativeHash (Join-Path $root 'Uninstall.exe')) -join ':') -ceq $bootstrap) 'feed no renueva bootstrap ni desinstalador'
Sync-NativeRegistration $root $versionB
Assert-QA ((Get-ItemProperty -LiteralPath $key).UninstallString -ceq ('"'+(Join-Path $root 'Uninstall.exe')+'" /D="'+$root+'"')) 'Register tras feed mantiene interfaz propia y raíz exacta'
Rollback-FailedBoot
Assert-QA ((State).active.generation -ceq $feedGeneration) 'fallo headless tras feed revierte A'
Uninstall
Invoke-Exe (Join-Path $VersionADirectory 'VantareSetup.exe') '/S' 1
Invoke-Exe (Join-Path $VersionADirectory 'VantareSetup.exe') '/S /D=C:/Windows' 1
Write-Output "$script:Passed comprobaciones QA headless PASS; live/Windows limpio requieren SID/VM de prueba. Evidencia: $evidence"
