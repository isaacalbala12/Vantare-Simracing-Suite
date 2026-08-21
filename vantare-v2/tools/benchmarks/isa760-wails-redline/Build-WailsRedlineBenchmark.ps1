[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$toolRoot = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $toolRoot '..\..\..')).Path
$frontendRoot = Join-Path $repoRoot 'frontend'
$hostRoot = Join-Path $toolRoot 'host'
$binary = Join-Path $hostRoot 'bin\vantare-wails-redline-benchmark.exe'

$custody = @{
    'redline-viewmodels-v1.jsonl' = '9e7f791ab831762909ac832f4f7d0c19e5d012558cd0d2bc0a5505cd6f637059'
    'redline-viewmodels-v1.manifest.json' = '165e70fd918b5a93694f71e7be3846c306e9cd41a24e02243d5a368c575b5bcb'
    'redline-viewmodels-stress104-v1.jsonl' = '4b084cfb72078d837e1f2bb489a8d82d597d412c78c40180cd75c61b0ccbb60a'
    'redline-viewmodels-stress104-v1.manifest.json' = 'fb8d4f980c4f268bc14b3d96aec4a2e13838133484245c3dbb527ccd400487bf'
}
foreach ($entry in $custody.GetEnumerator()) {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $toolRoot "replay\$($entry.Key)")).Hash.ToLowerInvariant()
    if ($actual -ne $entry.Value) {
        throw "custody hash mismatch for $($entry.Key): $actual"
    }
}

Push-Location $repoRoot
try {
    & corepack pnpm --dir $frontendRoot exec vite build --config vite.wails-redline-benchmark.config.ts
    if ($LASTEXITCODE -ne 0) { throw "benchmark frontend build failed with exit code $LASTEXITCODE" }
    & go test ./tools/benchmarks/isa760-wails-redline/host
    if ($LASTEXITCODE -ne 0) { throw "benchmark host tests failed with exit code $LASTEXITCODE" }
    New-Item -ItemType Directory -Force -Path (Split-Path $binary) | Out-Null
    & go build -trimpath -buildvcs=false -o $binary ./tools/benchmarks/isa760-wails-redline/host
    if ($LASTEXITCODE -ne 0) { throw "benchmark host build failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}

[pscustomobject]@{
    binary = $binary
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $binary).Hash.ToLowerInvariant()
    bytes = (Get-Item -LiteralPath $binary).Length
} | Format-List
