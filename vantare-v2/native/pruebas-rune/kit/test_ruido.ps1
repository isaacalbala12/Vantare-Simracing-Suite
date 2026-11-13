$ErrorActionPreference='Stop'
. $args[0]
. (Join-Path $PSScriptRoot 'RUIDO.ps1')
$rows=@(foreach($clock in 100,200,300){
 [pscustomobject]@{qpc=$clock;counter='process_id';instance='otro';value='42';status=0}
 [pscustomobject]@{qpc=$clock;counter='process_cpu';instance='otro';value='128';status=0}
})
$result=Measure-VantareNoise -Counters $rows -ExcludedProcessIds @() -LogicalProcessors 64 -StartQpc 100 -EndQpc 300 -Frequency 100
if(-not $result.noise_ok -or $result.max_other_cpu_percent -ne 2){throw 'El 2% exacto no debe invalidar ni recortar contadores a 100.'}
$rows[1].value='129'
$result=Measure-VantareNoise -Counters $rows -ExcludedProcessIds @() -LogicalProcessors 64 -StartQpc 100 -EndQpc 300 -Frequency 100
if($result.noise_ok){throw 'No detectó proceso por encima del 2%.'}
$result=Measure-VantareNoise -Counters $rows -ExcludedProcessIds @(42) -LogicalProcessors 64 -StartQpc 100 -EndQpc 300 -Frequency 100
if(-not $result.noise_ok){throw 'No excluyó el proceso propio.'}
$caught=$false
try { Measure-VantareNoise -Counters $rows[1..5] -ExcludedProcessIds @() -LogicalProcessors 64 -StartQpc 100 -EndQpc 300 -Frequency 100 | Out-Null } catch {$caught=$true}
if(-not $caught){throw 'Aceptó CPU sin PID.'}
'PASS: ruido sintético; sin abrir contadores.'
