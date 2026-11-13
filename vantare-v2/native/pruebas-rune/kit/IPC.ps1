function Read-VantareTrace {
 param([string]$Path)
 $lines=@(Get-Content -LiteralPath $Path)
 if ($lines.Count -lt 3 -or $lines[0] -notmatch '^# latency-v1,frequency=(\d+),overflow=0$' -or $lines[-1] -notmatch '^# end,rows=(\d+)$') { throw 'Traza incompleta o desbordada.' }
 $expected=[int]$Matches[1]
 $rows=@($lines[1..($lines.Count-2)] | ConvertFrom-Csv)
 if ($rows.Count -ne $expected) { throw 'Recuento de traza incorrecto.' }
 if ($lines[0] -notmatch 'frequency=(\d+)') { throw 'Frecuencia ausente.' }
 $frequency=[long]$Matches[1]
 if ($frequency -le 0) { throw 'Frecuencia no válida.' }
 foreach ($row in $rows) {
  foreach ($key in @('qpc','epoch','sequence','window')) {
   if ($row.$key -notmatch '^\d+$') { throw 'Identidad o reloj no válido.' }
  }
  if ([long]$row.qpc -le 0) { throw 'QPC ausente.' }
 }
 [pscustomobject]@{Frequency=$frequency;Rows=$rows}
}
function Test-VantareReplayDelivery {
 param([string]$Origin,[string]$Interface)
 $source=Read-VantareTrace $Origin;$ui=Read-VantareTrace $Interface
 if ($source.Frequency -ne $ui.Frequency) { throw 'Relojes IPC distintos.' }
 $published=[Collections.Generic.HashSet[string]]::new()
 foreach ($row in @($source.Rows | Where-Object phase -eq 'origin')) {
  if (-not $published.Add($row.epoch+':'+$row.sequence)) { throw 'Publicación repetida.' }
 }
 if ($published.Count -ne 3840) { throw 'No se conservan todas las publicaciones de la grabación.' }
 $sent=@($source.Rows | Where-Object phase -eq 'sent' | ForEach-Object {$_.epoch+':'+$_.sequence})
 $received=[Collections.Generic.List[string]]::new();$active=$false
 foreach ($row in @($ui.Rows | Where-Object phase -eq 'received')) {
  $id=$row.epoch+':'+$row.sequence
  if ($published.Contains($id)) { $active=$true;$received.Add($id) }
  elseif ($active) { throw 'Foto de otra reproducción tras comenzar la principal.' }
 }
 if (-not $sent.Count -or $sent.Count -ne $received.Count) { throw 'Envíos reales y recepciones distintos.' }
 $unique=[Collections.Generic.HashSet[string]]::new()
 for ($i=0;$i -lt $sent.Count;$i++) {
  if (-not $published.Contains($sent[$i]) -or -not $unique.Add($sent[$i]) -or $sent[$i] -ne $received[$i]) { throw 'Foto perdida, repetida o fuera de orden.' }
 }
 [pscustomobject]@{sent=$sent.Count;received=$received.Count;origin=$published.Count;frequency=$source.Frequency}
}
