# Navegación espacial de este SHA, revisada a 1440x900/DPI96.
# Requiere un Hub ya abierto con directorios de datos aislados y vacíos.
param(
    [Parameter(Mandatory)][int]$HubProcessId,
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$EvidenceDirectory
)
$ErrorActionPreference = 'Stop'
function Capture([string]$Name, [int]$X = -1, [int]$Y = -1, [int]$Wheel = 0, [string]$Keys = '') {
    & "$PSScriptRoot/capture-window.ps1" -ProcessId $HubProcessId -ExpectedExecutable $Executable `
        -OutputPath (Join-Path $EvidenceDirectory "$Name.png") -X $X -Y $Y -WheelSteps $Wheel -Keys $Keys
}
$sections = @('inicio','workshop','studio','launcher','calendario','strategy','engineer',
    'telemetria','testing-center','roadmap','cuenta','licencias','notificaciones','ajustes')
for ($i = 0; $i -lt $sections.Count; $i++) {
    if ($sections[$i] -eq 'strategy') { continue } # Strategy v5 se captura con compare.ps1.
    Capture "$($sections[$i])-base" 100 (121+57*$i)
}
Capture 'inicio-sin-paleta' 100 121 0 '^k'
Capture 'studio-base' 100 235
Capture 'studio-widget-anadido' 1320 400
Capture 'studio-seleccion' 1000 780 6
Capture 'workshop-detalle' 100 178
Capture 'workshop-catalogo' 1000 780 8
Capture 'launcher-base' 100 292
Capture 'launcher-nuevo-perfil' 555 458
Capture 'engineer-base' 100 463
Capture 'engineer-detalle' 1000 780 8
Capture 'testing-center-informe' 100 577
Capture 'testing-center-diagnostico' 475 322
Capture 'testing-center-diagnostico-en-curso' 625 322
Start-Sleep -Seconds 3
Capture 'testing-center-diagnostico-preparado'
# No lanza procesos ni cierra ventanas ajenas. El operador cierra su Hub al acabar.
