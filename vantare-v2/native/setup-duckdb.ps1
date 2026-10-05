# Biblioteca oficial compartida por los worktrees del usuario; sin tocar el sistema.
[CmdletBinding()]
param(
    [string]$Destination = (Join-Path $env:LOCALAPPDATA 'Vantare/duckdb-1.5.5'),
    [string]$ArchivePath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$expected = '8375EB1FCF2212E8A0817950354815D4DDE9DD383C2D9FA7B8975B71E278C1BD'
$downloaded = -not $ArchivePath
if ($downloaded) { $ArchivePath = Join-Path ([IO.Path]::GetTempPath()) ('vantare-duckdb-' + [guid]::NewGuid().ToString('N') + '.zip') }
try {
    if ($downloaded) {
        Invoke-WebRequest -Uri 'https://github.com/duckdb/duckdb/releases/download/v1.5.5/libduckdb-windows-amd64.zip' -OutFile $ArchivePath
    }
    if ((Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash -cne $expected) {
        throw [IO.InvalidDataException]::new('SHA-256 incorrecto: no se instala DuckDB.')
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ArchivePath).Path)
    try {
        $names = @('duckdb.lib', 'duckdb.dll')
        foreach ($name in $names) { if (-not $zip.GetEntry($name)) { throw "Archivo oficial sin $name." } }
        $directory = [IO.Path]::GetFullPath($Destination)
        [IO.Directory]::CreateDirectory($directory) | Out-Null
        foreach ($name in $names) { [IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry($name), (Join-Path $directory $name), $true) }
        "DuckDB 1.5.5 listo: $directory"
    } finally { $zip.Dispose() }
} finally {
    if ($downloaded -and (Test-Path -LiteralPath $ArchivePath)) { Remove-Item -LiteralPath $ArchivePath }
}
