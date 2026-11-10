param([Parameter(Mandatory)][string]$EvidenceDirectory, [Parameter(Mandatory)][string]$DuckDbDirectory, [switch]$OriginalFlags)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$fixture = Join-Path $EvidenceDirectory ('gate-defaults-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
[IO.File]::WriteAllText((Join-Path $fixture 'Cargo.toml'), "[workspace]`nmembers = ['storage', 'services', 'future']`nresolver = '3'`n")
$cases = @(
    @{ Folder = 'storage'; Name = 'vantare-storage'; Feature = 'bundled-duckdb'; Enabled = 'false' },
    @{ Folder = 'services'; Name = 'vantare-services'; Feature = 'network'; Enabled = 'true' },
    @{ Folder = 'future'; Name = 'future-default'; Feature = 'enabled-by-default'; Enabled = 'true' }
)
foreach ($case in $cases) {
    $root = Join-Path $fixture $case.Folder
    [IO.Directory]::CreateDirectory((Join-Path $root 'src')) | Out-Null
    [IO.File]::WriteAllText((Join-Path $root 'Cargo.toml'), "[package]`nname = '$($case.Name)'`nversion = '0.0.0'`nedition = '2024'`n[features]`ndefault = ['$($case.Feature)']`n$($case.Feature) = []`n")
    [IO.File]::WriteAllText((Join-Path $root 'src/lib.rs'), "#[test] fn default_contract() { assert_eq!(cfg!(feature = `"$($case.Feature)`"), $($case.Enabled)); }`n")
}
[IO.Directory]::CreateDirectory((Join-Path $fixture '.cargo')) | Out-Null
Copy-Item (Join-Path $PSScriptRoot '.cargo/config.toml') (Join-Path $fixture '.cargo/config.toml')
Copy-Item (Join-Path $PSScriptRoot 'gates.ps1') (Join-Path $fixture 'gates.ps1')
[IO.Directory]::CreateDirectory((Join-Path $fixture 'scripts')) | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'scripts/slot-workspace.ps1') (Join-Path $fixture 'scripts/slot-workspace.ps1')
Copy-Item (Join-Path $PSScriptRoot 'scripts/target-slot.ps1') (Join-Path $fixture 'scripts/target-slot.ps1')
Push-Location $fixture
try {
    & cargo generate-lockfile --offline
    if ($LASTEXITCODE) { throw 'No se pudo preparar el fixture Cargo.' }
    if ($OriginalFlags) {
        & cargo nextest run --workspace --no-default-features --features vantare-services/network -j 2
        if ($LASTEXITCODE) { throw 'Los flags originales apagan el default del crate futuro.' }
    } else {
        $previousTarget = [Environment]::GetEnvironmentVariable('CARGO_TARGET_DIR', 'Process')
        $previousDirectory = [Environment]::GetEnvironmentVariable('DUCKDB_LIB_DIR', 'Process')
        & (Join-Path $fixture 'gates.ps1') -Gate test -DuckDbDirectory $DuckDbDirectory
        if ($env:VANTARE_SLOT_TARGET -notmatch '^[dD]:[\\/]' -or -not (Test-Path $env:VANTARE_SLOT_TARGET)) { throw 'El gate debe usar el target de slot en D:.' }
        if ([Environment]::GetEnvironmentVariable('CARGO_TARGET_DIR', 'Process') -cne $previousTarget) { throw 'El gate no restauró CARGO_TARGET_DIR.' }
        if ([Environment]::GetEnvironmentVariable('DUCKDB_LIB_DIR', 'Process') -cne $previousDirectory) { throw 'El gate no restauró DUCKDB_LIB_DIR.' }
        'Defaults actuales y futuro PASS; bundled de storage desactivado.'
        [IO.Directory]::CreateDirectory((Join-Path $fixture '.config')) | Out-Null
        [IO.File]::WriteAllText((Join-Path $fixture '.config/nextest.toml'), @'
[profile.default]
archive.include = [{ path = "debug/duckdb.dll", relative-to = "target", on-missing = "error" }, { path = "debug/ci-lifecycle", relative-to = "target", on-missing = "error" }]
[profile.ci]
default-filter = 'all()'
'@)
        foreach ($folder in @('future', 'services')) {
            [IO.Directory]::CreateDirectory((Join-Path $fixture "$folder/tests")) | Out-Null
            [IO.File]::WriteAllText((Join-Path $fixture "$folder/tests/lifecycle.rs"), '#[test] fn lifecycle_contract() { assert_eq!(2 + 2, 4); }')
        }
        & (Join-Path $fixture 'gates.ps1') -Gate archive -Packages @('future-default', 'vantare-services') -DuckDbDirectory $DuckDbDirectory
        $harnesses = @(Get-Content (Join-Path $env:VANTARE_SLOT_TARGET 'debug/ci-lifecycle/manifest.json') -Raw | ConvertFrom-Json)
        if ($harnesses.Count -ne 2 -or @($harnesses.image | Sort-Object -Unique).Count -ne 2) { throw 'Se perdió un lifecycle homónimo de otro paquete.' }
        foreach ($harness in $harnesses) {
            & (Join-Path $env:VANTARE_SLOT_TARGET "debug/ci-lifecycle/$($harness.image)")
            if ($LASTEXITCODE) { throw 'El arnés lifecycle archivado no es ejecutable.' }
        }
        $extract = Join-Path $fixture 'reuse'
        [IO.Directory]::CreateDirectory($extract) | Out-Null
        & cargo-nextest nextest run --archive-file (Join-Path $env:VANTARE_SLOT_TARGET 'nextest-tests.tar.zst') --extract-to $extract
        if ($LASTEXITCODE) { throw 'El archivo no ejecuta los tests compilados.' }
        'Archive PASS: compilación seleccionada y ejecución desde el archivo real.'
    }
} finally { Pop-Location }
