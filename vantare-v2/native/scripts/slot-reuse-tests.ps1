param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Exercise Cargo's artifact selection itself, without a compiler cache.
Remove-Item Env:RUSTC_WRAPPER -ErrorAction SilentlyContinue
if ($env:VANTARE_SLOT_TARGET -notmatch '^[dD]:[\\/]') { throw 'Invocar por compilar.ps1.' }
$root = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) ('slot-reuse-' + [guid]::NewGuid().ToString('N'))
foreach ($branch in @('A', 'B')) {
    $directory = Join-Path $root $branch
    [IO.Directory]::CreateDirectory((Join-Path $directory 'src')) | Out-Null
    [IO.File]::WriteAllText((Join-Path $directory 'Cargo.toml'), "[package]`nname = 'vantare-slot-reuse-probe'`nversion = '0.0.0'`nedition = '2024'`n")
    [IO.File]::WriteAllText((Join-Path $directory 'src/main.rs'), "fn main() { println!(`"$branch`"); }`n")
}
foreach ($branch in @('A', 'B', 'A')) {
    & cargo build --manifest-path (Join-Path $root "$branch/Cargo.toml") --offline -j 2
    if ($LASTEXITCODE) { throw "No compiló $branch." }
    $result = & (Join-Path $env:VANTARE_SLOT_TARGET 'debug/vantare-slot-reuse-probe.exe')
    if ($LASTEXITCODE -or $result -cne $branch) { throw "Artefacto de otra rama: $result, esperado $branch." }
}
'PASS: A -> B -> A en dos checkouts con el mismo target, sin ejecutable obsoleto.'
