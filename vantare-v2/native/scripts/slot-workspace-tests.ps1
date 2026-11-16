param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'target-slot.ps1')
if (-not (Test-VantareTargetPath $EvidenceDirectory)) { throw 'Evidencia fuera del volumen configurado o RUNNER_TEMP.' }
if ($env:VANTARE_CARGO_QUEUE_OWNER) { throw 'Ejecutar este orquestador de pruebas sin una reserva exterior.' }
$env:VANTARE_SCCACHE = '0'
Remove-Item Env:RUSTC_WRAPPER -ErrorAction SilentlyContinue
$id = [guid]::NewGuid().ToString('N')
$base = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) "slot-workspace-$id"
$root = Join-Path $base 'repo'
$native = Join-Path $root 'vantare-v2/native'
$target = Join-Path $base 'targets/slot-0'
$targetRoot = Split-Path $target
try {
    foreach ($directory in @('x/src', 'y/src', 'z/src', 'fixtures', 'scripts')) {
        [IO.Directory]::CreateDirectory((Join-Path $native $directory)) | Out-Null
    }
    [IO.File]::WriteAllText((Join-Path $native 'Cargo.toml'), "[workspace]`nmembers = [`"x`", `"y`", `"z`"]`nresolver = `"3`"`n")
    [IO.File]::WriteAllText((Join-Path $native 'x/Cargo.toml'),
        "[package]`nname = 'vantare-x'`nversion = '0.0.0'`nedition = '2024'`n[features]`ntest-support = []`n")
    [IO.File]::WriteAllText((Join-Path $native 'x/src/lib.rs'), 'pub fn version() -> &''static str { "a" }')
    [IO.File]::WriteAllText((Join-Path $native 'x/src/main.rs'),
        'fn main() { let d = include_str!("../data.txt"); println!("x-{}-{d}", vantare_x::version()); }')
    [IO.File]::WriteAllText((Join-Path $native 'y/Cargo.toml'),
        "[package]`nname = 'vantare-y'`nversion = '0.0.0'`nedition = '2024'`n")
    [IO.File]::WriteAllText((Join-Path $native 'y/src/main.rs'), 'fn main() { println!("y"); }')
    [IO.File]::WriteAllText((Join-Path $native 'z/Cargo.toml'),
        "[package]`nname = 'vantare-z'`nversion = '0.0.0'`nedition = '2024'`n[dependencies]`nvantare-x = { path = `"../x`" }`n")
    [IO.File]::WriteAllText((Join-Path $native 'z/src/main.rs'),
        'fn main() { println!("z-{}", vantare_x::version()); }')
    [IO.File]::WriteAllText((Join-Path $native 'fixtures/data.txt'), 'one')
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
    Push-Location $native
    try { & cargo generate-lockfile --offline; if ($LASTEXITCODE) { throw 'lockfile' } } finally { Pop-Location }
    Push-Location $root
    try {
        & git init -q
        & git -c user.email=test@example.invalid -c user.name=test add -A
        & git -c user.email=test@example.invalid -c user.name=test commit -qm initial
        if ($LASTEXITCODE) { throw 'No se pudo preparar el repositorio del fixture.' }
    } finally { Pop-Location }
    # Untracked file inside the x package: covered by the package hash.
    [IO.File]::WriteAllText((Join-Path $native 'x/data.txt'), 'one')
    [IO.Directory]::CreateDirectory($target) | Out-Null
    & cargo build --manifest-path (Join-Path $native 'Cargo.toml') --target-dir $target --locked --offline -q -p vantare-x
    if ($LASTEXITCODE) { throw 'Build previo sin sello.' }

    . (Join-Path $native 'scripts/slot-workspace.ps1')

    function Get-Artifacts([string[]]$Packages, [string[]]$Extra = @()) {
        $arguments = @('build', '--manifest-path', (Join-Path $native 'Cargo.toml'), '--target-dir', $target,
            '--locked', '--offline', '--message-format=json') + $Extra
        foreach ($package in $Packages) { $arguments += @('-p', $package) }
        $lines = & cargo @arguments
        if ($LASTEXITCODE) { throw "Falló el build de $($Packages -join ', ')." }
        foreach ($line in $lines) {
            try { $message = $line | ConvertFrom-Json } catch { continue }
            if ($message.reason -eq 'compiler-artifact' -and $message.executable) {
                [pscustomobject]@{ package = $message.target.name; fresh = [bool]$message.fresh; exe = $message.executable }
            }
        }
    }

    function Invoke-Switch { Set-VantareSlotWorkspace -Target $target -NativeRoot $native }

    function Assert-Artifact([object[]]$Artifacts, [string]$Package, [bool]$Fresh, [string]$Case) {
        $item = @($Artifacts | Where-Object package -eq $Package)
        if ($item.Count -ne 1) { throw "${Case}: falta el artefacto de $Package." }
        if ($item[0].fresh -ne $Fresh) { throw "${Case}: $Package fresh=$($item[0].fresh); esperado $Fresh." }
    }

    function Assert-Output([object[]]$Artifacts, [string]$Package, [string]$Expected, [string]$Case) {
        $item = @($Artifacts | Where-Object package -eq $Package)
        if ((& $item[0].exe) -cne $Expected) { throw "${Case}: salida inesperada de $Package." }
    }

    # Target with artifacts and no stamp: the first switch invalidates and the
    # CACHEDIR.TAG is created before cleaning.
    Invoke-Switch
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y', 'vantare-z'))
    Assert-Artifact $artifacts 'vantare-x' $false 'artefactos sin sello'
    if (-not (Test-Path -LiteralPath (Join-Path $target 'CACHEDIR.TAG'))) { throw 'Falta el tag de caché.' }
    Assert-Output $artifacts 'vantare-x' 'x-a-one' 'primer build'

    # Release artifact must disappear when the package is cleaned (N2/N3).
    & cargo build --manifest-path (Join-Path $native 'Cargo.toml') --target-dir $target --locked --offline -q --release -p vantare-x
    if ($LASTEXITCODE -or -not (Test-Path -LiteralPath (Join-Path $target 'release/vantare-x.exe'))) { throw 'Build release.' }

    Invoke-Switch
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y', 'vantare-z'))
    Assert-Artifact $artifacts 'vantare-x' $true 'mismo contenido'
    Assert-Artifact $artifacts 'vantare-y' $true 'mismo contenido'
    Assert-Artifact $artifacts 'vantare-z' $true 'mismo contenido'

    Push-Location $root
    try {
        & git -c user.email=test@example.invalid -c user.name=test commit -q --allow-empty -m vacio
        if ($LASTEXITCODE) { throw 'Commit vacío.' }
    } finally { Pop-Location }
    Invoke-Switch
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y', 'vantare-z'))
    Assert-Artifact $artifacts 'vantare-x' $true 'commit sin cambio'
    Assert-Artifact $artifacts 'vantare-z' $true 'commit sin cambio'

    [IO.File]::WriteAllText((Join-Path $native 'x/src/lib.rs'), 'pub fn version() -> &''static str { "b" }')
    Invoke-Switch
    if (@(Get-ChildItem -LiteralPath (Join-Path $target 'release/.fingerprint') -Filter 'vantare-x-*' -Force -ErrorAction SilentlyContinue).Count) {
        throw 'Queda un fingerprint release de x tras la limpieza.'
    }
    if (Test-Path -LiteralPath (Join-Path $target 'release/vantare-x.exe')) { throw 'Queda el binario release de x tras la limpieza.' }
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y', 'vantare-z'))
    Assert-Artifact $artifacts 'vantare-x' $false 'solo x cambia'
    Assert-Artifact $artifacts 'vantare-y' $true 'solo x cambia'
    Assert-Artifact $artifacts 'vantare-z' $false 'dependiente de x'

    [IO.File]::WriteAllText((Join-Path $native 'x/data.txt'), 'two')
    Invoke-Switch
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y', 'vantare-z'))
    Assert-Artifact $artifacts 'vantare-x' $false 'sin seguimiento en el paquete'
    Assert-Output $artifacts 'vantare-x' 'x-b-two' 'sin seguimiento en el paquete'

    [IO.File]::WriteAllText((Join-Path $native 'fixtures/data.txt'), 'two')
    Invoke-Switch
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-y', 'vantare-z'))
    Assert-Artifact $artifacts 'vantare-x' $false 'fichero externo'
    Assert-Artifact $artifacts 'vantare-y' $false 'fichero externo'
    Assert-Artifact $artifacts 'vantare-z' $false 'fichero externo'

    [IO.File]::WriteAllText((Join-Path $native 'x/src/lib.rs'), 'pub fn version() -> &''static str { "c" }')
    Invoke-Switch
    $null = Get-Artifacts @('vantare-y')
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-z'))
    Assert-Artifact $artifacts 'vantare-x' $false 'build parcial previo'
    Assert-Artifact $artifacts 'vantare-z' $false 'build parcial previo'
    $y = @(Get-Artifacts @('vantare-y'))
    Assert-Artifact $y 'vantare-y' $true 'build parcial previo'

    [IO.File]::WriteAllText((Join-Path $native 'x/src/lib.rs'), 'pub fn version() -> &''static str { "d" }')
    (Get-Item -LiteralPath (Join-Path $native 'x/src/lib.rs')).LastWriteTimeUtc = [datetime]'2020-01-01Z'
    Invoke-Switch
    $artifacts = @(Get-Artifacts @('vantare-x', 'vantare-z'))
    Assert-Artifact $artifacts 'vantare-x' $false 'edición posterior'
    Assert-Artifact $artifacts 'vantare-z' $false 'edición posterior'

    # A repo without git must fail loudly, not treat every path as missing.
    $noGit = Join-Path $base 'no-git/vantare-v2/native'
    [IO.Directory]::CreateDirectory((Join-Path $noGit 'src')) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $noGit 'scripts')) | Out-Null
    [IO.File]::WriteAllText((Join-Path $noGit 'Cargo.toml'),
        "[package]`nname = 'vantare-no-git'`nversion = '0.0.0'`nedition = '2024'`n")
    [IO.File]::WriteAllText((Join-Path $noGit 'src/main.rs'), 'fn main() {}')
    foreach ($file in @('target-slot.ps1', 'slot-workspace.ps1')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $noGit "scripts/$file")
    }
    [IO.File]::WriteAllText((Join-Path $noGit 'scripts/slot-inputs.json'),
        '{ "external": [], "rootFiles": ["vantare-v2/native/Cargo.toml"], "externalPackages": [] }')
    Push-Location $noGit
    try { & cargo generate-lockfile --offline; if ($LASTEXITCODE) { throw 'lockfile no-git' } } finally { Pop-Location }
    $noGitTarget = Join-Path $base 'no-git-target/slot-0'
    $threw = $false
    try { Set-VantareSlotWorkspace -Target $noGitTarget -NativeRoot $noGit } catch {
        $threw = $_.Exception.Message -like '*repositorio git*'
    }
    if (-not $threw) { throw 'Un checkout sin git debe fallar visiblemente.' }

    'PASS: sello de contenido, perfiles, dependiente, sin seguimiento, externo, parcial, git y sello ausente.'
} finally {
    if (Test-Path -LiteralPath $base) { Remove-Item -LiteralPath $base -Recurse -Force }
}

