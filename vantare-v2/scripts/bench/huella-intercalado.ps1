# Campaña A0/A1 intercalada para frame time. Invoca huella.ps1 una vez por bloque
# (ABBA: A0 A1 A1 A0 A0 A1 ...) con el mismo LMU vivo, y compara A0 vs A1 con ruido A/A.
# ponytail: cada bloque reinicia la app Vantare (reutiliza todos los gates de huella.ps1);
# alternar el overlay en una sola sesión exigiría duplicar ese script.
[CmdletBinding()]
param(
    [string]$Exe = 'bin/vantare-isa924.exe',
    [string]$Perfil = 'testdata/bench/huella-endurance-3.json',
    [ValidateRange(2, 40)]
    [int]$Bloques = 6,
    [ValidateRange(1, 3600)]
    [int]$Duracion = 180,
    [ValidateRange(0, 60)]
    [int]$Calentamiento = 0,
    [ValidateRange(0, 600)]
    [int]$Pausa = 10,
    [ValidateRange(1024, 65535)]
    [int]$Puerto = 9247,
    [string]$Juego = 'Le Mans Ultimate',
    [string]$Escena = '',
    [string]$SesionLmu = '',
    [ValidateRange(0, 200)]
    [int]$Coches = 0,
    [string]$Salida = 'results',
    [switch]$Forzar,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'huella-intercalado.ps1 requiere PowerShell 7 o posterior.' }
if ($Bloques % 2) { throw '-Bloques debe ser par para que A0 y A1 tengan los mismos bloques.' }
if ($Bloques -lt 6) { Write-Warning 'Con menos de 6 bloques (3 por condición) el veredicto será INSUFICIENTE.' }

$benchDir = $PSScriptRoot
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $benchDir '..\..')).Path
$pwsh = (Get-Process -Id $PID).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$baseDir = if ([IO.Path]::IsPathRooted($Salida)) { $Salida } else { Join-Path $repoRoot $Salida }
$runDir = [IO.Path]::GetFullPath((Join-Path $baseDir "intercalado-$stamp"))

# ABBA: la deriva lenta de la escena cae por igual en A0 y A1.
$blocks = @(0..($Bloques - 1) | ForEach-Object {
    $condition = if ((($_ + 1) -shr 1) % 2 -eq 0) { 'A0' } else { 'A1' }
    [pscustomobject]@{ index = $_ + 1; condition = $condition; dir = Join-Path $runDir ('b{0:D2}-{1}' -f ($_ + 1), $condition.ToLowerInvariant()) }
})

function Invoke-Block([string]$Condition, [string]$Dir, [switch]$Plan) {
    $arguments = @('-NoProfile', '-File', (Join-Path $benchDir 'huella.ps1'), '-Condicion', $Condition, '-Exe', $Exe, '-Perfil', $Perfil,
        '-Duracion', $Duracion, '-Calentamiento', $Calentamiento, '-Puerto', $Puerto, '-Juego', $Juego,
        '-Escena', $Escena, '-SesionLmu', $SesionLmu, '-Coches', $Coches, '-Salida', $Dir)
    if ($Forzar) { $arguments += '-Forzar' }
    if ($Plan) { $arguments += '-DryRun' }
    & $pwsh @arguments
    if ($LASTEXITCODE -ne 0) { throw "huella.ps1 falló en $Condition (código $LASTEXITCODE)." }
}

if ($DryRun) {
    [ordered]@{
        schema = 'vantare.huella.intercalado.dry-run.v1'; blocks = $blocks; durationSecondsPerBlock = $Duracion
        pauseSeconds = $Pausa; outputDirectory = $runDir; game = $Juego
    } | ConvertTo-Json -Depth 4
    foreach ($condition in 'A0', 'A1') { Invoke-Block $condition (Join-Path $runDir "dry-$condition") -Plan }
    exit 0
}

$game = Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($Juego)) -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $game) { throw "No se encontró el juego '$Juego'; la campaña exige la misma sesión de juego viva." }
$gameStart = $game.StartTime

$csvs = foreach ($block in $blocks) {
    $current = Get-Process -Id $game.Id -ErrorAction SilentlyContinue
    if (-not $current -or $current.StartTime -ne $gameStart) { throw "El juego se reinició antes del bloque $($block.index); la campaña deja de ser de una sola sesión." }
    Write-Host "=== Bloque $($block.index)/$Bloques · $($block.condition) ===" -ForegroundColor Cyan
    Invoke-Block $block.condition $block.dir
    $blockCsv = @(Get-ChildItem -LiteralPath $block.dir -Filter '*.csv' | Where-Object Name -match '^a[01]-\d{8}-\d{6}\.csv$')
    if ($blockCsv.Count -ne 1) { throw "El bloque $($block.index) no dejó exactamente un CSV combinado en $($block.dir)." }
    $blockCsv[0].FullName
    if ($block.index -lt $Bloques -and $Pausa -gt 0) { Start-Sleep -Seconds $Pausa }
}

$summary = Join-Path $runDir 'intercalado.md'
& node (Join-Path $benchDir 'huella-resumen.mjs') --compare A0,A1 --same-build --output $summary @csvs | Out-Null
if ($LASTEXITCODE -ne 0) { throw "El resumen A0/A1 falló con código $LASTEXITCODE." }
Write-Host "Resumen A0 vs A1: $summary"
