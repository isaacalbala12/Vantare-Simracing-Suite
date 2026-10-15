param([Parameter(Mandatory)][int]$GameId,
      [Parameter(Mandatory)][string]$Output,
      [int]$Seconds=180)
$ErrorActionPreference='Stop'
$originalCulture=[Threading.Thread]::CurrentThread.CurrentCulture
[Threading.Thread]::CurrentThread.CurrentCulture=[Globalization.CultureInfo]::InvariantCulture
$logical=(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$os=Get-CimInstance Win32_OperatingSystem
$totalBytes=[double]$os.TotalVisibleMemorySize*1024
$clock=[Diagnostics.Stopwatch]::StartNew()
$previous=@{}
$previousTime=0.0
$rows=[Collections.Generic.List[object]]::new()
# CPU total via Win32 GetSystemTimes, independent of localized performance counters.
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BenchSystemTimes {
 [DllImport("kernel32.dll", SetLastError=true)]
 public static extern bool GetSystemTimes(out long idle,out long kernel,out long user);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);
}
'@
[long]$idle=0; [long]$kernel=0; [long]$user=0
if(-not [BenchSystemTimes]::GetSystemTimes([ref]$idle,[ref]$kernel,[ref]$user)){throw 'GetSystemTimes failed'}
$lastIdle=$idle; $lastTotal=$kernel+$user
while($clock.Elapsed.TotalSeconds -lt $Seconds){
 $now=$clock.Elapsed.TotalSeconds
 $processes=@(Get-Process)
 $memory=Get-CimInstance Win32_OperatingSystem
 if(-not [BenchSystemTimes]::GetSystemTimes([ref]$idle,[ref]$kernel,[ref]$user)){throw 'GetSystemTimes failed'}
 $systemTotal=$kernel+$user
 $denominator=$systemTotal-$lastTotal
 $systemCpu=if($denominator -gt 0){100*(1-($idle-$lastIdle)/$denominator)}else{0}
 [uint32]$foreground=0
 $null=[BenchSystemTimes]::GetWindowThreadProcessId([BenchSystemTimes]::GetForegroundWindow(),[ref]$foreground)
 foreach($p in $processes){
  # Names and counters only; never command lines, environment or private session data.
  try {
   $cpu=$p.TotalProcessorTime.TotalSeconds
   $created=$p.StartTime.ToUniversalTime().Ticks
   $key="$($p.Id):$created"
   $percent=if($previous.ContainsKey($key) -and $now -gt $previousTime){100*($cpu-$previous[$key])/(($now-$previousTime)*$logical)}else{$null}
   $previous[$key]=$cpu
   $rows.Add([pscustomobject]@{seconds=$now;utc=[DateTime]::UtcNow.ToString('o');pid=$p.Id;name=$p.ProcessName;cpu_percent=$percent;working_set_bytes=$p.WorkingSet64;system_cpu_percent=$systemCpu;system_used_bytes=$totalBytes-1024*[double]$memory.FreePhysicalMemory;game_present=($processes.Id -contains $GameId);foreground_pid=$foreground})
  }catch { }
 }
 $lastIdle=$idle; $lastTotal=$systemTotal; $previousTime=$now
 $remaining=1-($clock.Elapsed.TotalSeconds-$now)
 if($remaining -gt 0){Start-Sleep -Milliseconds ([int](1000*$remaining))}
}
$rows | Export-Csv -LiteralPath $Output -NoTypeInformation -Encoding utf8
[Threading.Thread]::CurrentThread.CurrentCulture=$originalCulture
