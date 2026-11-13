function Initialize-VantareLoad {
 param($Kit,[int]$Hz,[string]$Directory)
 Assert-VantareGamePc
 if (Test-Path $Directory) { throw 'La calibración debe ser nueva.' }
 $null=New-Item -ItemType Directory -Path $Directory
 $sampler=$null;$load=$null
 try {
  $rootFile=Join-Path $Directory 'raiz.json'
  $pwsh=(Get-Process -Id $PID).Path
  $sampler=Start-VantareChild -Binary $pwsh -Arguments @('-NoProfile','-File',(Join-Path $Kit.Root 'muestreador/MUESTREAR.ps1'),'-RootInfoFile',$rootFile,'-PresentMon',$Kit.Paths['bin/PresentMon-2.6.0-x64.exe'],'-OutputDirectory',(Join-Path $Directory 'muestreo'),'-Seconds','30') -LogPrefix (Join-Path $Directory 'muestreador')
  $deadline=[DateTime]::UtcNow.AddSeconds(30)
  while (-not (Test-Path (Join-Path $Directory 'muestreo/CAPTURA-LISTA.json'))) {
   if ($sampler.Process.HasExited -or [DateTime]::UtcNow -ge $deadline) { throw 'No empezó la captura de calibración.' }
   Start-Sleep -Milliseconds 100
  }
  $load=Start-VantareChild -Binary $Kit.Binaries.load.path -Arguments @('--hz',[string]$Hz,'--seconds','60','--output',(Join-Path $Directory 'carga.csv'),'--ready',(Join-Path $Directory 'lista.json'),'--control-stdin') -LogPrefix (Join-Path $Directory 'carga')
  Write-VantareRootIdentity -Child $load -Sha256 $Kit.Binaries.load.sha256 -Path $rootFile
  while (-not $sampler.Process.HasExited) {
   if ($load.Process.HasExited) { throw 'La carga terminó durante la calibración.' }
   Start-Sleep -Milliseconds 100
  }
  $status=Close-VantareChild $sampler;$sampler=$null
  if ($status.forced -or $status.exit_code -ne 0) { throw 'Captura de calibración inválida.' }
  $status=Close-VantareChild $load;$load=$null
  if ($status.forced -or $status.exit_code -ne 0) { throw 'Calibración inválida.' }
  $ready=Get-Content (Join-Path $Directory 'lista.json') -Raw | ConvertFrom-Json
  if (-not $ready.ready -or $ready.hz -ne $Hz -or $ready.iterations -lt 1) { throw 'Calibración fuera del intervalo permitido.' }
  # Se conserva PresentMon sin overlays como control de la carga base.
  $ready | ConvertTo-Json | Out-File -Width 2147483647 (Join-Path $Directory 'calibracion.json') -NoClobber
  [int]$ready.iterations
 } finally {
  foreach ($child in @($load,$sampler)) { if ($null -ne $child -and -not $child.Closed) { Close-VantareChild $child | Out-Null } }
 }
}
