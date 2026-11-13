$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'TERMICA.ps1')
function Samples {
    foreach ($clock in @(1000,2000)) {
        foreach ($core in @('0,0','0,1')) {
            foreach ($name in @('cpu_active_time','cpu_performance','cpu_limit','cpu_limit_flags')) {
                $value=switch($name){cpu_active_time {if($core -eq '0,0'){25}else{0}} cpu_performance {if($core -eq '0,0'){125}else{0}} cpu_limit {100} cpu_limit_flags {0}}
                [pscustomobject]@{qpc=$clock;counter=$name;instance=$core;value=[string]$value;status=0}
            }
        }
        [pscustomobject]@{qpc=$clock;counter='gpu_engine';instance='pid_42_luid_0x0_0x1_phys_0_eng_0_engtype_3D';value='2';status=0}
    }
}
function Temperatures {
    foreach ($clock in @(1000,2000)) {
        [pscustomobject]@{qpc=$clock;adapter='luid_0x00000000_0x00000001';status=0;caps_status=0;temperature_c='60';warning_c='90'}
        # Adaptador ajeno sin sensor: no se confunde con la GPU del programa.
        [pscustomobject]@{qpc=$clock;adapter='luid_0x00000000_0x00000002';status=1;caps_status=1;temperature_c='';warning_c=''}
    }
}
function Run-ThermalCase($Rows,$Thermals) {
    Measure-VantareThermals -Counters $Rows -Temperatures $Thermals -ProcessIds @(42) -Frequency 1000 -StartQpc 0 -EndQpc 3000
}
$result=Run-ThermalCase @(Samples) @(Temperatures)
if (-not $result.valid -or $result.cpu_temperature_status -ne 'no_disponible' -or $null -ne $result.cpu_temperature_c) { throw 'Se inventó temperatura CPU o se rechazó un núcleo inactivo.' }
foreach ($name in @('cpu_performance','cpu_limit','cpu_limit_flags')) {
    $rows=@(Samples)
    ($rows | Where-Object { $_.counter -eq $name -and $_.instance -eq '0,0' } | Select-Object -First 1).value=if($name -eq 'cpu_limit_flags'){'1'}else{'99.9'}
    if ((Run-ThermalCase $rows @(Temperatures)).valid) { throw "No se detectó limitación CPU: $name" }
}
$thermal=@(Temperatures);$thermal[0].temperature_c='90'
if ((Run-ThermalCase @(Samples) $thermal).valid) { throw 'No se detectó el aviso térmico GPU.' }
$rejected=$false
try { Run-ThermalCase @((Samples) | Where-Object counter -ne 'cpu_limit_flags') @(Temperatures) | Out-Null } catch { $rejected=$true }
if (-not $rejected) { throw 'Datos CPU ausentes se trataron como sin limitación.' }
$missing=@(Temperatures);$missing[0].warning_c='';$rejected=$false
try{Run-ThermalCase @(Samples) $missing|Out-Null}catch{$rejected=$_.Exception.Message -match 'TemperatureWarning'}
if(-not $rejected){throw 'Sensor sin TemperatureWarning no se detectó antes de las rondas.'}
Write-Output 'PASS: turbo, reposo, throttling, frecuencia nominal, GPU y ausencia de sensor CPU; sin API nativa.'
