# Supervisión cada 5 min (SYSTEM). Solo log: C:\VantareServer\logs\health-AAAA-MM.log
$log = "C:\VantareServer\logs\health-$(Get-Date -f yyyy-MM).log"
$msg = @()
foreach ($u in 'vantare-ci','vantare-svc') {
  $t = Get-ScheduledTask -TaskName "WSL-$u" -TaskPath '\Vantare\' -ErrorAction SilentlyContinue
  if ($t -and $t.State -ne 'Running') { Start-ScheduledTask -InputObject $t; $msg += "WARN distro $u parada -> relanzada" } }
# WSL mirrored no expone Plane a otros usuarios de Windows: la distro vantare-svc lo comprueba
# (y reinicia tras 3 fallos) y deja un latido aquí.
$hb = 'C:\VantareServer\heartbeat\plane.txt'
if (-not (Test-Path $hb) -or (Get-Item $hb).LastWriteTime -lt (Get-Date).AddMinutes(-15)) { $msg += 'WARN sin latido de Plane >15 min (distro vantare-svc parada?)' }
elseif ((Get-Content $hb -Raw) -notmatch 'http=200') { $msg += "WARN plane: $((Get-Content $hb -Raw).Trim())" }
$r = Get-Service 'actions.runner.*' -ErrorAction SilentlyContinue
foreach ($s in $r) { if ($s.Status -ne 'Running') { $msg += "INFO runner $($s.Name) $($s.Status) (pausa manual o fallo)" } }
Get-Process Runner.Listener -ErrorAction SilentlyContinue | % { if ($_.PriorityClass -ne 'BelowNormal') { $_.PriorityClass = 'BelowNormal' } }
$free = [math]::Round((Get-PSDrive C).Free / 1GB)
if ($free -lt 30) { $msg += "WARN disco C: libre $free GB" }
$line = "$(Get-Date -f s) " + $(if ($msg) { $msg -join ' | ' } else { "OK plane=200 C=${free}GB" })
Add-Content $log $line
Get-ChildItem C:\VantareServer\logs\health-*.log | ? LastWriteTime -lt (Get-Date).AddDays(-31) | Remove-Item
