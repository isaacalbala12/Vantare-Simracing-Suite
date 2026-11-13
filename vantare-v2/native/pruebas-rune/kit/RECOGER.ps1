# No inicia las variantes ni necesita herramientas de desarrollo.
#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Resultados,
    [string]$Destino
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = [IO.Path]::GetFullPath($Resultados).TrimEnd([IO.Path]::DirectorySeparatorChar)
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw 'No existe la carpeta de resultados.' }
if ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Resultados no puede ser un enlace.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'campana.json') -PathType Leaf)) { throw 'Falta campana.json; elige la carpeta concreta de esta campaña.' }
if (Test-Path -LiteralPath (Join-Path $root 'EN-CURSO.lock')) { throw 'La campaña sigue en curso. Ciérrala antes de recoger.' }
if (-not $Destino) { $Destino = $root + '-recogida-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '.zip' }
$out = [IO.Path]::GetFullPath($Destino)
if ([IO.Path]::GetExtension($out) -ne '.zip' -or $out.StartsWith($root + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'El zip debe quedar fuera de resultados y terminar en .zip.'
}
if (Test-Path -LiteralPath $out) { throw 'El destino ya existe. No se sobrescriben recogidas.' }
$entries = @(Get-ChildItem -LiteralPath $root -Recurse -Force)
if (@($entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'No se siguen enlaces dentro de resultados.' }
$files = @($entries | Where-Object { -not $_.PSIsContainer })
if (@($files | Where-Object { $_.Name -like '.env*' }).Count) { throw 'Se encontró un archivo .env: no se recoge.' }
$inventory = @($files | Sort-Object FullName | ForEach-Object {
    [ordered]@{path=[IO.Path]::GetRelativePath($root,$_.FullName).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
})
# CreateNew reserva el nombre: no existe ventana entre comprobarlo y crearlo.
$stream = [IO.File]::Open($out,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$archive = $null
try {
    $archive = [IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$true)
    foreach ($item in $inventory) {
        $path = Join-Path $root $item.path
        $entry = $archive.CreateEntry('resultados/' + $item.path,[IO.Compression.CompressionLevel]::Optimal)
        $source = [IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
        $target = $entry.Open()
        try { $source.CopyTo($target) } finally { $target.Dispose(); $source.Dispose() }
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256) { throw "Cambió un archivo durante la recogida: $($item.path)" }
    }
    $entry = $archive.CreateEntry('RECOGIDA.json')
    $writer = [IO.StreamWriter]::new($entry.Open(),[Text.UTF8Encoding]::new($false))
    try {
        $writer.Write(([ordered]@{schema=1;collected_utc=[DateTime]::UtcNow.ToString('o');files=$inventory;includes_failed_attempts=$true;graphics_executed=$false} | ConvertTo-Json -Depth 6))
    } finally { $writer.Dispose() }
} catch {
    # Conserva el parcial y el error; nunca lo anuncia como una recogida válida.
    $_ | Out-String | Set-Content -LiteralPath ($out + '.INVALIDA.txt') -Encoding utf8
    throw
} finally {
    if ($archive) { $archive.Dispose() }
    $stream.Dispose()
}
$check = [IO.Compression.ZipFile]::OpenRead($out)
try {
    foreach ($item in $inventory) {
        $entry = $check.GetEntry('resultados/' + $item.path)
        if (-not $entry -or $entry.Length -ne $item.bytes) { throw 'El zip no reproduce todos los archivos.' }
        $input = $entry.Open()
        try { $digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($input)).ToLowerInvariant() } finally { $input.Dispose() }
        if ($digest -ne $item.sha256) { throw "Hash del zip incorrecto: $($item.path)" }
    }
} finally { $check.Dispose() }
$hash = (Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output "Recogida verificada: $out"
Write-Output "SHA256 $hash"
