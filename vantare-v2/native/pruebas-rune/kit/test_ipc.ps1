$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'IPC.ps1')
$folder=Join-Path ([IO.Path]::GetTempPath()) ('vanta141-ipc-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory $folder
$source=[Collections.Generic.List[string]]::new();$received=[Collections.Generic.List[string]]::new()
foreach($i in 1..3840){$source.Add("origin,$i,1,$i,0")}
$received.Add('received,1,0,1,0') # Calentamiento, no es pérdida ni replay principal.
foreach($i in 64..3840 | Where-Object {$_ % 64 -eq 0}){$source.Add("sent,$i,1,$i,0");$received.Add("received,$i,1,$i,0")}
function Write-Trace($path,$rows){@('# latency-v1,frequency=1000,overflow=0','phase,qpc,epoch,sequence,window')+@($rows)+@('# end,rows='+$rows.Count)|Set-Content $path}
$a=Join-Path $folder 'source.csv';$b=Join-Path $folder 'received.csv'
try {
 Write-Trace $a $source;Write-Trace $b $received
 $result=Test-VantareReplayDelivery $a $b
 if($result.sent -ne 60 -or $result.received -ne 60 -or $result.origin -ne 3840){throw 'Se confundió cadencia de demanda con pérdida de IPC.'}
 $received.RemoveAt(20);Write-Trace $b $received
 $caught=$false;try{Test-VantareReplayDelivery $a $b|Out-Null}catch{$caught=$true}
 if(-not $caught){throw 'Aceptó pérdida real de foto enviada.'}
 Set-Content $b 'traza parcial'
 $caught=$false;try{Test-VantareReplayDelivery $a $b|Out-Null}catch{$caught=$true}
 if(-not $caught){throw 'Aceptó una traza incompleta.'}
 'PASS: publicaciones omitidas por demanda válidas; pérdida real y cierre incompleto rechazados.'
}finally{Remove-Item -LiteralPath $a,$b -ErrorAction SilentlyContinue;Remove-Item -LiteralPath $folder}
