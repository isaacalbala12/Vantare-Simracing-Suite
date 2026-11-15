param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'target-slot.ps1')
if (-not (Test-VantareTargetPath $EvidenceDirectory)) { throw 'Evidencia fuera del volumen configurado o RUNNER_TEMP.' }
if ($env:VANTARE_CARGO_QUEUE_OWNER) { throw 'Ejecutar este orquestador de pruebas sin una reserva exterior.' }
$env:VANTARE_SCCACHE = '0'
Remove-Item Env:RUSTC_WRAPPER -ErrorAction SilentlyContinue
$id = [guid]::NewGuid().ToString('N')
$root = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) "slot-workspace-$id"
$target = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) "slot-workspace-target-$id/slot-0"
$native = Join-Path $root 'vantare-v2/native'
try {
    foreach ($directory in @('x/src', 'y/src', 'fixtures', 'scripts')) {
        [IO.Directory]::CreateDirectory((Join-Path $native $directory)) | Out-Null
    }
    [IO.File]::WriteAllText((Join-Path $native 'Cargo.toml'), "[workspace]`nmembers = [`"x`", `"y`"]`nresolver = `"2`"`n")
    foreach ($name in @('x', 'y')) {
        [IO.File]::WriteAllText((Join-Path $native "$name/Cargo.toml"),
            "[package]`nname = 'vantare-$name'`nversion = '0.0.0'`nedition = '2024'`n")
    }
    [IO.File]::WriteAllText((Join-Path $native 'fixtures/data.txt'), 'one')
    [IO.File]::WriteAllText((Join-Path $native 'x/src/main.rs'),
        'fn main() { let d = include_str!("../../fixtures/data.txt"); println!("x-a-{d}"); }')
    [IO.File]::WriteAllText((Join-Path $native 'y/src/main.rs'), 'fn main() { println!("y"); }')
    foreach ($file in @('target-slot.ps1', 'slot-workspace.ps1')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $native "scripts/$file")
    }
    [IO.File]::WriteAllText((Join-Path $native 'scripts/slot-inputs.json'), (@'
{
  "external": ["vantare-v2/native/fixtures"],
  "rootFiles": ["vantare-v2/native/Cargo.toml", "vantare-v2/native/Cargo.lock"],
  "externalPackages": []
}
'@))
    Push-Location $root
    try {
        & git init -q
        & git -c user.email=test@example.invalid -c user.name=test add -A
        & git -c user.email=test@example.invalid -c user.name=test commit -qm initial
        if ($LASTEXITCODE) { throw 'No se pudo preparar el repositorio del fixture.' }
    } finally { Pop-Location }
    Push-Location $native
    try {
        & cargo generate-lockfile --offline
        if ($LASTEXITCODE) { throw 'No se pudo preparar el lockfile del fixture.' }
    } finally { Pop-Location }

    . (Join-Path $native 'scripts/slot-workspace.ps1')

    function Get-Artifacts([string[]]$Packages) {
        $arguments = @('build', '--manifest-path', (Join-Path $native 'Cargo.toml'), '--target-dir', $target,
            '--locked', '--offline', '--message-format=json')
        foreach ($package in $Packages) { $arguments += @('-p', $package) }
        $lines = & cargo @arguments
        if ($LASTEXITCODE) { throw "Falló el build de $($Packages -join ', ')." }
        $artifacts = @()
        foreach ($line in $lines) {
            try { $message = $line | ConvertFrom-Json } catch { continue }
            if ($message.reason -eq 'compiler-artifact' -and $message.executable) {
                $artifacts += [pscustomobject]@{ package = $message.target.name; fresh = [bool]$message.fresh; exe = $message.executable }
            }
        }
        $artifacts
    }

    function Assert-Fresh([object[]]$Artifacts, [string]$Package, [bool]$Fresh, [string]$Case) {
        $item = @($Artifacts | Where-Object package -eq $Package)
        if ($item.Count -ne 1) { throw "${Case}: falta el artefacto de $Package." }
        if ($item[0].fresh -ne $Fresh) { throw "${Case}: $Package fresh=$($item[0].fresh); esperado $Fresh." }
    }

    function Invoke-Switch { Set-VantareSlotWorkspace -Target $target -NativeRoot $native }

    Invoke-Switch
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y'))
    Assert-Fresh $artifacts 'vantare-x' $false 'primer checkout'
    Assert-Fresh $artifacts 'vantare-y' $false 'primer checkout'
    $exe = ($artifacts | Where-Object package -eq 'vantare-x').exe
    if ((& $exe) -cne 'x-a-one') { throw 'Primer checkout: salida inesperada.' }
    if (-not (Test-Path -LiteralPath (Join-Path $target 'CACHEDIR.TAG'))) { throw 'Falta el tag de caché del slot.' }
    $stamp = Get-Content -LiteralPath (Join-Path $target '.vantare-workspace') -Raw | ConvertFrom-Json
    if (-not $stamp.packages.'vantare-x' -or -not $stamp.external) { throw 'El sello no contiene los hashes.' }

    Invoke-Switch
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y'))
    Assert-Fresh $artifacts 'vantare-x' $true 'mismo contenido'
    Assert-Fresh $artifacts 'vantare-y' $true 'mismo contenido'

    Push-Location $root
    try {
        & git -c user.email=test@example.invalid -c user.name=test commit -q --allow-empty -m vacio
        if ($LASTEXITCODE) { throw 'No se pudo crear el commit vacío.' }
    } finally { Pop-Location }
    Invoke-Switch
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y'))
    Assert-Fresh $artifacts 'vantare-x' $true 'commit sin cambio de contenido'
    Assert-Fresh $artifacts 'vantare-y' $true 'commit sin cambio de contenido'

    [IO.File]::WriteAllText((Join-Path $native 'x/src/main.rs'),
        'fn main() { let d = include_str!("../../fixtures/data.txt"); println!("x-b-{d}"); }')
    Invoke-Switch
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y'))
    Assert-Fresh $artifacts 'vantare-x' $false 'solo x cambia'
    Assert-Fresh $artifacts 'vantare-y' $true 'solo x cambia'

    [IO.File]::WriteAllText((Join-Path $native 'x/src/main.rs'),
        'fn main() { let d = include_str!("../../fixtures/data.txt"); println!("x-c-{d}"); }')
    Invoke-Switch
    $null = Get-Artifacts @('vantare-y')
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y'))
    Assert-Fresh $artifacts 'vantare-x' $false 'build parcial previo'
    Assert-Fresh $artifacts 'vantare-y' $true 'build parcial previo'
    $exe = ($artifacts | Where-Object package -eq 'vantare-x').exe
    if ((& $exe) -cne 'x-c-one') { throw 'Build parcial previo: artefacto obsoleto.' }

    [IO.File]::WriteAllText((Join-Path $native 'fixtures/data.txt'), 'two')
    Invoke-Switch
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y'))
    Assert-Fresh $artifacts 'vantare-x' $false 'fichero externo cambiado'
    Assert-Fresh $artifacts 'vantare-y' $false 'fichero externo cambiado'
    $exe = ($artifacts | Where-Object package -eq 'vantare-x').exe
    if ((& $exe) -cne 'x-c-two') { throw 'Fichero externo: salida inesperada.' }

    [IO.File]::WriteAllText((Join-Path $native 'x/src/main.rs'),
        'fn main() { let d = include_str!("../../fixtures/data.txt"); println!("x-d-{d}"); }')
    (Get-Item -LiteralPath (Join-Path $native 'x/src/main.rs')).LastWriteTimeUtc = [datetime]'2020-01-01Z'
    Invoke-Switch
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y'))
    Assert-Fresh $artifacts 'vantare-x' $false 'edición posterior al build'
    $exe = ($artifacts | Where-Object package -eq 'vantare-x').exe
    if ((& $exe) -cne 'x-d-two') { throw 'Edición posterior al build: artefacto obsoleto.' }
    'PASS: hashes por paquete, limpieza dirigida, build parcial, fichero externo y edición posterior.'
} finally {
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
    $targetRoot = Split-Path $target
    if (Test-Path -LiteralPath $targetRoot) { Remove-Item -LiteralPath $targetRoot -Recurse -Force }
}

