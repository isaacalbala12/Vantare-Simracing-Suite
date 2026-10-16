# Trae las copias de Plane del servidor 192.168.1.57 (pull, sin credenciales del PC principal en el servidor). 30 días.
$ErrorActionPreference = 'Stop'
$dest = Join-Path $env:USERPROFILE 'Backups\VantareServer\plane'
New-Item -ItemType Directory -Force $dest | Out-Null
$log = Join-Path $env:USERPROFILE 'Backups\VantareServer\pull.log'
try {
  $remote = ssh -o BatchMode=yes -o ConnectTimeout=15 Administrator@192.168.1.57 'cmd /c dir /b C:\VantareServer\backups\plane\plane-*.tar.zst'
  if ($LASTEXITCODE) { throw "ssh rc=$LASTEXITCODE" }
  $new = @($remote | ? { $_ -match '^plane-\d{8}-\d{4}\.tar\.zst$' -and -not (Test-Path (Join-Path $dest $_)) })
  foreach ($f in $new) {
    scp -q -o BatchMode=yes "Administrator@192.168.1.57:C:/VantareServer/backups/plane/$f" (Join-Path $dest ".$f.tmp")
    if ($LASTEXITCODE) { throw "scp $f rc=$LASTEXITCODE" }
    Move-Item -Force (Join-Path $dest ".$f.tmp") (Join-Path $dest $f) }
  Get-ChildItem $dest -Filter 'plane-*.tar.zst' | ? LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item
  Add-Content $log "$(Get-Date -f s) OK nuevas=$($new.Count) total=$((Get-ChildItem $dest -Filter 'plane-*.tar.zst').Count)"
} catch { Add-Content $log "$(Get-Date -f s) ERROR $($_.Exception.Message)"; throw }
