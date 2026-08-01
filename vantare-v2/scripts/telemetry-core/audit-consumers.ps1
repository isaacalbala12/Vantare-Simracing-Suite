param(
    [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
Set-Location $RepoRoot

$productionDependencies = @(
    & go list -e -deps -f '{{.ImportPath}}' ./cmd/vantare
)
if ($LASTEXITCODE -ne 0) {
    throw "go list ./cmd/vantare failed"
}

$candidates = @(
    "internal/telemetry/delta",
    "internal/telemetry/diff",
    "internal/telemetry/fusion",
    "internal/telemetry/gap",
    "internal/telemetry/lmu",
    "internal/telemetry/lmuapi",
    "internal/telemetry/normalizer",
    "internal/telemetry/pipeline",
    "internal/telemetry/service",
    "pkg/models",
    "internal/engineer/lmu",
    "internal/engineer/simulator",
    "internal/engineer/replay",
    "internal/engineer/telemetry",
    "internal/engineer/telemetry/service"
)

Write-Output "GO_IMPORTS"
Write-Output "candidate|reachable_from_cmd_vantare|non_test_importers|test_importers"
foreach ($candidate in $candidates) {
    $importPath = "github.com/vantare/overlays/v2/$candidate"
    $matches = @(& rg -l --glob '*.go' --fixed-strings $importPath . 2>$null)
    if ($LASTEXITCODE -gt 1) {
        throw "rg failed for $candidate"
    }
    $normalized = @($matches | ForEach-Object { $_ -replace '^\.\\', '' } | Sort-Object)
    $nonTest = @($normalized | Where-Object { $_ -notmatch '_test\.go$' })
    $tests = @($normalized | Where-Object { $_ -match '_test\.go$' })
    $reachable = if ($productionDependencies -contains $importPath) { "yes" } else { "no" }
    Write-Output "$candidate|$reachable|$($nonTest -join ';')|$($tests -join ';')"
}

$frontendCandidates = @(
    "telemetry:update",
    "telemetry:source-status",
    "/telemetry/stream",
    "normalizeLegacyTelemetry",
    "createWailsTelemetryAdapter",
    "createSseTelemetryAdapter"
)

Write-Output "FRONTEND_AND_TRANSPORT_REFERENCES"
Write-Output "candidate|non_test_references|test_references"
foreach ($candidate in $frontendCandidates) {
    $matches = @(
        & rg -l --glob '*.go' --glob '*.ts' --glob '*.tsx' --fixed-strings $candidate cmd internal frontend/src 2>$null
    )
    if ($LASTEXITCODE -gt 1) {
        throw "rg failed for $candidate"
    }
    $normalized = @($matches | Sort-Object)
    $nonTest = @($normalized | Where-Object { $_ -notmatch '(_test\.go|\.test\.(ts|tsx))$' })
    $tests = @($normalized | Where-Object { $_ -match '(_test\.go|\.test\.(ts|tsx))$' })
    Write-Output "$candidate|$($nonTest -join ';')|$($tests -join ';')"
}
