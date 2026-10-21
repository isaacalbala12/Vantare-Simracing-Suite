#requires -Version 5.1
param([Parameter(Mandatory)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$repo=Split-Path (Split-Path $PSScriptRoot)
foreach($script in @('installer-driver.ps1','build-installer.ps1','candidate.ps1','beta.ps1')) {
    $tokens=$null; $errors=$null
    $null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $script),[ref]$tokens,[ref]$errors)
    if($errors.Count){throw "AST $script : $errors"}
}
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
if(-not $evidence.StartsWith([IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa/'),[StringComparison]::OrdinalIgnoreCase)){throw 'Evidencia fuera de QA.'}
[IO.Directory]::CreateDirectory($evidence)|Out-Null
$script:passed=0
function Assert-Installer([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}; $script:passed++; "PASS $Message"}
function Probe-Installer($Request,[int]$Expected=0){
    $file=Join-Path $evidence ('request-'+[guid]::NewGuid().ToString('N')+'.json')
    [IO.File]::WriteAllText($file,($Request|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    $previousError=$ErrorActionPreference
    try {$ErrorActionPreference='Continue'; $result=& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'installer-driver.ps1') -RequestFile $file 2>(Join-Path $evidence 'probe-error.log'); $code=$LASTEXITCODE}
    finally {$ErrorActionPreference=$previousError}
    Assert-Installer ($code -eq $Expected) "Probe exit $Expected"
    if(-not $Expected){$result|ConvertFrom-Json}
}
$root=Join-Path $evidence 'installed'
$request=@{operation='Probe'; root=$root; qa=$true; silent=$true; uninstall=$false; version='0.0.977'; size=1024}
$result=@(Probe-Installer $request)[-1]
Assert-Installer ($result.root -ceq $root) 'Probe mantiene raíz QA explícita'
Assert-Installer (-not $result.desktop -and -not $result.autostart) 'Silent no añade escritorio ni autostart'
Assert-Installer (-not (Test-Path -LiteralPath $root)) 'Probe no crea instalación'
$request.silent=$false
$result=@(Probe-Installer $request)[-1]
Assert-Installer ($result.desktop -and -not $result.autostart) 'Interactivo usa escritorio ON y autostart OFF'
$request.root=$null; $null=Probe-Installer $request 1
$request.root=Join-Path $env:LOCALAPPDATA 'Programs/Vantare'; $null=Probe-Installer $request 1
$request.root=Join-Path $env:LOCALAPPDATA 'Programs/Vantare Native Beta'; $null=Probe-Installer $request 1
. (Join-Path $PSScriptRoot 'beta.ps1')
$qaKey='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBetaQA1492'
$qaFolder='Vantare QA1492'
$qaStart=Join-Path ([Environment]::GetFolderPath('Programs')) $qaFolder
$qaDesktop=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) ($qaFolder+'.lnk')
$qaBoot=Join-Path ([Environment]::GetFolderPath('Startup')) ($qaFolder+'.lnk')
foreach($path in @($qaKey,$qaStart,$qaDesktop,$qaBoot)){if(Test-Path -LiteralPath $path){throw 'Hay otra identidad QA; se conserva.'}}
$registrationRoot=Join-Path $evidence ('registration-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($registrationRoot)|Out-Null
[IO.File]::WriteAllText((Join-Path $registrationRoot '.vantare-native'),'offline-candidate-v1')
# Registration now targets a verified generation; materialize the real inventory
# with inert PE fixtures before exercising the shell. No app image is executed.
$payload=Join-Path $evidence ('payload-'+[guid]::NewGuid().ToString('N'))
foreach($member in (Get-NativeMembers 'beta')){
    $path=Join-Path $payload $member
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))|Out-Null
    if($member.EndsWith('.exe')){Copy-Item (Join-Path $env:WINDIR 'System32/cmd.exe') $path}
    elseif($member.EndsWith('.exe.sha256')){[IO.File]::WriteAllText($path,((Get-NativeHash $path.Substring(0,$path.Length-7))+'  '+[IO.Path]::GetFileName($path.Substring(0,$path.Length-7))+"`n"))}
    elseif($member -ceq 'candidate.ps1'){Copy-Item (Join-Path $PSScriptRoot 'candidate.ps1') $path}
    else{[IO.File]::WriteAllText($path,'inert shell fixture')}
}
$files=@(Get-NativeMembers 'beta'|ForEach-Object{$p=Join-Path $payload $_;@{path=$_;size=(Get-Item $p).Length;sha256=(Get-NativeHash $p)}})
Write-NativeJson (Join-Path $payload 'manifest.json') @{schema=1;product='vantare-native';candidate=$true;architecture='windows-x64';data_schema='opaque-v1';source_sha=('a'*40);source_dirty=$false;build_profile='Release';version='0.0.977';channel='beta';files=$files}
$zip=Join-Path $evidence ('package-'+[guid]::NewGuid().ToString('N')+'.zip')
New-NativeZip $payload $zip
Install-Beta $registrationRoot $zip (Get-NativeHash $zip)
[IO.File]::WriteAllText((Join-Path $registrationRoot 'registration-identity.txt'),'VantareNativeBetaQA1492')
# A real OS PE serves only as an inert shortcut/cleanup fixture; never execute it.
Copy-Item -LiteralPath (Join-Path $env:WINDIR 'System32/cmd.exe') -Destination (Join-Path $registrationRoot 'Uninstall.exe')
$ui=@{schema=1;kind='rust-gpui';uninstaller='Uninstall.exe';sha256=(Get-NativeHash (Join-Path $registrationRoot 'Uninstall.exe'));desktop=$true;autostart=$true}
Write-BetaJson (Join-Path $registrationRoot 'installer-ui.json') $ui
try {
    New-Item -Path $qaKey -Force|Out-Null
    foreach($entry in @{InstallLocation=$registrationRoot;ShortcutFolder=$qaFolder;LegacyShortcutFolder='Vantare Native Beta QA1492'}.GetEnumerator()){Set-ItemProperty -LiteralPath $qaKey -Name $entry.Key -Value $entry.Value}
    Sync-NativeRegistration $registrationRoot '0.0.977'
    $shell=New-Object -ComObject WScript.Shell
    $launch=$shell.CreateShortcut((Join-Path $qaStart 'Vantare.lnk'))
    $installed=Read-NativeState $registrationRoot
    Assert-Installer ($launch.TargetPath -eq (Join-Path $registrationRoot "generations/$($installed.active.generation)/bin/vantare.exe")) 'Inicio apunta al supervisor de la generación verificada'
    Assert-Installer ($launch.Arguments -ceq ('--beta -Root "'+$registrationRoot+'"')) 'Inicio pasa la raíz al bootstrap GUI'
    Assert-Installer ((Get-ItemProperty -LiteralPath $qaKey).UninstallString.Contains('Uninstall.exe')) 'Register conserva desinstalador propio'
    Assert-Installer ((($shell.CreateShortcut((Join-Path $qaStart 'Desinstalar.lnk'))).TargetPath) -eq (Join-Path $registrationRoot 'Uninstall.exe')) 'Inicio usa el mismo desinstalador'
    Assert-Installer ((Test-Path -LiteralPath $qaDesktop) -and (Test-Path -LiteralPath $qaBoot)) 'Opciones crean solo accesos QA'
    $previousUi=@{desktop=$true;autostart=$true}
    $ui.autostart=$false; Write-BetaJson (Join-Path $registrationRoot 'installer-ui.json') $ui
    Sync-NativeRegistration $registrationRoot '0.0.978' $previousUi
    Assert-Installer (-not (Test-Path -LiteralPath $qaBoot)) 'Desactivar autostart retira el acceso propio'
    Remove-Item -LiteralPath $qaDesktop
    $foreign=$shell.CreateShortcut($qaDesktop); $foreign.TargetPath=Join-Path $env:WINDIR 'notepad.exe'; $foreign.Save()
    $foreignHash=Get-NativeHash $qaDesktop
    $warnings=@(Sync-NativeRegistration $registrationRoot '0.0.978' 3>&1)
    Assert-Installer ($warnings.Count -gt 0 -and (Get-NativeHash $qaDesktop) -ceq $foreignHash) 'Colisión preserva acceso ajeno y avisa sin fallar registro'
    $ui.desktop=$false; Write-BetaJson (Join-Path $registrationRoot 'installer-ui.json') $ui
    Sync-NativeRegistration $registrationRoot '0.0.978'
    Assert-Installer ((Get-NativeHash $qaDesktop) -ceq $foreignHash) 'Opción OFF tampoco borra acceso ajeno'
    $data=Join-Path $registrationRoot 'generations/0123456789abcdef0123456789abcdef/data'
    [IO.Directory]::CreateDirectory($data)|Out-Null
    [IO.File]::WriteAllText((Join-Path $data 'profile.json'),'fixture opaca conservada')
    $dataHash=Get-NativeHash (Join-Path $data 'profile.json')
    Uninstall-NativeRegistration $registrationRoot $true
    Assert-Installer (-not (Test-Path -LiteralPath $qaKey) -and -not (Test-Path -LiteralPath $qaStart)) 'Desinstalar retira registro e Inicio propios'
    Assert-Installer ((Get-NativeHash $qaDesktop) -ceq $foreignHash) 'Desinstalar conserva acceso ajeno'
    Assert-Installer ((Get-NativeHash (Join-Path $data 'profile.json')) -ceq $dataHash) 'Desinstalar conserva bytes de data'
    Assert-Installer ((Test-Path -LiteralPath (Join-Path $registrationRoot 'Uninstall.exe')) -and (Test-Path -LiteralPath (Join-Path $registrationRoot 'installer-cleanup.json'))) 'Autoeliminación diferida conserva marker durable'
    $cleanTemp=Join-Path $env:TEMP ('VantareSetup-'+$PID+'-'+[DateTime]::UtcNow.Ticks+'-0')
    [IO.Directory]::CreateDirectory($cleanTemp)|Out-Null
    foreach($file in @('candidate.ps1','beta.ps1','installer-driver.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $cleanTemp $file)}
    $cleanRequest=Join-Path $cleanTemp 'request.json'
    [IO.File]::WriteAllText($cleanRequest,(@{operation='Cleanup';root=$registrationRoot;qa=$true;silent=$true;uninstall=$true;version='0.0.978';size=0;processId=2147483647}|ConvertTo-Json))
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $cleanTemp 'installer-driver.ps1') -RequestFile $cleanRequest | Out-Null
    Assert-Installer ($LASTEXITCODE -eq 0 -and -not (Test-Path -LiteralPath (Join-Path $registrationRoot 'Uninstall.exe'))) 'Helper elimina solo el exe esperado'
    Assert-Installer (-not (Test-Path -LiteralPath $cleanTemp) -and (Get-NativeHash (Join-Path $data 'profile.json')) -ceq $dataHash) 'Helper limpia su temporal y preserva datos'
    Write-NativeJson (Join-Path $registrationRoot 'state.json') @{schema=1;product='vantare-native';channel='beta';active=@{generation='0123456789abcdef0123456789abcdef'}}
    $request.root=$registrationRoot; $request.uninstall=$true; $request.silent=$true
    $interrupted=@(Probe-Installer $request)[-1]
    Assert-Installer ($interrupted.data_path -ceq $data) 'Probe permite reintentar uninstall sin manifest ya retirado'
} finally {
    if(Test-Path -LiteralPath $qaKey){Remove-Item -LiteralPath $qaKey}
    foreach($path in @($qaDesktop,$qaBoot)){if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path}}
    foreach($name in @('Vantare.lnk','Desinstalar.lnk')){$path=Join-Path $qaStart $name;if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path}}
    if((Test-Path -LiteralPath $qaStart) -and -not @(Get-ChildItem -LiteralPath $qaStart).Count){Remove-Item -LiteralPath $qaStart}
}
"$script:passed comprobaciones del shell PASS (registro con PE fixture, no install e2e)"
