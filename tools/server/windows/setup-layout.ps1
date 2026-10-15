$ErrorActionPreference = 'Stop'
. C:\VantareServer\ops\VantareCred.ps1
# ACLs: ops/logs solo admin+SYSTEM (lectura Users en ops\linux para las distros), backups admin+vantare-svc, secrets admin+vantare-svc lectura
icacls C:\VantareServer\ops /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' | Out-Null
icacls C:\VantareServer\ops\linux /grant 'vantare-ci:(OI)(CI)RX' 'vantare-svc:(OI)(CI)RX' | Out-Null
icacls C:\VantareServer\images /grant 'vantare-ci:(OI)(CI)RX' 'vantare-svc:(OI)(CI)RX' | Out-Null
foreach ($u in 'vantare-ci','vantare-svc') { if (Test-Path "C:\VantareServer\ops\as\$u") { icacls "C:\VantareServer\ops\as\$u" /grant "${u}:(OI)(CI)M" | Out-Null } }
icacls C:\VantareServer\logs /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' | Out-Null
New-Item -ItemType Directory -Force C:\VantareServer\backups\plane, C:\VantareServer\secrets, C:\VantareServer\heartbeat | Out-Null
icacls C:\VantareServer\heartbeat /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' 'vantare-svc:(OI)(CI)M' | Out-Null
icacls C:\VantareServer\backups /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' 'vantare-svc:(OI)(CI)M' | Out-Null
icacls C:\VantareServer\secrets /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' 'vantare-svc:(OI)(CI)R' | Out-Null
@('# Copiar a roadmap.env (mismo directorio) y rellenar EN LOCAL. Nunca por chat.',
  'CLICKUP_API_TOKEN=', 'PGHOST=', 'PGPORT=5432', 'PGDATABASE=postgres', 'PGUSER=vantare_roadmap_publisher.<project-ref>', 'PGPASSWORD=') |
  Set-Content C:\VantareServer\secrets\roadmap.env.example -Encoding ascii
# Hyper-V firewall: Plane (WSL mirrored) solo desde la LAN y Tailscale
$wsl = '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'
if (-not (Get-NetFirewallHyperVRule -Name VantarePlaneLAN -ErrorAction SilentlyContinue)) {
  New-NetFirewallHyperVRule -Name VantarePlaneLAN -DisplayName 'Vantare Plane LAN (WSL)' -Direction Inbound -VMCreatorId $wsl -Protocol TCP -LocalPorts 8088 -RemoteAddresses 192.168.1.0/24, 100.64.0.0/10 -Action Allow | Out-Null }
Get-NetFirewallHyperVVMSetting -PolicyStore ActiveStore -Name $wsl | % { "hyperv-fw in=$($_.DefaultInboundAction) enabled=$($_.Enabled)" }
# Runner Windows: carpetas, hooks no editables por jobs, variables de SO
New-Item -ItemType Directory -Force C:\VantareCI\runner, C:\VantareCI\hooks | Out-Null
icacls C:\VantareCI /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' 'vantare-ci:(OI)(CI)RX' | Out-Null
icacls C:\VantareCI\runner /grant 'vantare-ci:(OI)(CI)M' | Out-Null
Copy-Item C:\VantareServer\ops\ci-runners\* C:\VantareCI\hooks\ -Force
New-Item -ItemType Directory -Force C:\VantareCI\ops | Out-Null
Copy-Item C:\VantareServer\ops\ci-runners\register-windows.ps1, C:\VantareServer\ops\ci-runners\control-windows.ps1 C:\VantareCI\ops\ -Force
[Environment]::SetEnvironmentVariable('ACTIONS_RUNNER_HOOK_JOB_STARTED', 'C:/VantareCI/hooks/job-start.ps1', 'Machine')
[Environment]::SetEnvironmentVariable('ACTIONS_RUNNER_HOOK_JOB_COMPLETED', 'C:/VantareCI/hooks/job-end.ps1', 'Machine')
# Tarea de supervisión (SYSTEM, cada 5 min)
$a = New-ScheduledTaskAction -Execute powershell.exe -Argument '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\VantareServer\ops\health.ps1'
$t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -AllowStartIfOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable
Register-ScheduledTask -TaskName Health -TaskPath '\Vantare\' -Action $a -Trigger $t,(New-ScheduledTaskTrigger -AtStartup) -Settings $s -User SYSTEM -RunLevel Highest -Force | Out-Null
'a7 ok'
