[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SourceReplay,
    [Parameter(Mandatory)][string]$SourceManifest,
    [Parameter(Mandatory)][string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$replayPath = (Resolve-Path -LiteralPath $SourceReplay).Path
$manifestPath = (Resolve-Path -LiteralPath $SourceManifest).Path
$output = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw "output directory already exists: $output" }
$sourceBytes = [IO.File]::ReadAllBytes($replayPath)
$sourceSha = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($sourceBytes)).ToLowerInvariant()
$manifestDocument = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$declaredSourceSha = [string]$manifestDocument.replay.sha256
if (-not $sourceSha.Equals($declaredSourceSha, [StringComparison]::Ordinal)) {
    throw 'source replay differs from its manifest'
}

$lines = [Text.UTF8Encoding]::new($false, $true).GetString($sourceBytes).Split("`n", [StringSplitOptions]::RemoveEmptyEntries)
if ($lines.Count -ne 2466) { throw 'source replay must contain the exact 2466-record corpus' }
$outputLines = [Collections.Generic.List[string]]::new($lines.Count)
$sceneLines = @{}
foreach ($line in $lines) {
    $record = $line | ConvertFrom-Json
    if (-not $sceneLines.ContainsKey([string]$record.sceneId)) {
        $sceneLines[[string]$record.sceneId] = [Collections.Generic.List[string]]::new()
    }
    if ($record.sceneId -eq 'standings-full') {
        $sourceRows = @($record.viewModel.rows)
        if ($sourceRows.Count -le 0) { throw 'standings-full source rows are absent' }
        $sourcePlayer = -1
        for ($index = 0; $index -lt $sourceRows.Count; $index++) {
            if ($sourceRows[$index].isPlayer -eq $true) { $sourcePlayer = $index; break }
        }
        $seenClasses = @{}
        $stressRows = @()
        for ($index = 0; $index -lt 104; $index++) {
            $source = $sourceRows[$index % $sourceRows.Count]
            $row = [ordered]@{}
            foreach ($property in $source.PSObject.Properties) { $row[$property.Name] = $property.Value }
            $row.id = 'stress-{0:d3}' -f ($index + 1)
            $row.position = $index + 1
            $row.driverName = '{0} S{1:d3}' -f $source.driverName, ($index + 1)
            $row.isPlayer = $index -eq $sourcePlayer
            $vehicleClass = [string]$source.vehicleClass
            $row.isLeader = -not $seenClasses.ContainsKey($vehicleClass)
            $seenClasses[$vehicleClass] = $true
            $stressRows += $row
        }
        $record.viewModel.rows = $stressRows
    }
    $serialized = $record | ConvertTo-Json -Depth 20 -Compress
    $outputLines.Add($serialized)
    $sceneLines[[string]$record.sceneId].Add($serialized)
}

$utf8 = [Text.UTF8Encoding]::new($false)
$replayBytes = $utf8.GetBytes(($outputLines -join "`n") + "`n")
$replaySha = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($replayBytes)).ToLowerInvariant()
$manifestDocument.replay.path = 'redline-viewmodels-stress104-v1.jsonl'
$manifestDocument.replay.sha256 = $replaySha
foreach ($scene in $manifestDocument.scenes) {
    $bytes = $utf8.GetBytes(($sceneLines[[string]$scene.id] -join "`n") + "`n")
    $scene.sha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}
$manifestDocument | Add-Member -NotePropertyName benchmarkProfile -NotePropertyValue ([ordered]@{
    id = 'standings-stress104-v1'
    sourceReplaySha256 = $sourceSha
    transformedScene = 'standings-full'
    rows = 104
    generatorSha256 = (Get-FileHash $MyInvocation.MyCommand.Path -Algorithm SHA256).Hash.ToLowerInvariant()
})

New-Item -ItemType Directory -Path $output | Out-Null
$replayOutput = Join-Path $output 'redline-viewmodels-stress104-v1.jsonl'
$manifestOutput = Join-Path $output 'redline-viewmodels-stress104-v1.manifest.json'
[IO.File]::WriteAllBytes($replayOutput, $replayBytes)
$manifestText = ($manifestDocument | ConvertTo-Json -Depth 20).Replace("`r`n", "`n") + "`n"
[IO.File]::WriteAllText($manifestOutput, $manifestText, $utf8)
Write-Output "replay=$replayOutput"
Write-Output "manifest=$manifestOutput"
Write-Output "replaySha256=$replaySha"
