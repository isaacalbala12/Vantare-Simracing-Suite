# Execution only: never invoke Cargo's compiler or acquire a build slot here.
param(
    [Parameter(Mandatory)][ValidateSet('test', 'telemetria', 'lifecycle')][string]$Suite,
    # Partición de nextest (`hash:1/2`, `count:2/3`, `slice:1/3`). Vacía = todo.
    # Las particiones son disjuntas y exhaustivas: 1/2 + 2/2 = la suite completa.
    [string]$Partition = ''
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($Partition -and $Partition -notmatch '^(hash|count|slice):[0-9]+/[0-9]+$') {
    throw 'Partición de nextest inválida.'
}
if ($Suite -eq 'lifecycle' -and $Partition) { throw 'lifecycle no acepta particiones.' }
$target = [IO.Path]::GetFullPath((Join-Path $env:RUNNER_TEMP 'vantare-targets/ci'))
$downloadRoot = (Join-Path $env:RUNNER_TEMP 'vantare-test-archive')
$native = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot))
$revision = & git -C $native rev-parse HEAD
if ($LASTEXITCODE) { throw 'No se pudo leer el SHA de la ejecución.' }

# El reparto del archive produce uno o dos artefactos. Se aceptan los dos
# diseños: `a/` + `b/` (partido) y la raíz (archivo único).
$archives = @()
foreach ($label in @('a', 'b')) {
    $directory = Join-Path $downloadRoot $label
    $scopeFile = Join-Path $directory 'ci-scope.json'
    if (Test-Path -LiteralPath $scopeFile) {
        $archives += [pscustomobject]@{
            label = $label
            directory = $directory
            scope = Get-Content -LiteralPath $scopeFile -Raw | ConvertFrom-Json
        }
    }
}
if (-not $archives.Count -and (Test-Path -LiteralPath (Join-Path $downloadRoot 'ci-scope.json'))) {
    $archives += [pscustomobject]@{
        label = 'all'
        directory = $downloadRoot
        scope = Get-Content -LiteralPath (Join-Path $downloadRoot 'ci-scope.json') -Raw | ConvertFrom-Json
    }
}
if (-not $archives.Count) { throw 'No hay ningún archivo de tests descargado.' }
foreach ($entry in $archives) {
    $scope = $entry.scope
    if ($scope.revision -cne $revision -or $scope.workspace -ine $native -or $scope.target -ine $target) {
        throw "El archivo de tests $($entry.label) no corresponde al SHA, workspace o target actual."
    }
}
$telemetryScope = @($archives | Where-Object { $_.scope.telemetry }).Count -gt 0
$lifecycleScope = @($archives | Where-Object { $_.scope.lifecycle -and @($_.scope.packages).Count }).Count -gt 0
$overlays = @($archives | Where-Object { $_.scope.overlays }).Count -gt 0
if (($Suite -eq 'telemetria' -and -not $telemetryScope) -or
    ($Suite -eq 'lifecycle' -and -not $lifecycleScope)) {
    Write-Host "$Suite no corresponde al diff; integración conserva la cobertura completa."
    return
}

function Merge-Directory([string]$Source, [string]$Destination) {
    [IO.Directory]::CreateDirectory($Destination) | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
        $child = Join-Path $Destination $item.Name
        if ($item.PSIsContainer) { Merge-Directory $item.FullName $child }
        else { Copy-Item -LiteralPath $item.FullName -Destination $child -Force }
    }
}

# Solo los grupos con tests aportan binarios. Un grupo vacío sube un marcador.
$selected = @($archives | Where-Object { @($_.scope.packages).Count })
if ($Suite -eq 'telemetria') {
    $selected = @($selected | Where-Object { $_.scope.packages -contains 'vantare-runtime' })
    if (-not $selected.Count) { throw 'El corpus de telemetría no está en ningún archivo del reparto.' }
}
if (-not $selected.Count) { throw 'No hay binarios de test que ejecutar.' }

# Keep the original absolute target: several existing process tests embed Cargo paths.
if (Test-Path -LiteralPath $target) { throw 'El job de ejecución debe empezar sin target de compilación.' }
. (Join-Path $PSScriptRoot 'target-slot.ps1')
if (-not (Test-VantareTargetPath $target)) { throw 'Target de ejecución fuera de RUNNER_TEMP.' }
[IO.Directory]::CreateDirectory($target) | Out-Null
$metadataDirs = @()
foreach ($entry in $selected) {
    $extract = (Join-Path $env:RUNNER_TEMP "vantare-test-extract-$($entry.label)")
    if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }
    [IO.Directory]::CreateDirectory($extract) | Out-Null
    & cargo-nextest nextest list --archive-file (Join-Path $entry.directory 'nextest-tests.tar.zst') --extract-to $extract --list-type binaries-only --profile ci
    if ($LASTEXITCODE) { throw "No se pudo extraer el archivo de tests $($entry.label)." }
    $extractedTarget = Join-Path $extract 'target'
    if (-not (Test-Path -LiteralPath $extractedTarget)) { throw "El archivo $($entry.label) no contiene target." }
    Merge-Directory $extractedTarget $target
    # La extracción siguiente pisa `nextest/` y el manifiesto: conservar los de este grupo.
    $metadata = Join-Path $target 'nextest'
    if (Test-Path -LiteralPath $metadata) {
        $saved = Join-Path $target "nextest-$($entry.label)"
        if (Test-Path -LiteralPath $saved) { Remove-Item -LiteralPath $saved -Recurse -Force }
        Copy-Item -LiteralPath $metadata -Destination $saved -Recurse -Force
    }
    $manifest = Join-Path $target 'debug/ci-lifecycle/manifest.json'
    if (Test-Path -LiteralPath $manifest) {
        Copy-Item -LiteralPath $manifest -Destination (Join-Path $target "debug/ci-lifecycle/manifest-$($entry.label).json") -Force
    }
}
if (-not (Test-VantareTargetPath $target)) { throw 'Extracción fuera de RUNNER_TEMP.' }
$env:VANTARE_NATIVE_DATA_ROOT = Join-Path $target 'qa-data'
$env:LOCALAPPDATA = $env:VANTARE_NATIVE_DATA_ROOT
$env:APPDATA = $env:VANTARE_NATIVE_DATA_ROOT
[IO.Directory]::CreateDirectory($env:VANTARE_NATIVE_DATA_ROOT) | Out-Null
$env:TMP = Join-Path $target 'tmp'
$env:TEMP = $env:TMP
[IO.Directory]::CreateDirectory($env:TMP) | Out-Null
$env:PATH = "$(Join-Path $target 'debug');$env:PATH"
Push-Location $native
try {
    if ($Suite -eq 'lifecycle') {
        if ($overlays) {
            $overlayArchive = Join-Path $env:RUNNER_TEMP 'vantare-overlay-archive'
            $overlayRevision = (Get-Content -LiteralPath (Join-Path $overlayArchive 'source-sha.txt') -Raw).Trim()
            if ($overlayRevision -cne $revision) { throw 'Los overlays archivados pertenecen a otro SHA.' }
            foreach ($variant in @('normal', 'qa')) {
                $source = Join-Path $overlayArchive $variant
                if (-not (Test-Path -LiteralPath (Join-Path $source 'vantare-overlays.exe'))) { throw "Faltan overlays $variant." }
                $destination = Join-Path $target "debug/lifecycle/$variant"
                [IO.Directory]::CreateDirectory($destination) | Out-Null
                Copy-Item -LiteralPath (Join-Path $source 'vantare-overlays.exe') -Destination $destination -Force
            }
        }
        $lifecycle = @()
        foreach ($entry in $selected) {
            $manifest = Join-Path $target "debug/ci-lifecycle/manifest-$($entry.label).json"
            if (Test-Path -LiteralPath $manifest) {
                $lifecycle += @(Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json)
            }
        }
        $lifecycle = @($lifecycle | Sort-Object package -Unique)
        if (-not $lifecycle.Count) { throw 'El scope exige lifecycle pero no hay arneses archivados.' }
        foreach ($artifact in $lifecycle) {
            $working = [IO.Path]::GetFullPath((Join-Path $native $artifact.directory))
            if (-not $working.StartsWith($native + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
                [IO.Path]::GetFileName($artifact.image) -cne $artifact.image) { throw 'Ruta del arnés fuera del archivo esperado.' }
            $env:CARGO_MANIFEST_DIR = $working
            $env:CARGO_PKG_NAME = $artifact.package
            Push-Location $working
            try {
                & (Join-Path $target "debug/ci-lifecycle/$($artifact.image)")
                if ($LASTEXITCODE) { throw "Lifecycle de $($artifact.package) falló: $LASTEXITCODE" }
            } finally { Pop-Location }
        }
    } else {
        if ($Suite -eq 'test') {
            # Architecture tests embed env!(CARGO): install the exact prebuilt
            # toolchain at that path before invoking it, without compiling.
            & rustup toolchain install 1.99.1 --profile minimal --no-self-update
            if ($LASTEXITCODE) { throw 'No se pudo instalar el toolchain precompilado 1.99.1.' }
            & rustup run 1.99.1 cargo --version
            if ($LASTEXITCODE) { throw 'No se pudo preparar Cargo 1.99.1 para los tests de arquitectura.' }
            # A restored source cache can predate Cargo.lock. The archive contains
            # binaries, not registry metadata; offline architecture tests still
            # resolve every workspace member (including unbuilt crates).
            & rustup run 1.99.1 cargo fetch --locked --target x86_64-pc-windows-msvc
            if ($LASTEXITCODE) { throw 'No se pudieron preparar las fuentes del workspace para los tests offline.' }
            & rustup run 1.99.1 cargo tree --offline --locked --workspace --depth 0 --prefix none
            if ($LASTEXITCODE) { throw 'El workspace no se puede resolver sin red tras preparar las fuentes.' }
        }
        $env:CARGO_TARGET_DIR = $target
        $profile = if ($Suite -eq 'telemetria') { 'telemetria' } else { 'default' }
        $partitionArgs = if ($Partition) { @('--partition', $Partition) } else { @() }
        foreach ($entry in $selected) {
            $metadata = Join-Path $target "nextest-$($entry.label)"
            $binaries = Join-Path $metadata 'binaries-metadata.json'
            $cargoMetadata = Join-Path $metadata 'cargo-metadata.json'
            if (-not (Test-Path -LiteralPath $binaries)) { throw "Falta la metadata de nextest de $($entry.label)." }
            & cargo-nextest nextest run --binaries-metadata $binaries --cargo-metadata $cargoMetadata --profile $profile @partitionArgs
            if ($LASTEXITCODE) { throw "Suite $Suite ($($entry.label)) falló (código $LASTEXITCODE)." }
        }
    }
} finally { Pop-Location }
