$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Join-Path ([IO.Path]::GetTempPath()) ('vanta141-recogida-' + [guid]::NewGuid().ToString('N'))
$results = Join-Path $root 'campana'
$null = New-Item -ItemType Directory -Path (Join-Path $results 'intento-fallido')
'{"schema":1,"synthetic":true}' | Set-Content (Join-Path $results 'campana.json')
'evidencia del fallo, sin ejecución gráfica' | Set-Content (Join-Path $results 'intento-fallido/INVALIDA.txt')
[IO.File]::WriteAllBytes((Join-Path $results 'datos.bin'),[byte[]](0,1,127,128,255))
$zip = Join-Path $root 'recogida.zip'
function MustThrow([scriptblock]$Action) {
    $failed = $false
    try { & $Action | Out-Null } catch { $failed = $true }
    if (-not $failed) { throw 'Se aceptó una recogida insegura.' }
}
& (Join-Path $PSScriptRoot 'RECOGER.ps1') -Resultados $results -Destino $zip
$original = (Get-FileHash -LiteralPath $zip).Hash
MustThrow { & (Join-Path $PSScriptRoot 'RECOGER.ps1') -Resultados $results -Destino $zip }
if ((Get-FileHash -LiteralPath $zip).Hash -ne $original) { throw 'Se cambió un zip existente.' }
$archive = [IO.Compression.ZipFile]::OpenRead($zip)
try {
    if ($archive.Entries.Count -ne 4 -or -not $archive.GetEntry('resultados/intento-fallido/INVALIDA.txt')) { throw 'Se perdió evidencia del fallo.' }
    $reader = [IO.StreamReader]::new($archive.GetEntry('RECOGIDA.json').Open())
    try { $inventory = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($inventory.files.Count -ne 3 -or -not $inventory.includes_failed_attempts) { throw 'Inventario incompleto.' }
} finally { $archive.Dispose() }
$nested = Join-Path $results 'aguante/rune'
$null = New-Item -ItemType Directory -Path $nested
'activo' | Set-Content (Join-Path $nested 'EN-CURSO.lock')
MustThrow { & (Join-Path $PSScriptRoot 'RECOGER.ps1') -Resultados $results -Destino (Join-Path $root 'aguante-activo.zip') }
Remove-Item -LiteralPath (Join-Path $nested 'EN-CURSO.lock')
'activo' | Set-Content (Join-Path $results 'EN-CURSO.lock')
MustThrow { & (Join-Path $PSScriptRoot 'RECOGER.ps1') -Resultados $results -Destino (Join-Path $root 'activo.zip') }
MustThrow { & (Join-Path $PSScriptRoot 'RECOGER.ps1') -Resultados $root -Destino (Join-Path $root 'sin-marca.zip') }
Write-Output "PASS: zip fiel, fallo conservado, sobrescritura y campaña activa rechazadas. Evidencia sintética: $root"
