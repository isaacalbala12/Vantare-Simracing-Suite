param([switch]$Child)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'PROCESOS.ps1')
if($Child){
 try{$lease=Enter-VantareCampaignLease;Exit-VantareCampaignLease $lease;exit 0}
 catch [InvalidOperationException]{exit 23}
 catch{exit 99}
}
function Run-Child {
 $info=[Diagnostics.ProcessStartInfo]::new((Get-Process -Id $PID).Path)
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true
 foreach($arg in @('-NoProfile','-File',$PSCommandPath,'-Child')){$info.ArgumentList.Add($arg)}
 $process=[Diagnostics.Process]::Start($info)
 try{if(-not $process.WaitForExit(10000)){$process.Kill($true);throw 'El test de mutex quedó bloqueado.'};$process.ExitCode}
 finally{$process.Dispose()}
}
$lease=Enter-VantareCampaignLease
try{if((Run-Child) -ne 23){throw 'Aceptó dos campañas simultáneas.'}}
finally{Exit-VantareCampaignLease $lease}
if((Run-Child) -ne 0){throw 'La campaña siguiente no recuperó la exclusión.'}
'PASS: mutex entre procesos; bloqueo concurrente y liberación comprobados sin gráfica.'
