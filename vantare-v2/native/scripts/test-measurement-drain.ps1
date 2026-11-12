# Real redirected pipes test buffered shutdown, not overlay performance.
$ErrorActionPreference='Stop'
. "$PSScriptRoot/measurement-processes.ps1"
Add-Type -TypeDefinition @'
using System.IO;
using System.Threading.Tasks;
public static class MeasurementDelayedReader {
 public static async Task<string> Read(StreamReader reader, int delay) {
  await Task.Delay(delay).ConfigureAwait(false);
  return await reader.ReadToEndAsync().ConfigureAwait(false);
 }
}
'@
function Start-DrainFixture([string]$Program) {
 $info=[Diagnostics.ProcessStartInfo]::new((Get-Process -Id $PID).Path)
 $info.UseShellExecute=$false; $info.CreateNoWindow=$true
 $info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
 foreach($arg in @('-NoLogo','-NoProfile','-NonInteractive','-Command',$Program)) { $info.ArgumentList.Add($arg) }
 $process=[Diagnostics.Process]::Start($info)
 $ready=$process.StandardOutput.ReadLineAsync()
 if (!$ready.Wait(10000) -or $ready.Result -ne 'ready') { $process.Kill(); $process.Dispose(); throw 'Fixture did not become ready' }
 return $process
}
$ui=$null; $core=$null
try {
 $ui=Start-DrainFixture "[Console]::Out.WriteLine('ready');[Console]::Out.Flush();[Console]::Error.Write(('x'*65536))"
 $core=Start-DrainFixture "[Console]::Out.WriteLine('ready');[Console]::Out.Flush();[Console]::In.ReadToEnd() | Out-Null;[Console]::Error.Write(('y'*65536))"
 # Intentionally delayed readers create real pipe backpressure after workloads
 # finish. Waiting is the behavior under test; no performance result is inferred.
 $uiRead=[MeasurementDelayedReader]::Read($ui.StandardError,1500)
 $coreRead=[MeasurementDelayedReader]::Read($core.StandardError,1500)
 $null=Wait-MeasurementDrain $ui $core 10000
 if ($ui.ExitCode -or $core.ExitCode -or $uiRead.GetAwaiter().GetResult().Length -ne 65536 -or $coreRead.GetAwaiter().GetResult().Length -ne 65536) { throw 'Buffered output was lost or shutdown failed' }
} finally {
 foreach($child in @($ui,$core)) { if($child){ if(!$child.HasExited){$child.Kill()};$child.WaitForExit();$child.Dispose()} }
}
$ui=$null; $core=$null
try {
 $waiting="[Console]::Out.WriteLine('ready');[Console]::Out.Flush();[Console]::In.ReadToEnd() | Out-Null"
 $ui=Start-DrainFixture $waiting
 $core=Start-DrainFixture $waiting
 $timedOut=$false
 try { $null=Wait-MeasurementDrain $ui $core 300 } catch [TimeoutException] { $timedOut=$true }
 if (!$timedOut -or $ui.HasExited) { throw 'A stuck process was not rejected by the deadline' }
} finally {
 foreach($child in @($ui,$core)) { if($child){ if(!$child.HasExited){$child.Kill()};$child.WaitForExit();$child.Dispose()} }
}
Write-Host 'PASS: real buffered writers drain completely; a stuck process hits the bounded deadline'
