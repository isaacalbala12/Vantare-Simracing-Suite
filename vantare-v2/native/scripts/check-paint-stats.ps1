# The diagnostic feature is outside normal product builds; compile it explicitly.
$ErrorActionPreference='Stop'
$testOut=Join-Path ([IO.Path]::GetTempPath()) ('overlay-orchestration-'+[guid]::NewGuid().ToString('N'))
& pwsh -NoProfile -File (Join-Path $PSScriptRoot 'test-overlay-campaign.ps1') -Out $testOut
if ($LASTEXITCODE) { throw 'Overlay campaign orchestration regression' }
foreach ($pattern in @('test_measurement_v2.py','test_overlay_ab.py')) {
 & python -m unittest discover -s $PSScriptRoot -p $pattern
 if ($LASTEXITCODE) { throw 'Overlay measurement analysis regression' }
}
$jobs=if ($env:CARGO_BUILD_JOBS) { $env:CARGO_BUILD_JOBS } else { '2' }
foreach ($gate in @('check','clippy')) {
 $arguments=@($gate,'--manifest-path',(Join-Path $PSScriptRoot '../Cargo.toml'),'--locked',
  '-p','vantare-ui','-p','vantare-profiling','--all-targets','--features','vantare-ui/paint-stats','-j',$jobs)
 if ($gate -eq 'clippy') { $arguments+=@('--','-D','warnings') }
 & (Join-Path $PSScriptRoot 'compilar.ps1') cargo @arguments
 if ($LASTEXITCODE) { throw "paint-stats $gate failed" }
}
