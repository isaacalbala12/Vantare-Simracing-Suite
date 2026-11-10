# Execution only: never invoke Cargo's compiler or acquire a build slot here.
param([Parameter(Mandatory)][ValidateSet('test', 'telemetria', 'lifecycle')][string]$Suite)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$target = [IO.Path]::GetFullPath((Join-Path $env:RUNNER_TEMP 'vantare-targets/ci'))
$download = (Join-Path $env:RUNNER_TEMP 'vantare-test-archive')
$native = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot))
$scope = Get-Content -LiteralPath (Join-Path $download 'ci-scope.json') -Raw | ConvertFrom-Json
$revision = & git -C $native rev-parse HEAD
if ($LASTEXITCODE -or $scope.revision -cne $revision -or
    $scope.workspace -ine $native -or $scope.target -ine $target) {
    throw 'El archivo de tests no corresponde al SHA, workspace o target actual.'
}
if (($Suite -eq 'telemetria' -and -not $scope.telemetry) -or
    ($Suite -eq 'lifecycle' -and -not $scope.lifecycle)) {
    Write-Host "$Suite no corresponde al diff; integración conserva la cobertura completa."
    return
}
# Keep the original absolute target: several existing process tests embed Cargo paths.
$extract = (Join-Path $env:RUNNER_TEMP 'vantare-test-extract')
[IO.Directory]::CreateDirectory($extract) | Out-Null
& cargo-nextest nextest list --archive-file (Join-Path $download 'nextest-tests.tar.zst') --extract-to $extract --list-type binaries-only --profile ci
if ($LASTEXITCODE) { throw 'No se pudo extraer el archivo de tests.' }
if (Test-Path -LiteralPath $target) { throw 'El job de ejecución debe empezar sin target de compilación.' }
. (Join-Path $PSScriptRoot 'target-slot.ps1')
if (-not (Test-VantareTargetPath $target) -or -not (Test-VantareTargetPath $extract)) { throw 'Extracción fuera de RUNNER_TEMP.' }
[IO.Directory]::CreateDirectory((Split-Path $target)) | Out-Null
Move-Item -LiteralPath (Join-Path $extract 'target') -Destination $target
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
        $lifecycle = @(Get-Content (Join-Path $target 'debug/ci-lifecycle/manifest.json') -Raw | ConvertFrom-Json)
        if (-not $lifecycle.Count) { throw 'El scope exige lifecycle pero no hay arneses archivados.' }
        foreach ($artifact in $lifecycle | Sort-Object package) {
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
        $profile = if ($Suite -eq 'telemetria') { 'telemetria' } else { 'default' }
        & cargo-nextest nextest run --binaries-metadata (Join-Path $target 'nextest/binaries-metadata.json') --cargo-metadata (Join-Path $target 'nextest/cargo-metadata.json') --profile $profile
    }
    if ($LASTEXITCODE) { throw "Suite $Suite falló (código $LASTEXITCODE)." }
} finally { Pop-Location }
