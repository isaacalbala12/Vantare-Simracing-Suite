param(
    [int] $Port = 54677,
    [int] $Rounds = 3,
    [string] $OutputCsv = (Join-Path $PSScriptRoot 'evidence/gpu-adapter-static-results.csv')
)

$ErrorActionPreference = 'Stop'
if ($Rounds -lt 1) { throw 'Rounds must be positive' }
if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
    throw "Go host is not listening on port $Port"
}

$endpoint = "http://127.0.0.1:$Port/telemetry/overlay-v2/projection"
$variants = @(
    [pscustomobject]@{ Name = 'Wails'; Exe = 'out/wails/vantare-native-go-wails.exe'; Args = @('-endpoint', $endpoint, '-mode', 'editor') }
    [pscustomobject]@{ Name = 'Qt'; Exe = 'out/package-qt-trimmed/vantare-native-go-qt.exe'; Args = @('--endpoint', $endpoint, '--mode', 'editor') }
    [pscustomobject]@{ Name = 'Slint'; Exe = 'slint/target/release/vantare-native-go-slint.exe'; Args = @('--endpoint', $endpoint, '--mode', 'editor') }
)
$rows = @()
for ($round = 1; $round -le $Rounds; $round++) {
    for ($offset = 0; $offset -lt $variants.Count; $offset++) {
        $variant = $variants[($round - 1 + $offset) % $variants.Count]
        $exe = Join-Path $PSScriptRoot $variant.Exe
        if (-not (Test-Path -LiteralPath $exe)) { throw "Missing candidate: $exe" }
        $json = & (Join-Path $PSScriptRoot 'measure-windows.ps1') `
            -Executable $exe -Arguments $variant.Args -Label editor `
            -WarmupSeconds 3 -Samples 5 -MeasureAdapterDedicated
        $sample = $json | ConvertFrom-Json
        $baseline = ($sample.AdapterBeforeMiB + $sample.AdapterAfterMiB) / 2
        $rows += [pscustomobject]@{
            Round = $round
            Candidate = $variant.Name
            AdapterBeforeMiB = $sample.AdapterBeforeMiB
            AdapterDuringMiB = $sample.MedianAdapterDedicatedMiB
            AdapterAfterMiB = $sample.AdapterAfterMiB
            AdapterDeltaMiB = [math]::Round(($sample.MedianAdapterDedicatedMiB - $baseline), 1)
            ProcessGpuLocalMiB = $sample.MedianGpuLocalMiB
            WorkingSetMiB = $sample.MedianWorkingSetMiB
            PrivateMiB = $sample.MedianPrivateMiB
            CpuMachinePercent = $sample.MeanCpuMachinePercent
            Processes = $sample.ProcessCount
            ProcessNames = $sample.ProcessNames
        }
    }
}
$rows | Export-Csv -LiteralPath $OutputCsv -NoTypeInformation -Encoding utf8
$rows | ConvertTo-Json -Compress
