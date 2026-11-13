# Solo construye y empaqueta. Nunca inicia Electron, ni siquiera --version.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ArtifactDirectory,
    [string]$Bun = 'D:\VantareServer\tools\bun-1.4.4\bun-windows-x64\bun.exe'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (Test-Path -LiteralPath 'D:\VantareServer\qa\captura.lock') { throw 'Captura activa: no iniciar empaquetado.' }
if (-not $env:VANTARE_CARGO_QUEUE_OWNER -or -not $env:CARGO_TARGET_DIR) { throw 'Usar la cola actual de nightly.' }
if ((Get-PSDrive C).Free -lt 8GB -or (Get-PSDrive D).Free -lt 40GB) { throw 'No se cumplen los minimos de disco.' }
$repo = [IO.Path]::GetFullPath((& git -C $PSScriptRoot rev-parse --show-toplevel).Trim())
if ($LASTEXITCODE) { throw 'No se encontro el worktree.' }
if (@(& git -C $repo status --porcelain).Count) { throw 'Commit antes de construir el paquete.' }
$sha = (& git -C $repo rev-parse HEAD).Trim()
$hub = [IO.Path]::GetFullPath((Join-Path $repo 'vantare-v2/hub-web'))
if ([IO.Path]::GetFullPath($hub) -notlike 'D:\VantareServer\worktrees\*') { throw 'El Hub debe estar en un worktree propio en D:.' }
foreach ($relative in @('release','release/staging-qa','release/package-qa','release/package-qa/vantare-hub-ui-win32-x64','out-qa')) {
    $path = [IO.Path]::GetFullPath((Join-Path $hub $relative))
    if (-not $path.StartsWith($hub + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Salida fuera del worktree.' }
    if (Test-Path -LiteralPath $path) {
        if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'No sobrescribir salidas que sean enlaces.' }
    }
}
$out = [IO.Path]::GetFullPath($ArtifactDirectory)
if (Test-Path -LiteralPath $out) { throw 'La entrega debe usar una carpeta nueva.' }
$env:BUN_INSTALL_CACHE_DIR = 'D:\VantareServer\cache\bun'
$env:ELECTRON_CACHE = 'D:\VantareServer\cache\electron'
$env:electron_config_cache = $env:ELECTRON_CACHE
$env:TEMP = Join-Path $env:CARGO_TARGET_DIR 'hub-build-tmp'
$env:TMP = $env:TEMP
$null = New-Item -ItemType Directory -Path $env:TEMP -Force
$env:VANTARE_HUB_QA_BUILD = '1'
$env:VANTARE_HUB_MEASUREMENT_HOME = '1'
$watch = [Diagnostics.Stopwatch]::StartNew()
Push-Location $hub
try {
    # electron-vite 6 build without bytecode only runs Vite. Its source was
    # inspected: startElectron belongs to dev/preview; BytecodeCompiler.start
    # is conditional on bytecode, absent from this configuration.
    & $Bun run typecheck
    if ($LASTEXITCODE) { throw "Tipos del Hub fallaron: $LASTEXITCODE" }
    & $Bun run typecheck:scripts
    if ($LASTEXITCODE) { throw "Tipos de scripts fallaron: $LASTEXITCODE" }
    & $Bun run build
    if ($LASTEXITCODE) { throw "Build del Hub fallo: $LASTEXITCODE" }
    & $Bun run package
    if ($LASTEXITCODE) { throw "Empaquetado del Hub fallo: $LASTEXITCODE" }
} finally { Pop-Location }
$watch.Stop()
$package = Join-Path $hub 'release/package-qa/vantare-hub-ui-win32-x64'
$binary = Join-Path $package 'vantare-hub-ui.exe'
if (-not (Test-Path -LiteralPath $binary)) { throw 'No aparece el ejecutable empaquetado.' }
$description = (Get-Item -LiteralPath $binary).VersionInfo.FileDescription
if (-not $description.Contains("sha=$sha;dirty=false;profile=release")) { throw 'Falta la procedencia dentro del PE.' }
if (@(& git -C $repo status --porcelain).Count) { throw 'La construccion cambio archivos fuente.' }
$null = New-Item -ItemType Directory -Path $out
Copy-Item -LiteralPath $package -Destination (Join-Path $out 'hub-electron') -Recurse
$files = @(Get-ChildItem -LiteralPath (Join-Path $out 'hub-electron') -File -Recurse)
$inventory = @($files | ForEach-Object {
    [ordered]@{path=[IO.Path]::GetRelativePath($out,$_.FullName);bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
})
$inventory | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out 'archivos.json') -Encoding utf8
[ordered]@{
    source=$sha;variant='A-Electron';profile='release';electron='45.2.3';mock=$true;home=$true
    scene='visual-dark:inicio-base';elapsed_s=$watch.Elapsed.TotalSeconds
    bytes=($files | Measure-Object Length -Sum).Sum;provenance=$description
    graphics_executed=$false;smoke='pendiente PC';compilation_comparison='pendiente autorizado por Isaac'
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'construccion.json') -Encoding utf8
Write-Output "Hub mock empaquetado sin ejecutarlo: $out"
