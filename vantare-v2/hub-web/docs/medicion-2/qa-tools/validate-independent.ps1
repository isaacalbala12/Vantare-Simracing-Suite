$ErrorActionPreference='Stop'
$evidence='D:/VantareServer/evidence/hub-web/medicion-2'
$statistics=Get-Content -LiteralPath (Join-Path $evidence 'statistics.json') -Raw | ConvertFrom-Json
function Assert-Measurement([bool]$Condition,[string]$Message) { if(-not $Condition){throw $Message} }
function Compare-Median([string]$Name,[double[]]$Values,$Expected) {
    Assert-Measurement ($Values.Count -eq 5) "$Name must contain five observations"
    Assert-Measurement ($null -ne $Expected) "$Name missing reported value"
    Assert-Measurement (@($Values | Where-Object {-not [double]::IsFinite($_)}).Count -eq 0) "$Name non-finite input"
    $sorted=@($Values | Sort-Object)
    $median=$sorted[2]
    Assert-Measurement ([Math]::Abs($median-[double]$Expected) -lt 0.000001) "$Name independent median disagrees"
    return @{metric=$Name;count=5;median=$median;reported=[double]$Expected}
}
$cases=@()
foreach($case in $statistics.results) {
    $directory=Join-Path $evidence $case.directory
    $complete=Get-Content -LiteralPath (Join-Path $directory 'complete.json') -Raw|ConvertFrom-Json
    Assert-Measurement ($complete.runs -eq 5) 'Only complete N=5 series qualify'
    $samples=@(Get-Content -LiteralPath (Join-Path $directory 'samples.json') -Raw|ConvertFrom-Json)
    $closed=@($samples|Where-Object phase -eq 'closed')
    Assert-Measurement ($closed.Count -eq 10) 'Ten controlled closes required'
    Assert-Measurement (@($closed|Where-Object {@($_.survivors).Count -ne 0}).Count -eq 0) 'A valid series left survivors'
    $checks=@()
    foreach($app in @('baseline','variant')) {
        $visible=@($samples|Where-Object {$_.phase -eq 'visible' -and $_.app -eq $app}|Sort-Object iteration)
        $checks+=Compare-Median "$app.visibleMs" @($visible|ForEach-Object {[double]$_.visibleMs}) $case.condition.$app.visibleMs.median
        foreach($section in @('settings','home')) {
            $rows=@($samples|Where-Object {$_.phase -eq 'idle' -and $_.app -eq $app -and $_.section -eq $section}|Sort-Object iteration)
            Assert-Measurement ($rows.Count -eq 5) 'Five idle samples per condition/view required'
            Assert-Measurement (@($rows.iteration|Sort-Object -Unique).Count -eq 5) 'Duplicate idle iteration'
            foreach($row in $rows) {
                $metrics=@($row.processMetrics)
                Assert-Measurement (@($metrics.pid|Sort-Object -Unique).Count -eq $metrics.Count) 'Duplicate process counted'
                Assert-Measurement ([double]($metrics|Measure-Object workingSetBytes -Sum).Sum -eq [double]$row.workingSetBytes) 'Working set does not reconcile'
                Assert-Measurement ([double]($metrics|Measure-Object privateBytes -Sum).Sum -eq [double]$row.privateBytes) 'Private memory does not reconcile'
                Assert-Measurement ($null -ne $row.cpuOneCorePercent) 'CPU missing, not zero'
                Assert-Measurement ($row.workingSetBytes -gt 0) 'Working set must be observed'
            }
            $reported=$case.condition.$app.$section
            $checks+=Compare-Median "$app.$section.workingMiB" @($rows|ForEach-Object {[double]$_.workingSetBytes/1MB}) $reported.workingMiB.median
            $checks+=Compare-Median "$app.$section.privateMiB" @($rows|ForEach-Object {[double]$_.privateBytes/1MB}) $reported.privateMiB.median
            $checks+=Compare-Median "$app.$section.cpuOneCorePercent" @($rows|ForEach-Object {[double]$_.cpuOneCorePercent}) $reported.cpuOneCorePercent.median
            $checks+=Compare-Median "$app.$section.gpuCount" @($rows|ForEach-Object {@($_.processMetrics|Where-Object role -eq 'gpu-process').Count}) $reported.gpuCount.median
            $heaps=@()
            foreach($row in $rows) {
                $detail=Get-Content -LiteralPath (Join-Path $directory "$app-$section-$($row.iteration).json") -Raw|ConvertFrom-Json
                Assert-Measurement ($null -ne $detail.heap.usedSize) 'Missing renderer heap'
                Assert-Measurement (@($detail.startup.deniedSchemes).Count -eq 0) 'Unexpected external network attempt'
                $heaps+=[double]$detail.heap.usedSize/1MB
            }
            $checks+=Compare-Median "$app.$section.heapUsedMiB" $heaps $reported.heapUsedMiB.median
        }
    }
    $deltas=@()
    foreach($iteration in 0..4) {
        $a=@($samples|Where-Object {$_.phase -eq 'idle' -and $_.app -eq 'baseline' -and $_.section -eq 'settings' -and $_.iteration -eq $iteration})
        $b=@($samples|Where-Object {$_.phase -eq 'idle' -and $_.app -eq 'variant' -and $_.section -eq 'settings' -and $_.iteration -eq $iteration})
        Assert-Measurement ($a.Count -eq 1 -and $b.Count -eq 1) 'Paired difference has ambiguous membership'
        $deltas+=([double]$b[0].workingSetBytes-[double]$a[0].workingSetBytes)/1MB
    }
    $checks+=Compare-Median 'paired.settingsWorkingMiB' $deltas $case.paired.settingsWorkingMiB.median
    $cases+=@{experiment=$case.experiment;directory=$case.directory;samplesSha256=(Get-FileHash -LiteralPath (Join-Path $directory 'samples.json')).Hash.ToLowerInvariant();checks=$checks;validCloses=10}
}
@{schema=1;generatedAt=(Get-Date -Format o);engine=$PSVersionTable.PSVersion.ToString();scope='Independent PowerShell recomputation from raw samples, no JavaScript statistics helpers';cases=$cases}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $evidence 'validation-independent.json')
Write-Output "Independent raw-data validation passed for $($cases.Count) complete series."
