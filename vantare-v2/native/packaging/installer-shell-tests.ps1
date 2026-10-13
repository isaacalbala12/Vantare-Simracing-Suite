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
"$script:passed comprobaciones del shell PASS"
