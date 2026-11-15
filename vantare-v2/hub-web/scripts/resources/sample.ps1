param(
 [Parameter(Mandatory)][int]$RootProcessId,
 [ValidateRange(2,60)][int]$Seconds = 20,
 [Parameter(Mandatory)][string]$Output
)
$ErrorActionPreference = 'Stop'
# Windows private committed bytes and resident working set are different metrics.
# Do not persist command lines: use them only to classify this process tree.
$machine = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$root = Get-Process -Id $RootProcessId
$rootStart = $root.StartTime.ToUniversalTime().Ticks
$timer = [Diagnostics.Stopwatch]::StartNew()
$samples = [Collections.Generic.List[object]]::new()
$previous = @{}
$roles = @{}
do {
 $root = Get-Process -Id $RootProcessId -ErrorAction Stop
 if ($root.StartTime.ToUniversalTime().Ticks -ne $rootStart) { throw 'Root PID reused' }
 $tree = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId)
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
  try {
   $key = "$($p.Id):$($p.StartTime.ToUniversalTime().Ticks)"
   $cpu = $p.TotalProcessorTime.TotalSeconds
   $private = $p.PrivateMemorySize64
   $working = $p.WorkingSet64
  } catch {
   if($p.HasExited){continue}
   throw
  }
  if (!$roles.ContainsKey($key)) {
   $command = if($p.Id -eq $RootProcessId){''} else {
    (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -Property CommandLine).CommandLine
   }
   $roles[$key] = if ($p.Id -eq $RootProcessId) { 'main' }
    elseif ($command -match '--type=gpu-process') { 'gpu' }
    elseif ($command -match '--type=renderer') { 'renderer' }
    elseif ($command -match '--type=utility') { 'utility' }
    else { 'other' }
  }
  $kind = $roles[$key]
  $at = $timer.Elapsed.TotalSeconds
  $percent = $null
  if ($previous.ContainsKey($key)) {
   $old = $previous[$key]
   $percent = [Math]::Max(0, 100 * ($cpu - $old.cpu) / ($at - $old.at))
  }
  $previous[$key] = @{cpu=$cpu;at=$at}
  $samples.Add([pscustomobject]@{
   pid=$p.Id; identity=$key; role=$kind; elapsedSeconds=$at
   privateBytes=$private; workingSetBytes=$working
   cpuOneCorePercent=$percent
  })
 }
 # One-second sampling is part of the measurement, not UI synchronization.
 Start-Sleep -Milliseconds 1000
} while ($timer.Elapsed.TotalSeconds -lt $Seconds)
[pscustomobject]@{
 schema=1; rootPid=$RootProcessId; logicalProcessors=[int]$machine.NumberOfLogicalProcessors
 physicalMemoryBytes=[long]$machine.TotalPhysicalMemory; availableMemoryKiB=[long]$os.FreePhysicalMemory
 elapsedSeconds=$timer.Elapsed.TotalSeconds; samples=$samples.ToArray()
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Output -Encoding utf8
