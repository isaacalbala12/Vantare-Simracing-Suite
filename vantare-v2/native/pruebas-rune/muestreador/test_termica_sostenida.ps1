$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'TERMICA.ps1')
function Case([int]$Bad,[string]$Counter='cpu_performance',[hashtable]$Policy=@{},[hashtable]$Reference=@{}){
 $rows=@(foreach($i in 1..60){
  foreach($name in @('cpu_active_time','cpu_performance','cpu_limit','cpu_limit_flags')){
   $value=switch($name){cpu_active_time{25} cpu_performance{110} cpu_limit{100} cpu_limit_flags{0}}
   if($i -le $Bad -and $name -eq $Counter){$value=if($name -eq 'cpu_limit_flags'){1}else{90}}
   [pscustomobject]@{qpc=$i*1000;counter=$name;instance='0,0';value=[string]$value;status=0}
  }
  [pscustomobject]@{qpc=$i*1000;counter='gpu_engine';instance='pid_42_luid_0x0_0x1_phys_0_eng_0_engtype_3D';value='2';status=0}
 })
 $temps=@(foreach($i in 1..60){[pscustomobject]@{qpc=$i*1000;adapter='luid_0x00000000_0x00000001';status=0;caps_status=0;temperature_c='60';warning_c='90'}})
 Measure-VantareThermals -Counters $rows -Temperatures $temps -ProcessIds @(42) -Frequency 1000 -StartQpc 1000 -EndQpc 60000 -Policy $Policy -ReferenceGpu $Reference
}
foreach($counter in @('cpu_performance','cpu_limit','cpu_limit_flags')){
 if(-not(Case 1 $counter).valid){throw 'Un pico aislado no debe invalidar.'}
 if(-not(Case 6 $counter).valid){throw 'El 10% exacto no supera el límite.'}
 if((Case 7 $counter).valid){throw 'No se detectó limitación sostenida >10%.'}
}
if((Case 0 -Reference @{luid_0x00000000_0x00000001=54}).valid){throw 'No se detectó deriva GPU entre rondas.'}
if(-not(Case 0 -Reference @{luid_0x00000000_0x00000001=56}).valid){throw 'Se rechazó deriva dentro del margen.'}
'PASS: CPU aislada/10%/sostenida y deriva GPU; datos sintéticos, sin sensores.'
