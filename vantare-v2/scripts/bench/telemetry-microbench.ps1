param(
    [Parameter(Mandatory)][string]$Baseline,
    [Parameter(Mandatory)][string]$Candidate,
    [Parameter(Mandatory)][string]$Benchmark,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [ValidateRange(6, 30)][int]$Samples = 10
)

$ErrorActionPreference = 'Stop'
$Baseline = (Resolve-Path -LiteralPath $Baseline).Path
$Candidate = (Resolve-Path -LiteralPath $Candidate).Path
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Refusing to overwrite evidence directory' }
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$arguments = @('-test.run=^$', "-test.bench=$Benchmark", '-test.benchmem', '-test.benchtime=100ms', '-test.cpu=1', '-test.count=1')
@{
    startedUtc = [DateTime]::UtcNow.ToString('o')
    baseline = $Baseline
    candidate = $Candidate
    baselineSHA256 = (Get-FileHash -LiteralPath $Baseline -Algorithm SHA256).Hash
    candidateSHA256 = (Get-FileHash -LiteralPath $Candidate -Algorithm SHA256).Hash
    arguments = $arguments
    samples = $Samples
    cpu = (Get-CimInstance Win32_Processor).Name
    note = 'Local Go microbenchmark; not application CPU/RAM/GPU or LMU frametime evidence'
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'manifest.json') -Encoding utf8

for ($sample = 1; $sample -le $Samples; $sample++) {
    $order = if ($sample % 2) { @('baseline', 'candidate') } else { @('candidate', 'baseline') }
    foreach ($side in $order) {
        $binary = if ($side -eq 'baseline') { $Baseline } else { $Candidate }
        $lines = @(& $binary @arguments 2>&1)
        $benchmarkExit = $LASTEXITCODE
        $lines | Add-Content -LiteralPath (Join-Path $OutputDirectory "$side.txt") -Encoding utf8
        if ($benchmarkExit -ne 0) { throw "$side sample $sample failed with exit $benchmarkExit" }
        if (-not ($lines -match '^Benchmark.*ns/op')) { throw "$side matched no benchmark" }
    }
}

# Descriptive ranges only: no invented significance test or p-value.
$rows = foreach ($side in @('baseline', 'candidate')) {
    foreach ($line in Get-Content -LiteralPath (Join-Path $OutputDirectory "$side.txt")) {
        if ($line -match '^(Benchmark\S+)\s+\d+\s+([\d.]+) ns/op\s+([\d.]+) B/op\s+([\d.]+) allocs/op') {
            [pscustomobject]@{ Side = $side; Benchmark = $Matches[1]; Ns = [double]::Parse($Matches[2], [cultureinfo]::InvariantCulture); Bytes = [double]::Parse($Matches[3], [cultureinfo]::InvariantCulture); Allocs = [double]::Parse($Matches[4], [cultureinfo]::InvariantCulture) }
        }
    }
}
$baselineNames = @($rows | Where-Object Side -eq 'baseline' | Select-Object -ExpandProperty Benchmark -Unique)
$candidateNames = @($rows | Where-Object Side -eq 'candidate' | Select-Object -ExpandProperty Benchmark -Unique)
if (-not $baselineNames -or -not $candidateNames -or (Compare-Object $baselineNames $candidateNames)) { throw 'Baseline and candidate benchmark names differ or are empty' }
$summary = foreach ($group in $rows | Group-Object Side, Benchmark) {
    if ($group.Count -ne $Samples) { throw "Unexpected sample count for $($group.Name): $($group.Count)" }
    $values = @($group.Group.Ns | Sort-Object)
    $middle = [int][math]::Floor($values.Count / 2)
    $median = if ($values.Count % 2) { $values[$middle] } else { ($values[$middle - 1] + $values[$middle]) / 2 }
    [pscustomobject]@{ Side = $group.Group[0].Side; Benchmark = $group.Group[0].Benchmark; Samples = $group.Count; MedianNs = $median; MinNs = $values[0]; MaxNs = $values[-1]; MinBytes = ($group.Group.Bytes | Measure-Object -Minimum).Minimum; MaxBytes = ($group.Group.Bytes | Measure-Object -Maximum).Maximum; MinAllocs = ($group.Group.Allocs | Measure-Object -Minimum).Minimum; MaxAllocs = ($group.Group.Allocs | Measure-Object -Maximum).Maximum }
}
if (-not $summary) { throw 'No complete benchmark measurements to summarize' }
$summary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'summary.json') -Encoding utf8
$summary | Format-Table -AutoSize
