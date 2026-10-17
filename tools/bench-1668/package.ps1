param([string]$Destination='C:/VantareServer/share/kit-bench',
 [string]$Bench='C:/VantareServer/bench',
 [string]$Release='C:/VantareServer/targets/isa-1668/release')
$ErrorActionPreference='Stop'
foreach($name in @('INICIAR.ps1','sample.ps1','ANALIZAR.ps1')){
 $tokens=$null;$parseErrors=$null
 $null=[Management.Automation.Language.Parser]::ParseFile("$PSScriptRoot/$name",[ref]$tokens,[ref]$parseErrors)
 if($parseErrors){throw "Sintaxis inválida en ${name}: $parseErrors"}
}
New-Item -ItemType Directory -Force $Destination,"$Destination/Vantare","$Destination/config","$Destination/licenses","$Destination/source" | Out-Null
foreach($name in @('vantare.exe','vantare-core.exe','vantare-overlays.exe')){
 Copy-Item -LiteralPath "$Release/$name" -Destination "$Destination/Vantare/$name"
}
foreach($name in @('INICIAR.ps1','sample.ps1','ANALIZAR.ps1')){
 # PS 5.1 uses ANSI for scripts without BOM; package UTF-8 BOM for Spanish messages.
 [IO.File]::WriteAllText("$Destination/$name",[IO.File]::ReadAllText("$PSScriptRoot/$name"),(New-Object Text.UTF8Encoding($true)))
}
foreach($name in @('INICIAR.cmd','analyze_zip.py','summarize.py')){Copy-Item -LiteralPath "$PSScriptRoot/$name" -Destination "$Destination/$name"}
Copy-Item "$PSScriptRoot/README-KIT.txt" "$Destination/README.txt"
Copy-Item "$Bench/PresentMon-2.6.0-x64.exe" "$Destination/PresentMon.exe"
Copy-Item "$Bench/TinyPedal-2.51.0-windows.zip" "$Destination/TinyPedal-2.51.0-windows.zip"
Copy-Item "$Bench/TinyPedal-source.zip" "$Destination/source/TinyPedal-2.51.0-source.zip"
Copy-Item "$Bench/TinyPedal-2.51.0/TinyPedal/LICENSE.txt" "$Destination/licenses/TinyPedal-GPL-3.0.txt"
Copy-Item "$Bench/vantare-layout.json" "$Destination/config/vantare-layout.json"
Copy-Item "$Bench/TinyPedal-2.51.0/TinyPedal/settings/default.json" "$Destination/config/tinypedal-settings.json"
Invoke-WebRequest https://raw.githubusercontent.com/GameTechDev/PresentMon/v2.6.0/LICENSE.txt -OutFile "$Destination/licenses/PresentMon-LICENSE.txt"
$notice=@'
Kit privado de medición VANTA-89 / GitHub #1668 para el PC de Isaac.
Vantare 0.0.0: Release propia, fuente origin/nightly ed66924c29299d78cb78a0125ecb5e2ab83ef049; no publicar estos binarios.
PresentMon 2.6.0: ejecutable oficial, licencia y avisos en licenses/PresentMon-LICENSE.txt.
TinyPedal 2.51.0: ZIP oficial intacto, GPL-3.0, licencia incluida y snapshot fuente en source/.
Fuente y submódulos oficiales: https://github.com/TinyPedal/TinyPedal/tree/v2.51.0; cada dependencia conserva su licencia.
RaceLab no se incluye ni se analiza internamente: descarga/instala desde https://racelab.app/.
Plugin LMU y requisitos oficiales RaceLab: https://garage.racelab.app/docs/first-steps/lmu/.
No se crean cuentas, no se compran planes ni se gestionan credenciales desde el kit.
El PC de juego no necesita Python; el análisis posterior en servidor necesita Python 3.11+ y ninguna librería externa.
Los ZIP de resultados contienen tiempos, contadores, nombres de procesos, hardware y ajustes declarados; no capturas ni variables de entorno.
'@
[IO.File]::WriteAllText("$Destination/PROCEDENCIA.txt",$notice,(New-Object Text.UTF8Encoding($true)))
$manifest=@(Get-ChildItem $Destination -Recurse -File | Where-Object {$_.Name -ne 'package-manifest.json' -and $_.FullName -notmatch '[\\/]resultados-'} | ForEach-Object {
 @{file=$_.FullName.Substring($Destination.Length).TrimStart('\','/').Replace('\','/');sha256=(Get-FileHash $_.FullName).Hash}
})
$manifest | ConvertTo-Json | Set-Content "$Destination/package-manifest.json" -Encoding UTF8
& "$Destination/INICIAR.ps1" -CheckOnly
