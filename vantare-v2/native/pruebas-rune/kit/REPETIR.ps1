#requires -Version 7.0
param([Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]+$')][string]$Pipe,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'PROCESOS.ps1')
. (Join-Path $PSScriptRoot 'PREPARAR.ps1')
Assert-VantareGamePc
$kit=Read-VantareKit $PSScriptRoot
if(Test-Path $OutputDirectory){throw 'Usar registros nuevos para el repetidor.'}
$null=New-Item -ItemType Directory $OutputDirectory
$stop=[Console]::In.ReadLineAsync();$core=$null;$index=0
try {
 while(-not $stop.IsCompleted){
  $core=Start-VantareChild -Binary $kit.Binaries.core.path -Arguments @('--replay',$kit.Paths['datos/lmu47-high-rate-60s.tar.gz'],'--pipe',$Pipe) -LogPrefix (Join-Path $OutputDirectory ('nucleo-{0:D4}' -f $index)) -Variables @{
   VANTARE_REPLAY_WAIT_SUBSCRIBER='1';VANTARE_NATIVE_DATA_ROOT=(Join-Path $OutputDirectory 'datos-aislados')}
  $watch=[Diagnostics.Stopwatch]::StartNew()
  while(-not $stop.IsCompleted -and $watch.Elapsed.TotalSeconds -lt 65){
   if($core.Process.HasExited){throw 'El núcleo terminó inesperadamente.'}
   Start-Sleep -Milliseconds 100
  }
  $status=Close-VantareChild $core;$core=$null
  $status | ConvertTo-Json -Compress | Add-Content (Join-Path $OutputDirectory 'ciclos.jsonl')
  if($status.forced -or $status.exit_code -ne 0){throw 'El núcleo no cerró ordenadamente.'}
  $index++
 }
}finally{if($null -ne $core -and -not $core.Closed){Close-VantareChild $core|Out-Null}}
