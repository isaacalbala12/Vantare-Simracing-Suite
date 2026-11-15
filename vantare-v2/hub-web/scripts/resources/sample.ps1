param(
 [Parameter(Mandatory)][int]$RootProcessId,
 [ValidateRange(2,60)][int]$Seconds = 20,
 [Parameter(Mandatory)][string]$Output
)
$ErrorActionPreference = 'Stop'
# Windows private committed bytes and resident working set are different metrics.
# Do not persist command lines: use them only to classify this process tree.
$root = Get-Process -Id $RootProcessId
$rootStart = $root.StartTime.ToUniversalTime().Ticks
$timer = [Diagnostics.Stopwatch]::StartNew()
$samples = [Collections.Generic.List[object]]::new()
$previous = @{}
do {
 $root = Get-Process -Id $RootProcessId -ErrorAction Stop
 if ($root.StartTime.ToUniversalTime().Ticks -ne $rootStart) { throw 'Root PID reused' }
 $tree = @(Get-CimInstance Win32_Process)
 $ids = [Collections.Generic.HashSet[int]]::new()
 [void]$ids.Add($RootProcessId)
 do {
  $added = $false
  foreach ($item in $tree) {
   if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $added = $true }
  }
 } while ($added)
 foreach ($item in $tree) {
  if (!$ids.Contains([int]$item.ProcessId)) { continue }
  $p = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
  if (!$p) { continue }
  $kind = if ($p.Id -eq $RootProcessId) { 'main' }
   elseif ($item.CommandLine -match '--type=gpu-process') { 'gpu' }
   elseif ($item.CommandLine -match '--type=renderer') { 'renderer' }
   elseif ($item.CommandLine -match '--type=utility') { 'utility' }
   else { 'other' }
  $at = $timer.Elapsed.TotalSeconds
  $key = "$($p.Id):$($p.StartTime.ToUniversalTime().Ticks)"
  $cpu = $p.TotalProcessorTime.TotalSeconds
  $percent = $null
  if ($previous.ContainsKey($key)) {
   $old = $previous[$key]
   $percent = [Math]::Max(0, 100 * ($cpu - $old.cpu) / ($at - $old.at))
  }
  $previous[$key] = @{cpu=$cpu;at=$at}
  $samples.Add([pscustomobject]@{
   pid=$p.Id; identity=$key; role=$kind; elapsedSeconds=$at
   privateBytes=$p.PrivateMemorySize64; workingSetBytes=$p.WorkingSet64
   cpuOneCorePercent=$percent
  })
 }
 # One-second sampling is part of the measurement, not UI synchronization.
 Start-Sleep -Milliseconds 1000
} while ($timer.Elapsed.TotalSeconds -lt $Seconds)
[pscustomobject]@{
 schema=1; rootPid=$RootProcessId; logicalProcessors=[Environment]::ProcessorCount
 elapsedSeconds=$timer.Elapsed.TotalSeconds; samples=$samples.ToArray()
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Output -Encoding utf8
