param([Parameter(Mandatory)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'candidate.ps1')
$directory = [IO.Path]::GetFullPath($EvidenceDirectory)
$previous = [Environment]::GetEnvironmentVariable('DUCKDB_LIB_DIR', 'Process')
try {
    $env:DUCKDB_LIB_DIR = 'public-library-fixture'
    $rejected = $false
    try { Build-NativeCandidate '' 'invalid' 'nightly' 'Release' $false | Out-Null }
    catch [InvalidOperationException] { $rejected = $true }
    if (-not $rejected) { throw 'Candidate no rechazó el entorno DuckDB de desarrollo antes del build.' }
    $rejected = $false
    try { & (Join-Path $PSScriptRoot 'msix/build.ps1') -OutputDirectory $directory -Version 'invalid' | Out-Null }
    catch [InvalidOperationException] { $rejected = $true }
    if (-not $rejected) { throw 'MSIX no rechazó el entorno DuckDB de desarrollo antes del build.' }
    if (Test-Path -LiteralPath $directory) { throw 'Un rechazo creó salida de empaquetado.' }
    '2 guardas de build PASS; sin crear artefactos.'
} finally {
    if ($null -eq $previous) { Remove-Item Env:DUCKDB_LIB_DIR -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('DUCKDB_LIB_DIR', $previous, 'Process') }
}
