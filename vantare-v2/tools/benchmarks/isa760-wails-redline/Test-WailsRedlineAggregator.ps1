[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $RunsetDirectory
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $RunsetDirectory).Path
$measure = Join-Path $PSScriptRoot 'Measure-WailsRedlineBaseline.ps1'
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) "isa760-aggregator-test-$([guid]::NewGuid().ToString('N'))"
$validOutput = Join-Path $testRoot 'summary-valid.json'
$corrupt = Join-Path $testRoot 'corrupt'
New-Item -ItemType Directory -Path $corrupt | Out-Null
try {
    & $measure -RunsetDirectory $source -OutputPath $validOutput | Out-Null
    if (-not (Test-Path -LiteralPath $validOutput)) { throw 'valid runset was not aggregated' }
    Get-ChildItem -LiteralPath $source -File -Filter '*.json' | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $corrupt
    }
    $manifest = Get-Content -Raw -LiteralPath (Join-Path $corrupt 'manifest.json') | ConvertFrom-Json
    $firstTrace = Join-Path $corrupt $manifest.runs[0].trace
    Add-Content -LiteralPath $firstTrace -Value 'tampered' -Encoding utf8NoBOM
    $rejected = $false
    try {
        & $measure -RunsetDirectory $corrupt -OutputPath (Join-Path $corrupt 'summary-corrupt.json') | Out-Null
    }
    catch {
        $rejected = $_.Exception.Message -like 'trace hash mismatch*'
    }
    if (-not $rejected) { throw 'corrupted trace was not rejected by its custody hash' }
}
finally {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}

Write-Output 'VALID aggregator accepts the runset and rejects a tampered trace'
