#requires -Version 7.0
param([Parameter(Mandatory)][string]$Directory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'PROCESOS.ps1')
Assert-VantareGamePc
$campaignLease=Enter-VantareCampaignLease
try {
$root=(Resolve-Path -LiteralPath $Directory).Path
if(Test-Path (Join-Path $root 'ejecucion.json')){throw 'Ya hay cierre registrado; conservarlo sin sobrescribir.'}
$run=Get-Content (Join-Path $root 'ejecucion-inicial.json') -Raw | ConvertFrom-Json -AsHashtable
$start=[DateTime]::Parse($run.started_utc).ToUniversalTime()
if(Test-Path (Join-Path $root 'raiz.json')){
 $identity=Get-Content (Join-Path $root 'raiz.json') -Raw | ConvertFrom-Json
 $process=Get-Process -Id $identity.process_id -ErrorAction SilentlyContinue
 if($null -ne $process -and [math]::Abs(($process.StartTime.ToUniversalTime()-[DateTime]::Parse($identity.created_utc).ToUniversalTime()).TotalMilliseconds) -lt 1){throw 'La interfaz propia sigue viva: no recuperar una ejecución activa.'}
}else{
 $boot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime()
 if($boot -le $start){throw 'Sin identidad de interfaz ni reinicio posterior: revisar los procesos antes de recuperar.'}
}
$events=@()
try{$events=@(Get-WinEvent -FilterHashtable @{LogName='System';StartTime=$start;Id=@(41,1001)} -ErrorAction Stop|Select-Object Id,ProviderName,TimeCreated,RecordId)}
catch{if($_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound*'){throw}}
$events|ConvertTo-Json -Depth 4|Out-File -Width 2147483647 (Join-Path $root 'incidentes-recuperados.json') -NoClobber
$run.finished=$false;$run.recovered=$true;$run.duration_s=0
$run.error='Ejecución interrumpida: no se consideran completadas cuatro horas'
$run.bugchecks=@($events|Where-Object {$_.Id -eq 1001 -and $_.ProviderName -match 'WER-SystemErrorReporting|BugCheck'}).Count
$run.unplanned_shutdowns=@($events|Where-Object Id -eq 41).Count
Get-ChildItem -LiteralPath (Join-Path $env:SystemRoot 'Minidump') -File -ErrorAction SilentlyContinue|Where-Object LastWriteTimeUtc -ge $start|Select-Object Name,Length,LastWriteTimeUtc|ConvertTo-Json|Out-File -Width 2147483647 (Join-Path $root 'volcados-recuperados-metadatos.json') -NoClobber
$run|ConvertTo-Json -Depth 8|Out-File -Width 2147483647 (Join-Path $root 'ejecucion.json') -NoClobber -Encoding utf8
$lock=Join-Path $root 'EN-CURSO.lock'
if(Test-Path -LiteralPath $lock){Remove-Item -LiteralPath $lock}
Write-Host 'Recuperado como INCOMPLETO. Conserva la carpeta y recoge los resultados; no se repite automáticamente.'

} finally { Exit-VantareCampaignLease $campaignLease }
