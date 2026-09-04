[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$Exe,
 [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedGitSha,
 [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$ExpectedBuildSha256,
 [string[]]$Scenarios = @('hub-visible','overlay-idle'),
 [ValidateRange(1,20)][int]$Repetitions = 5,
 [ValidateRange(1,120)][int]$WarmupSeconds = 10,
 [ValidateRange(5,120)][int]$MeasurementSeconds = 60,
 [string]$OutputDirectory = (Join-Path ([IO.Path]::GetTempPath()) ('VantareAstra-' + [guid]::NewGuid().ToString('N')))
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7 -or -not $IsWindows) { throw 'Requires PowerShell 7 on Windows.' }
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$binary = (Resolve-Path -LiteralPath $Exe).Path
$head = (& git -C $root rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedGitSha) { throw 'Checkout SHA differs from expected SHA.' }
$dirty = & git -C $root status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Tracked checkout must be clean.' }
if ((Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash -ne $ExpectedBuildSha256) { throw 'Binary hash differs from expected build artifact.' }
$buildInfo = @(& go version -m $binary 2>$null)
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Go build metadata.' }
$revisionLine = $buildInfo | Where-Object { $_ -match 'vcs.revision=' } | Select-Object -First 1
if ($revisionLine -and (($revisionLine -split 'vcs.revision=')[1].Trim() -ne $head)) { throw 'Embedded build revision differs from checkout.' }
if ($buildInfo -match 'vcs.modified=true') { throw 'Binary built from modified sources; provide a clean build.' }
# Without embedded vcs.revision, the caller supplies provenance through the expected CI hash.
$provenance = if ($revisionLine) { 'embedded-revision-and-expected-hash' } else { 'operator-supplied-CI-hash; revision-not-embedded' }
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'scenarios.json') -Raw | ConvertFrom-Json
$selected = foreach ($id in $Scenarios) {
 $match = @($config.scenarios | Where-Object { $_.id -eq $id })
 if ($match.Count -ne 1) { throw "Unsupported scenario: $id" }
 $match[0]
}
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output must be a new directory; no previous run is overwritten.' }
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$share = Join-Path $OutputDirectory 'sanitized'
$private = Join-Path $OutputDirectory 'private-do-not-upload'
New-Item -ItemType Directory -Path $share,$private | Out-Null
$system = Get-CimInstance Win32_OperatingSystem
$environment = [ordered]@{
 schema='vantare.astra.windows.v1'; gitSha=$head; buildSha256=$ExpectedBuildSha256.ToLowerInvariant(); provenance=$provenance
 os=$system.Caption; osVersion=$system.Version; architecture=$env:PROCESSOR_ARCHITECTURE
 cpu=@(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors)
 gpu=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion)
 ramBytes=(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
 powershell=$PSVersionTable.PSVersion.ToString(); go=(& go version); node=(& node --version); pnpm=(& pnpm --version)
 repetitions=$Repetitions; warmupSeconds=$WarmupSeconds; measurementSeconds=$MeasurementSeconds
 canonicalRuntimeState='UNKNOWN until successful captures'; startupMarkers='UNKNOWN'; obsPhysical='UNKNOWN'
}
$environment | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $share 'environment.json') -Encoding utf8
$summary = [Collections.Generic.List[object]]::new()
Push-Location $root
try {
 foreach ($scenario in $selected) {
  # Warm-up is a separate discarded process run. Recorded runs remain process-cold;
  # filesystem/OS caches can be warm. This does not claim warm in-process startup.
  for ($iteration = 0; $iteration -le $Repetitions; $iteration++) {
   $phase = if ($iteration -eq 0) { 'warmup' } else { 'measurement' }
   $duration = if ($iteration -eq 0) { $WarmupSeconds } else { $MeasurementSeconds }
   $name = '{0}-{1}-{2:D2}' -f $scenario.id,$phase,$iteration
   $raw = Join-Path $private $name
   New-Item -ItemType Directory -Path $raw | Out-Null
   $arguments = @{
    Condicion=$scenario.condition; Exe=$binary; Perfil='testdata/bench/huella-endurance-3.json'
    Duracion=$duration; Puerto=9247; Salida=$raw; Escena=$scenario.id
   }
   if (-not $scenario.gameRequired) { $arguments.SinJuego=$true }
   if ($scenario.PSObject.Properties.Name -contains 'cars') { $arguments.Coches=$scenario.cars }
   $watch = [Diagnostics.Stopwatch]::StartNew()
   $state = 'FAILED'
   try {
    # Reuse the existing owner/cleanup/CDP/PresentMon implementation. No -Forzar:
    # foreign apps are never closed. Raw logs remain private and are not echoed.
    & (Join-Path $root 'scripts/bench/huella.ps1') @arguments *> (Join-Path $raw 'driver-private.log')
    if ($phase -eq 'measurement') {
     & (Join-Path $PSScriptRoot 'Collect-ProcessMetrics.ps1') -RawDirectory $raw -OutputFile (Join-Path $share "$name-process.csv")
     & (Join-Path $PSScriptRoot 'Collect-WebView2Metrics.ps1') -RawDirectory $raw -OutputFile (Join-Path $share "$name-webview.json")
     & (Join-Path $PSScriptRoot 'Collect-StartupMetrics.ps1') -RawDirectory $raw -OutputFile (Join-Path $share "$name-startup.json") -ScenarioSeconds $watch.Elapsed.TotalSeconds
    }
    if ((Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash -ne $ExpectedBuildSha256) { throw 'Build changed during capture.' }
    $state = 'CAPTURED'
   } catch {
    $state = 'FAILED'
    throw 'Capture failed; inspect private local logs without sharing them.'
   } finally {
    $watch.Stop()
    $summary.Add([pscustomobject]@{scenario=$scenario.id;phase=$phase;iteration=$iteration;state=$state;scenarioSeconds=$watch.Elapsed.TotalSeconds})
    $summary | Export-Csv -LiteralPath (Join-Path $share 'runs.csv') -NoTypeInformation -Encoding utf8
    # This allowlisted log contains no exception payload, URL, account, token or path.
    "$name $state" | Add-Content -LiteralPath (Join-Path $share 'sanitized.log') -Encoding utf8
   }
  }
 }
} finally {
 Pop-Location
 # huella.ps1 finally closes only owned processes, disposes CDP, stops its ETW
 # session and restores debug-port env. Its profile/config directory is isolated.
}
Write-Output "Completed capture package: $share"
Write-Output 'Review publishable/GPU validity fields. Startup markers and additional scenarios remain UNKNOWN. Nothing uploaded.'
