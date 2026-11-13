# Puro: trabaja sobre el CSV, sin abrir contadores.
function Measure-VantareNoise {
 param([object[]]$Counters,[int[]]$ExcludedProcessIds,[int]$LogicalProcessors,
       [long]$StartQpc,[long]$EndQpc,[long]$Frequency)
 if ($LogicalProcessors -lt 1 -or $Frequency -le 0 -or $StartQpc -ge $EndQpc) { throw 'Parámetros de ruido inválidos.' }
 $samples=@($Counters | Where-Object {[long]$_.qpc -ge $StartQpc -and [long]$_.qpc -le $EndQpc} | Group-Object qpc | Sort-Object {[long]$_.Name})
 if ($samples.Count -lt 2 -or [long]$samples[0].Name-$StartQpc -gt 1.5*$Frequency -or $EndQpc-[long]$samples[-1].Name -gt 1.5*$Frequency) { throw 'Cobertura de ruido incompleta.' }
 $offenders=[Collections.Generic.List[object]]::new();$maximum=0.0;$previous=0L;$totals=@{}
 foreach ($sample in $samples) {
  $clock=[long]$sample.Name
  if ($previous -gt 0 -and ($clock-$previous -gt 1.75*$Frequency -or $clock-$previous -lt .25*$Frequency)) { throw 'Hueco o duplicación temporal del ruido.' }
  $previous=$clock;$ids=@{};$cpu=@{}
  foreach ($row in $sample.Group) {
   if ($row.counter -notin @('process_id','process_cpu')) { continue }
   $table=if($row.counter -eq 'process_id'){$ids}else{$cpu}
   if ($table.ContainsKey($row.instance)) { throw 'Instancia duplicada.' }
   $table[$row.instance]=$row
  }
  if (-not $ids.Count -or -not $cpu.Count) { throw 'Faltan contadores CPU por proceso.' }
  foreach ($instance in $cpu.Keys) {
   if ($instance -in @('_Total','Idle')) { continue }
   if (-not $ids.ContainsKey($instance) -or [uint32]$ids[$instance].status -notin @(0,1)) { throw 'CPU sin identidad válida.' }
   $number=Convert-VantareCounterNumber $ids[$instance].value
   if ($number -ne [math]::Floor($number)) { throw 'PID no entero.' }
   $processId=[int]$number
   if ($processId -eq 0 -or $processId -in $ExcludedProcessIds) { continue }
   if ([uint32]$cpu[$instance].status -notin @(0,1)) { throw 'Ruido sin valor verificable.' }
   $percent=(Convert-VantareCounterNumber $cpu[$instance].value)/$LogicalProcessors
   $maximum=[math]::Max($maximum,$percent)
   if(-not $totals.ContainsKey($processId)){$totals[$processId]=0.0}
   $totals[$processId]+=$percent
  }
 }
 $maxMean=0.0
 foreach($processId in $totals.Keys){$mean=$totals[$processId]/$samples.Count;$maxMean=[math]::Max($maxMean,$mean);if($mean -gt 2){$offenders.Add([pscustomobject]@{process_id=$processId;mean_percent_machine=$mean})}}
 [pscustomobject]@{noise_ok=($offenders.Count -eq 0);max_other_cpu_percent=$maximum;max_other_mean_cpu_percent=$maxMean;policy='per PID mean over full round; missing process contributes zero';offenders=$offenders.ToArray()}
}
