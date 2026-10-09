# Gates con DuckDB oficial, sin desactivar defaults ajenos a storage.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('check', 'clippy', 'test', 'telemetria', 'lifecycle', 'prueba')][string]$Gate,
    [string]$DuckDbDirectory = $env:DUCKDB_LIB_DIR,
    [string]$BuildConfig
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($Gate -eq 'prueba' -and -not $BuildConfig) { throw 'Prueba exige -BuildConfig con la configuración pública real.' }
if ($BuildConfig -and $Gate -ne 'prueba') { throw '-BuildConfig solo se aplica al build prueba.' }
if ($BuildConfig) { $BuildConfig = (Resolve-Path -LiteralPath $BuildConfig).Path }
if (-not $DuckDbDirectory) { $DuckDbDirectory = Join-Path $env:LOCALAPPDATA 'Vantare/duckdb-1.5.5' }
if (-not (Test-Path -LiteralPath $DuckDbDirectory)) { throw 'Ejecuta .\setup-duckdb.ps1 una vez para instalar DuckDB 1.5.5.' }
$directory = (Resolve-Path -LiteralPath $DuckDbDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $directory 'duckdb.lib')) -or
    -not (Test-Path -LiteralPath (Join-Path $directory 'duckdb.dll'))) { throw 'Se necesitan duckdb.lib y duckdb.dll oficiales (Windows).' }
$previousDirectory = [Environment]::GetEnvironmentVariable('DUCKDB_LIB_DIR', 'Process')
$previousPath = $env:PATH
$previousTarget = [Environment]::GetEnvironmentVariable('CARGO_TARGET_DIR', 'Process')
$previousIncremental = [Environment]::GetEnvironmentVariable('CARGO_INCREMENTAL', 'Process')
$previousConfig = $null
Push-Location $PSScriptRoot
try {
    $env:DUCKDB_LIB_DIR = $directory
    $env:PATH = "$directory;$env:PATH"
    # Ruta relativa estable: sccache incluye CARGO_TARGET_DIR en su clave.
    $env:CARGO_TARGET_DIR = 'target/gates'
    if ($Gate -eq 'prueba') {
        . (Join-Path $PSScriptRoot 'packaging/build-config.ps1')
        $previousConfig = Import-NativeBuildConfig $BuildConfig
        # Respeta incremental propio y no incremental de deps definidos en el perfil.
        Remove-Item Env:CARGO_INCREMENTAL -ErrorAction SilentlyContinue
    }
    $json = & cargo metadata --locked --offline --no-deps --format-version 1
    if ($LASTEXITCODE) { throw 'No se pudo leer el workspace para conservar sus features por defecto.' }
    $metadata = $json | ConvertFrom-Json
    $members = @($metadata.packages | Where-Object { $_.id -cin $metadata.workspace_members })
    $storage = @($members | Where-Object name -CEQ 'vantare-storage')
    if ($storage.Count -ne 1 -or @($storage[0].features.default).Count -ne 1 -or
        $storage[0].features.default[0] -cne 'bundled-duckdb') { throw 'El default de storage cambió: revisar gates.ps1 antes de desactivar bundled-duckdb.' }
    # /default conserva también los defaults de crates futuros, aunque estén vacíos.
    $defaults = @($members | Where-Object { $_.name -cne 'vantare-storage' -and
        ($Gate -ne 'prueba' -or $_.name -cne 'vantare-admin') -and $null -ne $_.features.PSObject.Properties['default'] } |
        ForEach-Object { "$($_.name)/default" })
    $arguments = switch ($Gate) {
        'check' { @('check', '--workspace', '--all-targets') }
        'clippy' { @('clippy', '--workspace', '--all-targets') }
        'test' { @('nextest', 'run', '--workspace') }
        'telemetria' { @('nextest', 'run', '--workspace', '--profile', 'telemetria') }
        'lifecycle' { @('test', '--workspace', '--test', 'lifecycle') }
        'prueba' { @('build', '--workspace', '--exclude', 'vantare-admin', '--bins', '--profile', 'prueba') }
    }
    $arguments += @('--locked', '--offline', '-j', '2', '--no-default-features')
    if ($defaults.Count) { $arguments += @('--features', ($defaults -join ',')) }
    if ($Gate -eq 'clippy') { $arguments += @('--', '-D', 'warnings') }
    & cargo @arguments
    if ($LASTEXITCODE) { throw "Gate $Gate falló (código $LASTEXITCODE)." }
    if ($Gate -eq 'prueba') {
        Copy-Item -LiteralPath (Join-Path $directory 'duckdb.dll') -Destination 'target/gates/prueba/duckdb.dll' -Force
        'Binarios públicos de prueba en native/target/gates/prueba; no distribuir ni medir rendimiento con este perfil.'
    }
} finally {
    if ($null -ne $previousConfig) { Restore-NativeBuildConfig $previousConfig }
    if ($null -eq $previousIncremental) { Remove-Item Env:CARGO_INCREMENTAL -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('CARGO_INCREMENTAL', $previousIncremental, 'Process') }
    if ($null -eq $previousDirectory) { Remove-Item Env:DUCKDB_LIB_DIR -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('DUCKDB_LIB_DIR', $previousDirectory, 'Process') }
    $env:PATH = $previousPath
    if ($null -eq $previousTarget) { Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('CARGO_TARGET_DIR', $previousTarget, 'Process') }
    Pop-Location
}
