param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($EvidenceDirectory -notmatch '^[dD]:[\\/]') { throw 'Evidencia en D: requerida.' }
if ($env:VANTARE_CARGO_QUEUE_OWNER) { throw 'Ejecutar este orquestador de pruebas sin una reserva exterior.' }
$env:VANTARE_SCCACHE = '0'
Remove-Item Env:RUSTC_WRAPPER -ErrorAction SilentlyContinue
$root = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) ('slot-reuse-' + [guid]::NewGuid().ToString('N'))
foreach ($branch in @('A', 'B')) {
    $directory = Join-Path $root $branch
    [IO.Directory]::CreateDirectory((Join-Path $directory 'src')) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $directory 'scripts')) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $directory '.cargo')) | Out-Null
    [IO.File]::WriteAllText((Join-Path $directory 'Cargo.toml'), "[package]`nname = 'vantare-slot-reuse-probe'`nversion = '0.0.0'`nedition = '2024'`n")
    [IO.File]::WriteAllText((Join-Path $directory 'src/main.rs'), "fn main() { println!(`"$branch`"); }`n")
    foreach ($file in @('compilar.ps1', 'target-slot.ps1', 'slot-workspace.ps1')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $directory "scripts/$file")
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../.cargo/config.toml') -Destination (Join-Path $directory '.cargo/config.toml')
    & cargo generate-lockfile --manifest-path (Join-Path $directory 'Cargo.toml') --offline
    if ($LASTEXITCODE) { throw 'Preparar fixture de checkout.' }
}
foreach ($branch in @('A', 'B', 'A')) {
    $directory = Join-Path $root $branch
    Push-Location $directory
    try {
        $output = & pwsh -NoProfile -File scripts/compilar.ps1 cargo run --offline -j 4
        $output | Write-Host
        if ($LASTEXITCODE -or $output[-1] -cne $branch) { throw "Artefacto de otra rama; esperado $branch." }
    } finally { Pop-Location }
}
'PASS: A -> B -> A en dos checkouts con targets de slots, sin ejecutable obsoleto.'
