param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'target-slot.ps1')
if (-not (Test-VantareTargetPath $EvidenceDirectory)) { throw 'Evidencia fuera del volumen configurado o RUNNER_TEMP.' }
if ($env:VANTARE_CARGO_QUEUE_OWNER) { throw 'Ejecutar este orquestador de pruebas sin una reserva exterior.' }
$env:VANTARE_SCCACHE = '0'
Remove-Item Env:RUSTC_WRAPPER -ErrorAction SilentlyContinue
# This test exercises the local slot path, where compilar.ps1 invalidates the
# packages that changed. The hosted `ci` target is a single checkout.
$previousCi = $env:VANTARE_CI_TARGET
Remove-Item Env:VANTARE_CI_TARGET -ErrorAction SilentlyContinue
# Do not touch the real slot target of this machine: the fixture owns its own
# root. (On GitHub-hosted runners the root is already per-job.)
$previousRoot = $env:VANTARE_TARGET_ROOT
$testRoot = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) ('slot-reuse-targets-' + [guid]::NewGuid().ToString('N'))
$env:VANTARE_TARGET_ROOT = $testRoot
$root = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) ('slot-reuse-' + [guid]::NewGuid().ToString('N'))
try {
    foreach ($branch in @('A', 'B')) {
        $worktree = Join-Path $root $branch
        $native = Join-Path $worktree 'vantare-v2/native'
        foreach ($directory in @('src', 'scripts', '.cargo')) {
            [IO.Directory]::CreateDirectory((Join-Path $native $directory)) | Out-Null
        }
        [IO.File]::WriteAllText((Join-Path $native 'Cargo.toml'), "[package]`nname = 'vantare-slot-reuse-probe'`nversion = '0.0.0'`nedition = '2024'`n")
        # Exercise the product's exact pinned Cargo on every runner.
        [IO.File]::WriteAllText((Join-Path $native 'rust-toolchain.toml'), "[toolchain]`nchannel = '1.99.1'`n")
        [IO.File]::WriteAllText((Join-Path $native 'src/main.rs'), "fn main() { println!(`"$branch`"); }`n")
        foreach ($file in @('compilar.ps1', 'target-slot.ps1', 'slot-workspace.ps1', 'queue-decision.ps1')) {
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $native "scripts/$file")
        }
        [IO.File]::WriteAllText((Join-Path $native 'scripts/slot-inputs.json'), (@'
{
  "external": [],
  "rootFiles": ["vantare-v2/native/Cargo.toml", "vantare-v2/native/Cargo.lock"],
  "externalPackages": []
}
'@))
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../.cargo/config.toml') -Destination (Join-Path $native '.cargo/config.toml')
        & cargo generate-lockfile --manifest-path (Join-Path $native 'Cargo.toml') --offline
        if ($LASTEXITCODE) { throw 'Preparar fixture de checkout.' }
        Push-Location $worktree
        try {
            & git init -q
            & git -c user.email=test@example.invalid -c user.name=test add -A
            & git -c user.email=test@example.invalid -c user.name=test commit -qm inicial
            if ($LASTEXITCODE) { throw 'Preparar repositorio del fixture.' }
        } finally { Pop-Location }
    }
    foreach ($branch in @('A', 'B', 'A')) {
        $worktree = Join-Path $root $branch
        Push-Location (Join-Path $worktree 'vantare-v2')
        try {
            $output = & pwsh -NoProfile -File native/scripts/compilar.ps1 cargo run --offline -j 4 --manifest-path native/Cargo.toml
            $output | Write-Host
            # PowerShell no garantiza el orden entre stderr (líneas de cargo, como
            # ErrorRecord) y stdout (la sonda): se cuentan solo los marcadores de rama.
            $marks = @($output | ForEach-Object { "$_" } | Where-Object { $_ -cmatch '^[AB]$' })
            if ($LASTEXITCODE -or $marks.Count -ne 1 -or $marks[0] -cne $branch) { throw "Artefacto de otra rama; esperado $branch." }
        } finally { Pop-Location }
    }
    'PASS: A -> B -> A en dos checkouts con target de slot y limpieza dirigida.'
} finally {
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
    if ($null -ne $previousCi) { $env:VANTARE_CI_TARGET = $previousCi }
    if ($null -ne $previousRoot) { $env:VANTARE_TARGET_ROOT = $previousRoot }
    else { Remove-Item Env:VANTARE_TARGET_ROOT -ErrorAction SilentlyContinue }
}

