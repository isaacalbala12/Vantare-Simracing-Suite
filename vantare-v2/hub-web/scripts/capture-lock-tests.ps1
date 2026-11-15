param([string]$EvidenceDirectory = 'D:\VantareServer\evidence\hub-web')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'capture-lock.ps1')
[IO.Directory]::CreateDirectory($EvidenceDirectory) | Out-Null
$probePath = Join-Path $EvidenceDirectory 'capture-slot-probe.ps1'
@'
param([string]$Mutex)
$m = [Threading.Mutex]::new($false, $Mutex)
if ($m.WaitOne(2000)) { 'acquired'; $m.ReleaseMutex() } else { 'blocked' }
'@ | Set-Content -LiteralPath $probePath -Encoding utf8
function Probe([string]$name) { (& pwsh -NoProfile -File $probePath -Mutex $name).Trim() }

$lease = Enter-HubCaptureTurn 'prueba-reserva-slots'
try {
    if (-not (Test-Path -LiteralPath 'D:\VantareServer\qa\captura.lock')) { throw 'No se creó el lock.' }
    $during0 = Probe 'Global\VantareCargoSlot0'
    $during1 = Probe 'Global\VantareCargoSlot1'
    if ($during0 -ne 'blocked' -or $during1 -ne 'blocked') {
        throw "Los slots no están reservados durante la captura: slot0=$during0 slot1=$during1"
    }
    Write-Output "PASS durante la captura: slot0=$during0 slot1=$during1"
} finally {
    Exit-HubCaptureTurn $lease
}
if (Test-Path -LiteralPath 'D:\VantareServer\qa\captura.lock') { throw 'El lock no se liberó.' }
$after0 = Probe 'Global\VantareCargoSlot0'
$after1 = Probe 'Global\VantareCargoSlot1'
if ($after0 -ne 'acquired' -or $after1 -ne 'acquired') {
    throw "Los slots no se liberaron: slot0=$after0 slot1=$after1"
}
Write-Output "PASS tras liberar: slot0=$after0 slot1=$after1"
'PASS: la captura reserva y libera los dos huecos de compilación.'
