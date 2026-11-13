# Control A/A en el PC; el servidor vuelve a calcular desde los CSV originales.
function Get-VantareMedian([double[]]$Values){
 $ordered=@($Values|Sort-Object)
 if(-not $ordered.Count){throw 'Mediana sin datos.'}
 $i=[int][math]::Floor($ordered.Count/2)
 if($ordered.Count%2){return $ordered[$i]}
 ($ordered[$i-1]+$ordered[$i])/2
}
function Get-VantareCpuControl {
 param([object[]]$Rows,[int]$RootProcessId,[long]$Frequency,[long]$StartQpc,[long]$EndQpc)
 $samples=@($Rows|Where-Object {[long]$_.qpc -ge $StartQpc -and [long]$_.qpc -le $EndQpc}|Group-Object qpc|Sort-Object {[long]$_.Name})
 if($samples.Count -lt 2 -or [long]$samples[0].Name-$StartQpc -gt 1.5*$Frequency -or $EndQpc-[long]$samples[-1].Name -gt 1.5*$Frequency){throw 'CPU A/A sin cobertura.'}
 $identities=@{};$previous=$null;$previousClock=0L;$rates=[Collections.Generic.List[double]]::new()
 foreach($sample in $samples){
  $current=@{}
  foreach($row in $sample.Group){
   $processId=[int]$row.process_id
   if($current.ContainsKey($processId) -or -not $row.created_utc){throw 'Proceso CPU duplicado o sin identidad.'}
   if($identities.ContainsKey($processId) -and $identities[$processId] -ne $row.created_utc){throw 'PID CPU reutilizado.'}
   $identities[$processId]=$row.created_utc
   $current[$processId]=[long]$row.cpu_cycles
  }
  if(-not $current.ContainsKey($RootProcessId)){throw 'CPU sin raíz.'}
  if($null -ne $previous){
   $seconds=([long]$sample.Name-$previousClock)/[double]$Frequency
   if($seconds -lt .25 -or $seconds -gt 1.75 -or $current.Count -ne $previous.Count){throw 'CPU con huecos o familia variable.'}
   $delta=0.0
   foreach($processId in $current.Keys){
    if(-not $previous.ContainsKey($processId) -or $current[$processId] -lt $previous[$processId]){throw 'CPU ausente o contador retrocedido.'}
    $delta+=$current[$processId]-$previous[$processId]
   }
   $rates.Add($delta/$seconds)
  }
  $previous=$current;$previousClock=[long]$sample.Name
 }
 Get-VantareMedian $rates.ToArray()
}
function Get-VantareControlRatio {
 param([object[]]$Rows,[string]$Metric='cpu_control_cycles_s')
 if($Rows.Count -ne 4 -or (($Rows|ForEach-Object {$_.role}) -join '') -notin @('ABBA','BAAB')){throw 'Control sin bloque contrabalanceado.'}
 $times=@($Rows|ForEach-Object {[double]$_.midpoint_qpc})
 if(@($times|Sort-Object -Unique).Count -ne 4){throw 'Control con tiempos repetidos.'}
 $mean=($times|Measure-Object -Average).Average
 $xx=0.0;$bb=0.0;$xb=0.0;$xy=0.0;$by=0.0
 for($i=0;$i -lt 4;$i++){
  if($i -gt 0 -and $times[$i] -le $times[$i-1]){throw 'Control fuera de orden.'}
  $value=[double]$Rows[$i].$Metric
  if($value -le 0 -or [double]::IsNaN($value) -or [double]::IsInfinity($value)){throw 'Coste A/A no válido.'}
  $x=$times[$i]-$mean;$b=if($Rows[$i].role -eq 'B'){.5}else{-.5};$y=[math]::Log($value)
  $xx+=$x*$x;$bb+=$b*$b;$xb+=$x*$b;$xy+=$x*$y;$by+=$b*$y
 }
 $det=$xx*$bb-$xb*$xb
 if($det -le 0){throw 'No se puede separar deriva temporal y papel B.'}
 [math]::Exp(($by*$xx-$xy*$xb)/$det)
}
function Get-VantareLoadControl {
 param([string]$Csv,[int]$ProcessId,[long]$Frequency,[long]$StartQpc,[long]$EndQpc)
 $frames=@(Import-Csv $Csv|Where-Object {[int]$_.ProcessID -eq $ProcessId}|Where-Object {
  $submit=[long]$_.CPUStartQPC+[long][math]::Round((Convert-VantareCounterNumber $_.MsCPUBusy)*$Frequency/1000)
  $submit -ge $StartQpc -and $submit -lt $EndQpc
 })
 if(-not $frames.Count -or @($frames.SwapChainAddress|Sort-Object -Unique).Count -ne 1){throw 'Carga sin una sola cadena PresentMon.'}
 $values=[Collections.Generic.List[double]]::new()
 for($i=0;$i -lt $frames.Count;$i++){
  $value=Convert-VantareCounterNumber $frames[$i].MsBetweenPresents
  if($value -eq 0 -and $i -eq 0){continue}
  if($value -le 0){throw 'Intervalo de la carga ausente.'}
  $values.Add($value)
 }
 $sorted=@($values.ToArray()|Sort-Object)
 if(-not $sorted.Count){throw 'Carga sin fotogramas válidos.'}
 $position=($sorted.Count-1)*.99;$low=[int][math]::Floor($position);$high=[math]::Min($low+1,$sorted.Count-1)
 $sorted[$low]+($sorted[$high]-$sorted[$low])*($position-$low)
}
