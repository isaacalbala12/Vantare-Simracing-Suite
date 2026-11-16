param([Parameter(Mandatory)][string]$EvidenceDirectory,
      [string]$QueueScript = (Join-Path $PSScriptRoot 'compilar.ps1'))
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) ('caller-target-' + [guid]::NewGuid().ToString('N'))
foreach ($directory in @('src', 'scripts', '.cargo')) { [IO.Directory]::CreateDirectory((Join-Path $root $directory)) | Out-Null }
[IO.File]::WriteAllText((Join-Path $root 'Cargo.toml'), "[package]`nname='caller-target-probe'`nversion='0.0.0'`nedition='2024'`n")
[IO.File]::WriteAllText((Join-Path $root 'rust-toolchain.toml'), "[toolchain]`nchannel='1.99.1'`n")
[IO.File]::WriteAllText((Join-Path $root 'src/main.rs'), 'fn main() { println!("caller target {:?}", std::env::args().skip(1).collect::<Vec<_>>()); }')
foreach ($name in @('compilar.ps1', 'target-slot.ps1', 'slot-workspace.ps1', 'queue-decision.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $root "scripts/$name")
}
Copy-Item -LiteralPath $QueueScript -Destination (Join-Path $root 'scripts/compilar.ps1') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../.cargo/config.toml') -Destination (Join-Path $root '.cargo/config.toml')
$old = $env:CARGO_TARGET_DIR
$env:VANTARE_SCCACHE = '0'
Push-Location $root
try {
    & cargo generate-lockfile --offline
    if ($LASTEXITCODE) { throw 'No se pudo preparar la fixture.' }
    $env:CARGO_TARGET_DIR = Join-Path $root 'output/target-build'
    & pwsh -NoProfile -File scripts/compilar.ps1 cargo run --locked --offline -j 4
    if ($LASTEXITCODE -or -not (Test-Path -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'debug/caller-target-probe.exe'))) {
        throw 'Packaging no encuentra su ejecutable en el target del llamador.'
    }
    # `& script ... -- arg` loses the literal `--` in PowerShell; the target must
    # stay a Cargo option and reach the binary only the caller's argument.
    $output = & (Join-Path $root 'scripts/compilar.ps1') cargo run --locked --offline -j 4 -- hello
    if ($LASTEXITCODE) { throw 'Falló cargo run con argumento del binario.' }
    $text = $output -join "`n"
    if ($text -notmatch 'hello') { throw 'El binario no recibió su argumento.' }
    if ($text -match 'target-dir') { throw 'El wrapper coló --target-dir tras el separador.' }
    $env:CARGO_TARGET_DIR = 'relative-target'
    & pwsh -NoProfile -File scripts/compilar.ps1 cargo build --locked --offline -j 4
    if (-not $LASTEXITCODE) { throw 'Se aceptó un target relativo del llamador.' }
} finally {
    [Environment]::SetEnvironmentVariable('CARGO_TARGET_DIR', $old, 'Process')
    Pop-Location
}
'PASS: target de packaging conservado; target relativo rechazado.'

