param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'slot-workspace.ps1')
$root = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) ('slot-workspace-' + [guid]::NewGuid().ToString('N'))
$slot = Join-Path $root 'slot-0'
[IO.Directory]::CreateDirectory((Join-Path $slot 'tmp')) | Out-Null
[IO.File]::WriteAllText((Join-Path $slot '.vantare-last-build'), 'queue stamp')
function cargo { throw 'El workspace del slot no debe invocar cargo en este caso.' }
$native = Split-Path $PSScriptRoot
$junction = Set-VantareSlotWorkspace -Target $slot -NativeRoot $native
$expected = Join-Path $root 'slot-workspaces/slot-0'
if ($junction -cne $expected) { throw "Junction inesperada: $junction" }
if (-not (Test-Path -LiteralPath $junction)) { throw 'No se creó el enlace del workspace del slot.' }
$item = Get-Item -LiteralPath $junction -Force
if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'El workspace del slot no es un enlace.' }
$repo = Split-Path (Split-Path $native)
if ([IO.Path]::GetFullPath(@($item.Target)[0]).TrimEnd('\', '/') -ine $repo.TrimEnd('\', '/')) {
    throw "El enlace no apunta al checkout: $($item.Target)"
}
if (Test-Path -LiteralPath (Join-Path $slot 'CACHEDIR.TAG')) { throw 'No inventar el tag de Cargo.' }
$stamp = Join-Path $slot '.vantare-workspace'
if (-not (Test-Path -LiteralPath $stamp)) { throw 'Falta el sello del checkout.' }
if (((Get-Content -LiteralPath $stamp -Raw | ConvertFrom-Json).native) -ine $native) {
    throw 'El sello no registra el checkout actual.'
}

# El mismo checkout no vuelve a comparar ni limpia paquetes.
$again = Set-VantareSlotWorkspace -Target $slot -NativeRoot $native
if ($again -cne $junction) { throw 'El enlace cambió con el mismo checkout.' }

# Un target explícito (mediciones) conserva su ruta real, aunque el gate escriba
# evidencia junto al build y no haya CACHEDIR.TAG.
$explicit = Join-Path $root 'medicion-g'
[IO.Directory]::CreateDirectory($explicit) | Out-Null
[IO.File]::WriteAllText((Join-Path $explicit 'distribution.json'), '{}')
if (Set-VantareSlotWorkspace -Target $explicit -NativeRoot $native) { throw 'Un target explícito no debe tener enlace.' }
if (Test-Path -LiteralPath (Join-Path $root 'slot-workspaces/medicion-g')) { throw 'Se creó un enlace para un target explícito.' }

# Contenido desconocido sin CACHEDIR.TAG se rechaza sin borrar nada (slot real).
$foreign = Join-Path $root 'slot-1'
[IO.Directory]::CreateDirectory($foreign) | Out-Null
[IO.File]::WriteAllText((Join-Path $foreign 'foreign.txt'), 'preserve')
$rejected = $false
try { Set-VantareSlotWorkspace -Target $foreign -NativeRoot $native | Out-Null }
catch { $rejected = $_.Exception.Message -like '*contenido desconocido*' }
if (-not $rejected -or -not (Test-Path -LiteralPath (Join-Path $foreign 'foreign.txt'))) {
    throw 'El target desconocido debe rechazarse sin borrar contenido.'
}

# Retirar solo el enlace antes de borrar el temporal.
if ($IsWindows) { & cmd.exe /d /c "rmdir `"$junction`"" | Out-Null }
else { Remove-Item -LiteralPath $junction -Force }
Remove-Item -LiteralPath $root -Recurse -Force
'PASS: enlace estable por slot, sello del checkout y target explícito intacto; desconocido rechazado.'
