# Gates con DuckDB oficial, sin desactivar defaults ajenos a storage.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('check', 'clippy', 'test', 'lifecycle')][string]$Gate,
    [string]$DuckDbDirectory = $env:DUCKDB_LIB_DIR
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $DuckDbDirectory) { throw 'Indica -DuckDbDirectory con la biblioteca oficial DuckDB 1.5.5.' }
$directory = (Resolve-Path -LiteralPath $DuckDbDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $directory 'duckdb.lib')) -or
    -not (Test-Path -LiteralPath (Join-Path $directory 'duckdb.dll'))) { throw 'Se necesitan duckdb.lib y duckdb.dll oficiales (Windows).' }
$previousDirectory = [Environment]::GetEnvironmentVariable('DUCKDB_LIB_DIR', 'Process')
$previousPath = $env:PATH
$previousTarget = [Environment]::GetEnvironmentVariable('CARGO_TARGET_DIR', 'Process')
Push-Location $PSScriptRoot
try {
    $env:DUCKDB_LIB_DIR = $directory
    $env:PATH = "$directory;$env:PATH"
    $env:CARGO_TARGET_DIR = Join-Path $PSScriptRoot 'target/gates'
    $json = & cargo metadata --locked --offline --no-deps --format-version 1
    if ($LASTEXITCODE) { throw 'No se pudo leer el workspace para conservar sus features por defecto.' }
    $metadata = $json | ConvertFrom-Json
    $members = @($metadata.packages | Where-Object { $_.id -cin $metadata.workspace_members })
    $storage = @($members | Where-Object name -CEQ 'vantare-storage')
    if ($storage.Count -ne 1 -or @($storage[0].features.default).Count -ne 1 -or
        $storage[0].features.default[0] -cne 'bundled-duckdb') { throw 'El default de storage cambió: revisar gates.ps1 antes de desactivar bundled-duckdb.' }
    # /default conserva también los defaults de crates futuros, aunque estén vacíos.
    $defaults = @($members | Where-Object { $_.name -cne 'vantare-storage' -and $null -ne $_.features.PSObject.Properties['default'] } |
        ForEach-Object { "$($_.name)/default" })
    $arguments = switch ($Gate) {
        'check' { @('check', '--workspace', '--all-targets') }
        'clippy' { @('clippy', '--workspace', '--all-targets') }
        'test' { @('nextest', 'run', '--workspace') }
        'lifecycle' { @('test', '--workspace', '--test', 'lifecycle') }
    }
    $arguments += @('--locked', '--offline', '-j', '2', '--no-default-features')
    if ($defaults.Count) { $arguments += @('--features', ($defaults -join ',')) }
    if ($Gate -eq 'clippy') { $arguments += @('--', '-D', 'warnings') }
    & cargo @arguments
    if ($LASTEXITCODE) { throw "Gate $Gate falló (código $LASTEXITCODE)." }
} finally {
    if ($null -eq $previousDirectory) { Remove-Item Env:DUCKDB_LIB_DIR -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('DUCKDB_LIB_DIR', $previousDirectory, 'Process') }
    $env:PATH = $previousPath
    if ($null -eq $previousTarget) { Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('CARGO_TARGET_DIR', $previousTarget, 'Process') }
    Pop-Location
}
