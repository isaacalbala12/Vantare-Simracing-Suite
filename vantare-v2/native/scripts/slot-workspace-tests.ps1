param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'slot-workspace.ps1')
$target = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) ('fresh-slot-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory((Join-Path $target 'tmp')) | Out-Null
[IO.File]::WriteAllText((Join-Path $target '.vantare-last-build'), 'queue stamp')
function cargo { throw 'Un target nuevo no debe invocar cargo clean.' }
Set-VantareSlotWorkspace -Target (Join-Path $target 'new-explicit-target') -NativeRoot $PSScriptRoot
Remove-Item -LiteralPath (Join-Path $target 'new-explicit-target/.vantare-workspace')
[IO.Directory]::Delete((Join-Path $target 'new-explicit-target'))
Set-VantareSlotWorkspace -Target $target -NativeRoot $PSScriptRoot
if ([IO.File]::ReadAllText((Join-Path $target '.vantare-workspace')) -cne $PSScriptRoot) {
    throw 'No se ha registrado el primer checkout.'
}
if (Test-Path -LiteralPath (Join-Path $target 'CACHEDIR.TAG')) { throw 'No inventar el tag de Cargo.' }
[IO.File]::WriteAllText((Join-Path $target 'foreign.txt'), 'preserve')
$rejected = $false
try { Set-VantareSlotWorkspace -Target $target -NativeRoot (Split-Path $PSScriptRoot) }
catch { $rejected = $_.Exception.Message -like '*contenido desconocido*' }
if (-not $rejected -or -not (Test-Path -LiteralPath (Join-Path $target 'foreign.txt'))) {
    throw 'El target desconocido debe rechazarse sin borrar contenido.'
}
'PASS: primer slot sin clean; contenido desconocido conservado y rechazado.'

# Migration must reject an active legacy build before creating Cargo's tag.
$legacy = Join-Path $target 'legacy'
[IO.Directory]::CreateDirectory((Join-Path $legacy 'debug')) | Out-Null
[IO.File]::WriteAllText((Join-Path $legacy '.rustc_info.json'), '{"rustc_fingerprint":123}')
[IO.Directory]::CreateDirectory((Join-Path $legacy 'release')) | Out-Null
foreach ($profile in @('debug', 'release')) {
    [IO.File]::WriteAllText((Join-Path $legacy "$profile/.cargo-lock"), '')
}
foreach ($profile in @('debug', 'release')) {
    $active = [IO.File]::Open((Join-Path $legacy "$profile/.cargo-lock"), 'Open', 'ReadWrite', 'None')
    try {
        $rejected = $false
        try { Set-VantareSlotWorkspace -Target $legacy -NativeRoot $PSScriptRoot }
        catch { $rejected = $_.Exception.InnerException -is [IO.IOException] }
        if (-not $rejected -or (Test-Path (Join-Path $legacy 'CACHEDIR.TAG'))) {
            throw "El target legacy con $profile ocupado no debe migrarse."
        }
    } finally { $active.Dispose() }
    # A failed second lock must release the first one too.
    foreach ($released in @('debug', 'release')) {
        $probe = [IO.File]::Open((Join-Path $legacy "$released/.cargo-lock"), 'Open', 'ReadWrite', 'None')
        $probe.Dispose()
    }
}
function cargo {
    if ($args[0] -eq 'metadata') { '{"packages":[],"workspace_members":[]}' }
    elseif ($args[0] -eq 'clean') {
        $tag = [IO.File]::ReadAllText((Join-Path $legacy 'CACHEDIR.TAG'))
        if (-not $tag.StartsWith('Signature: 8a477f597d28d172789f06886806bc55')) {
            throw 'Cargo clean necesita el marcador válido antes de invalidar.'
        }
    } else { throw 'Comando Cargo inesperado.' }
    $global:LASTEXITCODE = 0
}
Set-VantareSlotWorkspace -Target $legacy -NativeRoot $PSScriptRoot
if (-not (Test-Path (Join-Path $legacy '.vantare-workspace'))) { throw 'Falta el sello del checkout migrado.' }
foreach ($profile in @('debug', 'release')) {
    $probe = [IO.File]::Open((Join-Path $legacy "$profile/.cargo-lock"), 'Open', 'ReadWrite', 'None')
    $probe.Dispose()
}
$legacy = Join-Path $target 'legacy-debug-only'
[IO.Directory]::CreateDirectory((Join-Path $legacy 'debug')) | Out-Null
[IO.File]::WriteAllText((Join-Path $legacy '.rustc_info.json'), '{"rustc_fingerprint":123}')
[IO.File]::WriteAllText((Join-Path $legacy 'debug/.cargo-lock'), '')
Set-VantareSlotWorkspace -Target $legacy -NativeRoot $PSScriptRoot
if ((Test-Path (Join-Path $legacy 'release')) -or -not (Test-Path (Join-Path $legacy '.vantare-workspace'))) {
    throw 'El target debug-only debe migrar sin inventar un perfil release.'
}
Remove-Item Function:cargo
'PASS: migración legacy con locks debug/release; marcador válido antes de clean.'
