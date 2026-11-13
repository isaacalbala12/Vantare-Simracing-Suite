$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'CONTROL_AA.ps1')
foreach($order in @('ABBA','BAAB')){
 $rows=@(for($i=0;$i -lt 4;$i++){
  $role=[string]$order[$i]
  $value=100*[math]::Exp(.1*$i)*$(if($role -eq 'B'){1.02}else{1})
  [pscustomobject]@{role=$role;midpoint_qpc=1000000+1000*$i;cpu_control_cycles_s=$value}
 })
 $ratio=Get-VantareControlRatio -Rows $rows
 if([math]::Abs($ratio-1.02) -gt 1e-10){throw 'Se confundió deriva temporal con diferencia A/A.'}
}
$processes=@(
 [pscustomobject]@{qpc=100;process_id=5;created_utc='one';cpu_cycles=0}
 [pscustomobject]@{qpc=200;process_id=5;created_utc='one';cpu_cycles=100}
 [pscustomobject]@{qpc=300;process_id=5;created_utc='one';cpu_cycles=300}
)
$value=Get-VantareCpuControl -Rows $processes -RootProcessId 5 -Frequency 100 -StartQpc 100 -EndQpc 300
if($value -ne 150){throw 'La CPU debe usar mediana de tasas por intervalo.'}
$processes[2].created_utc='reused';$caught=$false
try{Get-VantareCpuControl -Rows $processes -RootProcessId 5 -Frequency 100 -StartQpc 100 -EndQpc 300|Out-Null}catch{$caught=$true}
if(-not $caught){throw 'Aceptó un PID reutilizado.'}
'PASS: A/A separa deriva temporal, conserva tasas y rechaza PID reutilizado.'
