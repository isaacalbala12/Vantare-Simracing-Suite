# Fixture del proceso Rune REAL. Invocar mediante native/scripts/compilar.ps1.
# Solo compila y copia: nunca ejecuta el motor ni cambia el guard de gráficos.
param([string]$TargetDirectory = $env:VANTARE_SLOT_TARGET)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $env:VANTARE_SLOT_TARGET) { throw 'Invocar por compilar.ps1.' }
if (Test-Path -LiteralPath 'D:\VantareServer\qa\captura.lock') { throw 'Captura en marcha; no compilar Rune.' }
$nativeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$target = [IO.Path]::GetFullPath($TargetDirectory)
if ($target -ne [IO.Path]::GetFullPath($env:VANTARE_SLOT_TARGET)) { throw 'Usar el target de la ranura adquirida.' }
$minimum = if ($env:RUNNER_ENVIRONMENT -eq 'github-hosted') { 2GB } else { 15GB }
if ($target.StartsWith('D:', [StringComparison]::OrdinalIgnoreCase) -and
    (Get-PSDrive D).Free -lt $minimum) { throw "D: menos de $($minimum / 1GB) GB libres; no se borra nada." }
Push-Location (Join-Path $nativeRoot 'overlays-rune')
try {
    & cargo build --bin vantare-overlays-rune --target-dir $target --locked --offline --jobs 2
    if ($LASTEXITCODE) { throw 'No se pudo compilar el fixture Rune.' }
    $directory = Join-Path $target 'debug/lifecycle/rune'
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $image = Join-Path $directory 'vantare-overlays-rune.exe'
    Copy-Item -LiteralPath (Join-Path $target 'debug/vantare-overlays-rune.exe') -Destination $image -Force
    $artifact = [ordered]@{variant='rune';image=$image;sha256=(Get-FileHash -LiteralPath $image -Algorithm SHA256).Hash}
    [IO.File]::WriteAllText((Join-Path $directory 'artifact.json'), ($artifact | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    Write-Host "Fixture preparado: VANTARE_RUNE_OVERLAYS_EXE=$image"
} finally { Pop-Location }
