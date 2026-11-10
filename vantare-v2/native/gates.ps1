# Gates con DuckDB oficial, sin desactivar defaults ajenos a storage.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('check', 'clippy', 'captura', 'test', 'telemetria', 'completa', 'archive', 'lifecycle', 'prueba', 'distribution')][string]$Gate,
    [string]$DuckDbDirectory = $env:DUCKDB_LIB_DIR,
    [string]$BuildConfig,
    [string]$TargetDirectory = $env:VANTARE_SLOT_TARGET,
    [string[]]$Packages = @()
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/target-slot.ps1')
if (-not (Test-VantareTargetPath $TargetDirectory)) { throw 'Ejecuta gates.ps1 mediante scripts/compilar.ps1 (target absoluto en el volumen configurado).' }
if ($Gate -eq 'distribution') {
    & (Join-Path $PSScriptRoot 'scripts/check-qa-distribution.ps1') -TargetDirectory ([IO.Path]::GetFullPath($TargetDirectory))
    return
}
. (Join-Path $PSScriptRoot 'scripts/slot-workspace.ps1')
Set-VantareSlotWorkspace -Target $TargetDirectory -NativeRoot $PSScriptRoot
if ($Gate -eq 'prueba' -and -not $BuildConfig) { throw 'Prueba exige -BuildConfig con la configuración pública real.' }
if ($BuildConfig -and $Gate -ne 'prueba') { throw '-BuildConfig solo se aplica al build prueba.' }
if ($BuildConfig) { $BuildConfig = (Resolve-Path -LiteralPath $BuildConfig).Path }
if (-not $DuckDbDirectory) { $DuckDbDirectory = Join-Path $env:LOCALAPPDATA 'Vantare/duckdb-1.5.5' }
if (-not (Test-Path -LiteralPath $DuckDbDirectory)) { throw 'Ejecuta .\setup-duckdb.ps1 una vez para instalar DuckDB 1.5.5.' }
$directory = (Resolve-Path -LiteralPath $DuckDbDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $directory 'duckdb.lib')) -or
    -not (Test-Path -LiteralPath (Join-Path $directory 'duckdb.dll'))) { throw 'Se necesitan duckdb.lib y duckdb.dll oficiales (Windows).' }
$previousTarget = [Environment]::GetEnvironmentVariable('CARGO_TARGET_DIR', 'Process')
Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
$previousDirectory = [Environment]::GetEnvironmentVariable('DUCKDB_LIB_DIR', 'Process')
$previousPath = $env:PATH
$previousIncremental = [Environment]::GetEnvironmentVariable('CARGO_INCREMENTAL', 'Process')
$previousNativeRoot = [Environment]::GetEnvironmentVariable('VANTARE_NATIVE_DATA_ROOT', 'Process')
$previousLocalData = [Environment]::GetEnvironmentVariable('LOCALAPPDATA', 'Process')
$previousRoamingData = [Environment]::GetEnvironmentVariable('APPDATA', 'Process')
$previousConfig = $null
Push-Location $PSScriptRoot
try {
    $env:DUCKDB_LIB_DIR = $directory
    $env:PATH = "$directory;$env:PATH"
    if ($Gate -ne 'prueba') {
        $qaTarget = if ([IO.Path]::IsPathRooted($TargetDirectory)) {
            $TargetDirectory
        } else { Join-Path $PSScriptRoot $TargetDirectory }
        $qaBase = [IO.Path]::GetFullPath((Join-Path $qaTarget 'qa-data'))
        [IO.Directory]::CreateDirectory($qaBase) | Out-Null
        $env:VANTARE_NATIVE_DATA_ROOT = $qaBase
        $env:LOCALAPPDATA = $qaBase
        $env:APPDATA = $qaBase
    }
    if ($Gate -eq 'prueba') {
        . (Join-Path $PSScriptRoot 'packaging/build-config.ps1')
        $previousConfig = Import-NativeBuildConfig $BuildConfig
        # Respeta incremental propio y no incremental de deps definidos en el perfil.
        Remove-Item Env:CARGO_INCREMENTAL -ErrorAction SilentlyContinue
    }
    $json = & cargo metadata --locked --offline --no-deps --format-version 1
    if ($LASTEXITCODE) { throw 'No se pudo leer el workspace para conservar sus features por defecto.' }
    $metadata = $json | ConvertFrom-Json
    $members = @($metadata.packages | Where-Object { $_.id -cin $metadata.workspace_members })
    $storage = @($members | Where-Object name -CEQ 'vantare-storage')
    if ($storage.Count -ne 1 -or @($storage[0].features.default).Count -ne 1 -or
        $storage[0].features.default[0] -cne 'bundled-duckdb') { throw 'El default de storage cambió: revisar gates.ps1 antes de desactivar bundled-duckdb.' }
    # Runtime's process tests launch the actual Services executable, not its rlib.
    if ($Gate -in @('test', 'telemetria', 'completa', 'archive') -and
        'vantare-runtime' -cin $Packages -and 'vantare-services' -cnotin $Packages) {
        $Packages += 'vantare-services'
    }
    # /default conserva también los defaults de crates futuros, aunque estén vacíos.
    $defaultMembers = if ($Packages.Count) { @($members | Where-Object { $_.name -cin $Packages }) } else { $members }
    $defaults = @($defaultMembers | Where-Object { $_.name -cne 'vantare-storage' -and
        ($Gate -ne 'prueba' -or $_.name -cne 'vantare-admin') -and $null -ne $_.features.PSObject.Properties['default'] } |
        ForEach-Object { "$($_.name)/default" })
    $arguments = switch ($Gate) {
        'check' { @('check', '--workspace', '--all-targets') }
        'clippy' { @('clippy', '--workspace', '--all-targets') }
        'test' { @('nextest', 'run', '--workspace') }
        'telemetria' { @('nextest', 'run', '--workspace', '--profile', 'telemetria') }
        # Todo menos lifecycle en una sola invocación: para CI (#1654 ronda 7).
        'completa' { @('nextest', 'run', '--workspace', '--profile', 'ci') }
        'archive' { @('test', '--workspace', '--no-run', '--message-format=json') }
        'lifecycle' { @('test', '--workspace', '--test', 'lifecycle') }
        # Banco de capturas QA del instalador (#1735): solo existe con parity-capture,
        # que ningún build por defecto ni de release activa.
        'captura' { @('clippy', '-p', 'vantare-installer', '--all-targets', '--features', 'parity-capture') }
        'prueba' { @('build', '--workspace', '--exclude', 'vantare-admin', '--bins', '--profile', 'prueba') }
    }
    if ($Packages.Count) {
        $arguments = @($arguments | Where-Object { $_ -ne '--workspace' })
        foreach ($package in $Packages) { $arguments += @('-p', $package) }
    }
    # Analysis launches storage as a real process. Include that package in the same
    # test build to preserve the executable prerequisite without a second feature graph.
    if ($Gate -in @('test', 'completa', 'archive') -and $Packages.Count -and
        'vantare-storage' -cnotin $Packages -and
        ('vantare-hub' -cin $Packages)) {
        $arguments += @('-p', 'vantare-storage')
    }
    # Jobs de compilación: CARGO_BUILD_JOBS de la máquina o 2 (#1465). En nextest
    # `-j` son hilos de test; los jobs van en --build-jobs.
    $jobs = if ($env:CARGO_BUILD_JOBS) { $env:CARGO_BUILD_JOBS } else { '4' }
    if ($Gate -eq 'lifecycle' -and $IsWindows) {
        # Normal para cierre real; QA sólo para invocar los manejadores de bandeja.
        & (Join-Path $PSScriptRoot 'runtime/tests/lifecycle/build-overlays.ps1') -TargetDirectory $TargetDirectory
    }
    $jobsFlag = if ($Gate -in @('test', 'telemetria', 'completa')) { '--build-jobs' } else { '-j' }
    # --target-dir y no CARGO_TARGET_DIR: sccache mete las variables CARGO_* en su clave
    # y así comparte caché con los builds de los workers en sus targets propios.
    $arguments += @('--target-dir', $TargetDirectory, '--locked', '--offline', $jobsFlag, $jobs)
    if ($Gate -ne 'captura') {
        $arguments += '--no-default-features'
        if ($defaults.Count) { $arguments += @('--features', ($defaults -join ',')) }
    }
    if ($Gate -in @('clippy', 'captura')) { $arguments += @('--', '-D', 'warnings') }
    if ($Gate -eq 'archive') {
        $messages = @(& cargo @arguments)
        if ($LASTEXITCODE) { $messages | Write-Host; throw "Gate $Gate falló (código $LASTEXITCODE)." }
        $decoded = @($messages | ForEach-Object { $_ | ConvertFrom-Json })
        $decoded | Where-Object reason -EQ 'compiler-message' | ForEach-Object { Write-Host $_.message.rendered }
        # Engineer and Runtime both have a target named lifecycle. Preserve both
        # original harnesses, keyed by package rather than choosing the first name.
        $artifacts = @($decoded | Where-Object {
            $_.reason -eq 'compiler-artifact' -and $_.target.name -eq 'lifecycle' -and $_.executable
        })
        $expected = @($members | Where-Object {
            (-not $Packages.Count -or $_.name -cin $Packages) -and
            @($_.targets | Where-Object name -CEQ 'lifecycle').Count
        })
        if ($artifacts.Count -ne $expected.Count) { throw 'Falta algún ejecutable lifecycle de la selección.' }
        $lifecycle = Join-Path $TargetDirectory 'debug/ci-lifecycle'
        [IO.Directory]::CreateDirectory($lifecycle) | Out-Null
        $entries = @()
        foreach ($artifact in $artifacts) {
            $owner = @($expected | Where-Object id -CEQ $artifact.package_id)
            if ($owner.Count -ne 1) { throw 'No se pudo identificar el paquete del arnés lifecycle.' }
            $image = "$($owner[0].name).exe"
            Copy-Item -LiteralPath $artifact.executable -Destination (Join-Path $lifecycle $image) -Force
            $entries += [ordered]@{
                package = $owner[0].name
                directory = [IO.Path]::GetRelativePath($PSScriptRoot, (Split-Path $owner[0].manifest_path))
                image = $image
            }
        }
        ConvertTo-Json -InputObject @($entries) | Set-Content (Join-Path $lifecycle 'manifest.json') -Encoding utf8
        Copy-Item -LiteralPath (Join-Path $directory 'duckdb.dll') -Destination (Join-Path $TargetDirectory 'debug/duckdb.dll') -Force
        $archive = @('nextest', 'archive') + @($arguments | Select-Object -Skip 1 |
            Where-Object { $_ -notin @('--no-run', '--message-format=json') } |
            ForEach-Object { if ($_ -eq '-j') { '--build-jobs' } else { $_ } })
        & cargo @archive --profile ci --archive-file (Join-Path $TargetDirectory 'nextest-tests.tar.zst')
        if ($LASTEXITCODE) { throw 'No se pudo archivar el build de tests.' }
    } else {
        & cargo @arguments
        if ($LASTEXITCODE) { throw "Gate $Gate falló (código $LASTEXITCODE)." }
    }
    if ($Gate -in @('check', 'clippy') -and (-not $Packages.Count -or 'vantare-runtime' -cin $Packages)) {
        # El banco no forma parte del build normal, pero también debe compilar.
        $bench = @($Gate, '-p', 'vantare-runtime', '--all-targets', '--features', 'bench',
            '--target-dir', $TargetDirectory, '--locked', '--offline', '-j', $jobs)
        if ($Gate -eq 'clippy') { $bench += @('--', '-D', 'warnings') }
        & cargo @bench
        if ($LASTEXITCODE) { throw "Check bench falló (código $LASTEXITCODE)." }
    }
    if ($Gate -eq 'prueba') {
        Copy-Item -LiteralPath (Join-Path $directory 'duckdb.dll') -Destination (Join-Path $TargetDirectory 'prueba/duckdb.dll') -Force
        "Binarios públicos de prueba en $TargetDirectory/prueba; no distribuir ni medir rendimiento con este perfil."
    }
} finally {
    [Environment]::SetEnvironmentVariable('CARGO_TARGET_DIR', $previousTarget, 'Process')
    if ($null -eq $previousNativeRoot) { Remove-Item Env:VANTARE_NATIVE_DATA_ROOT -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('VANTARE_NATIVE_DATA_ROOT', $previousNativeRoot, 'Process') }
    if ($null -eq $previousLocalData) { Remove-Item Env:LOCALAPPDATA -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('LOCALAPPDATA', $previousLocalData, 'Process') }
    if ($null -eq $previousRoamingData) { Remove-Item Env:APPDATA -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('APPDATA', $previousRoamingData, 'Process') }
    if ($null -ne $previousConfig) { Restore-NativeBuildConfig $previousConfig }
    if ($null -eq $previousIncremental) { Remove-Item Env:CARGO_INCREMENTAL -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('CARGO_INCREMENTAL', $previousIncremental, 'Process') }
    if ($null -eq $previousDirectory) { Remove-Item Env:DUCKDB_LIB_DIR -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('DUCKDB_LIB_DIR', $previousDirectory, 'Process') }
    $env:PATH = $previousPath
    Pop-Location
}
