# Lee imports PE con dumpbin; no ejecuta los binarios ni carga dispositivos.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Bin,[Parameter(Mandatory)][string]$Output,[switch]$SoloVisual)
$ErrorActionPreference='Stop'
$dump=(Get-Command dumpbin.exe -ErrorAction SilentlyContinue).Source
if(-not $dump){
 $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
 if(-not(Test-Path -LiteralPath $vswhere)){throw 'Falta dumpbin/vswhere instalado; no instalar nada'}
 $dump=@(& $vswhere -latest -products '*' -find 'VC/Tools/MSVC/*/bin/Hostx64/x64/dumpbin.exe')|Select-Object -First 1
}
if(-not $dump){throw 'No se localizó dumpbin instalado'}
$required=@('vantare-overlays-rune.exe','vantare-overlays.exe','vantare.exe')
if($SoloVisual){$required+=@('lifecycle.exe')}
else{$required+=@('lifecycle-harness.exe','lifecycle-rune-tests.exe','vantare-core.exe','vantare-services.exe','PresentMon-2.6.0-x64.exe')}
foreach($name in $required){
 if(-not(Test-Path -LiteralPath (Join-Path $Bin $name) -PathType Leaf)){throw "Falta binario para auditar: $name"}
}
if(Test-Path -LiteralPath $Output){throw 'La salida debe ser nueva'}
$null=New-Item -ItemType Directory -Path $Output
$rows=@();$missing=@()
foreach($image in Get-ChildItem -LiteralPath $Bin -File|Where-Object Extension -in @('.exe','.dll')){
 $lines=@(& $dump /dependents $image.FullName)
 if($LASTEXITCODE){throw "dumpbin falló: $($image.Name)"}
 $lines|Set-Content -LiteralPath (Join-Path $Output ($image.Name+'.txt')) -Encoding utf8
 $dependencies=@($lines|Where-Object {$_ -match '^\s+([a-zA-Z0-9_.-]+\.dll)\s*$'}|ForEach-Object {$_.Trim()})
 if($image.Extension -eq '.exe' -and -not $dependencies.Count){throw "No se reconocieron imports de $($image.Name); no declarar auditoría vacía"}
 foreach($name in $dependencies){
  $local=Test-Path -LiteralPath (Join-Path $Bin $name)
  $osContract=$name -imatch '^(api-ms-|ext-ms-)'
  $redistributable=$name -imatch '^(vcruntime|msvcp|concrt|duckdb)'
  $system=(-not $redistributable) -and (Test-Path -LiteralPath (Join-Path $env:windir "System32/$name"))
  $found=$local -or $osContract -or $system
  $rows+=@{image=$image.Name;dll=$name;packaged=$local;windows_contract=$osContract;system=$system;found=$found}
  if(-not $found){$missing+=($image.Name+':'+$name)}
 }
}
ConvertTo-Json -InputObject @{method='dumpbin /dependents, no execution';dependencies=$rows;missing=$missing;pass=($missing.Count -eq 0)} -Depth 10|Set-Content -LiteralPath (Join-Path $Output 'dll.json') -Encoding utf8
if($missing.Count){throw ('Faltan DLL empaquetadas: '+($missing -join ', '))}
'PASS: imports PE resueltos; CRT debe estar en el kit, nunca se supone instalado en el PC'
