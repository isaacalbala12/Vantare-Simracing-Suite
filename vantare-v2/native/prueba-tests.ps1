param([Parameter(Mandatory)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$fixture = Join-Path $EvidenceDirectory ('prueba-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
[IO.File]::WriteAllText((Join-Path $fixture 'Cargo.toml'), "[workspace]`nmembers = ['storage', 'services', 'future', 'admin']`nresolver = '3'`n[profile.prueba]`ninherits = 'release'`nopt-level = 0`n")
foreach ($case in @(
    @{Folder='storage';Name='vantare-storage';Feature='bundled-duckdb';Condition='feature'},
    @{Folder='services';Name='vantare-services';Feature='network';Condition='not(feature)'},
    @{Folder='future';Name='future-default';Feature='enabled';Condition='not(feature)'},
    @{Folder='admin';Name='vantare-admin';Feature='private';Condition='all()'}
)) {
    $root = Join-Path $fixture $case.Folder
    [IO.Directory]::CreateDirectory((Join-Path $root 'src')) | Out-Null
    [IO.File]::WriteAllText((Join-Path $root 'Cargo.toml'), "[package]`nname = '$($case.Name)'`nversion = '0.0.0'`nedition = '2024'`n[features]`ndefault = ['$($case.Feature)']`n$($case.Feature) = []`n")
    $condition = switch ($case.Condition) {
        'feature' { "feature = `"$($case.Feature)`"" }
        'not(feature)' { "not(feature = `"$($case.Feature)`")" }
        default { 'all()' }
    }
    [IO.File]::WriteAllText((Join-Path $root 'src/main.rs'), "#[cfg($condition)] compile_error!(`"Default incorrecto o admin incluido`");`nfn main() { println!(`"{} {}`", env!(`"VANTARE_VERSION`"), env!(`"VANTARE_BUILD_CHANNEL`")); }`n")
}
[IO.Directory]::CreateDirectory((Join-Path $fixture '.cargo')) | Out-Null
[IO.Directory]::CreateDirectory((Join-Path $fixture 'packaging')) | Out-Null
Copy-Item (Join-Path $native '.cargo/config.toml') (Join-Path $fixture '.cargo/config.toml')
Copy-Item (Join-Path $native 'gates.ps1') (Join-Path $fixture 'gates.ps1')
Copy-Item (Join-Path $native 'packaging/build-config.ps1') (Join-Path $fixture 'packaging/build-config.ps1')
$config = Join-Path $fixture 'public-build.cfg'
[IO.File]::WriteAllText($config, "VANTARE_VERSION=0.0.0-prueba`nVANTARE_BUILD_CHANNEL=nightly`n")
$names = @('VANTARE_VERSION', 'VANTARE_BUILD_CHANNEL', 'CARGO_INCREMENTAL', 'CARGO_TARGET_DIR', 'DUCKDB_LIB_DIR', 'PATH')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
Push-Location $fixture
try {
    & cargo generate-lockfile --offline
    if ($LASTEXITCODE) { throw 'No se pudo preparar el fixture.' }
    & ./gates.ps1 prueba -BuildConfig $config
    foreach ($bin in @('vantare-storage', 'vantare-services', 'future-default')) {
        $output = & (Join-Path $fixture "target/gates/prueba/$bin.exe")
        if ($LASTEXITCODE -or $output -cne '0.0.0-prueba nightly') { throw 'La identidad pública no se compiló en todos los binarios.' }
    }
    if (Test-Path (Join-Path $fixture 'target/gates/prueba/vantare-admin.exe')) { throw 'Admin entró en el build público.' }
    if (-not (Test-Path (Join-Path $fixture 'target/gates/prueba/duckdb.dll'))) { throw 'Falta la DLL junto a los binarios.' }
    foreach ($name in $names) {
        if ([Environment]::GetEnvironmentVariable($name, 'Process') -cne $previous[$name]) { throw "No se restauró $name." }
    }
    $rejected = $false
    try { & ./gates.ps1 prueba } catch { $rejected = $true }
    if (-not $rejected) { throw 'Prueba debe exigir configuración de build.' }
    [IO.File]::WriteAllText($config, 'UNKNOWN_PUBLIC_VARIABLE=fixture')
    $rejected = $false
    try { & ./gates.ps1 prueba -BuildConfig $config } catch { $rejected = $true }
    if (-not $rejected) { throw 'Configuración desconocida aceptada.' }
    foreach ($name in $names) {
        if ([Environment]::GetEnvironmentVariable($name, 'Process') -cne $previous[$name]) { throw "Error de configuración no restauró $name." }
    }
    'Prueba PASS: defaults, admin excluido, identidad pública, DLL y entorno restaurado en éxito/error.'
} finally { Pop-Location }
