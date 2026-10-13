$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force C:\VantareServer\ops, C:\VantareServer\logs, C:\VantareServer\backups | Out-Null
# Red privada + cortafuegos solo LAN
Get-NetConnectionProfile -InterfaceAlias Ethernet | Set-NetConnectionProfile -NetworkCategory Private
foreach ($r in @(@('Vantare SSH LAN', 22), @('Vantare Plane LAN', 8088))) {
  if (-not (Get-NetFirewallRule -DisplayName $r[0] -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $r[0] -Direction Inbound -Protocol TCP -LocalPort $r[1] -RemoteAddress 192.168.1.0/24, 100.64.0.0/10 -Action Allow -Profile Any | Out-Null }
}
Get-NetFirewallRule -Direction Inbound | ? { $_.DisplayName -match 'ssh' -and $_.DisplayName -ne 'Vantare SSH LAN' } | Disable-NetFirewallRule
Set-NetFirewallProfile -All -DefaultInboundAction Block -DefaultOutboundAction Allow -Enabled True
# sshd: solo clave
$cfg = "$env:ProgramData\ssh\sshd_config"
Copy-Item $cfg "$cfg.bak-vantare" -Force
$lines = Get-Content $cfg | ? { $_ -notmatch '^\s*#?\s*(PasswordAuthentication|PubkeyAuthentication|KbdInteractiveAuthentication)\b' }
$i = [Array]::FindIndex([string[]]$lines, [Predicate[string]]{ param($l) $l -match '^\s*Match\b' })
$add = 'PubkeyAuthentication yes','PasswordAuthentication no','KbdInteractiveAuthentication no'
if ($i -lt 0) { $lines += $add } else { $lines = $lines[0..($i-1)] + $add + $lines[$i..($lines.Count-1)] }
Set-Content $cfg $lines -Encoding ascii
Restart-Service sshd
# Autologon off (borra la contraseña guardada sin leerla)
$wl = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
Set-ItemProperty $wl AutoAdminLogon '0'
Remove-ItemProperty $wl DefaultPassword -ErrorAction SilentlyContinue
# Windows Update: auto, domingo, hora entera 05:00 (la política solo admite horas enteras)
$au = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
Set-ItemProperty $au NoAutoUpdate 0 -Type DWord
Set-ItemProperty $au AUOptions 4 -Type DWord
Set-ItemProperty $au ScheduledInstallDay 1 -Type DWord
Set-ItemProperty $au ScheduledInstallTime 5 -Type DWord
Set-ItemProperty $au NoAutoRebootWithLoggedOnUsers 0 -Type DWord
# Energía: pantalla 5 min, sin suspensión/hibernación
powercfg /change monitor-timeout-ac 5; powercfg /change standby-timeout-ac 0; powercfg /change hibernate-timeout-ac 0; powercfg /hibernate off
# Pagefile fijo 8 GB (efectivo tras reinicio)
$cs = Get-CimInstance Win32_ComputerSystem
if ($cs.AutomaticManagedPagefile) { Set-CimInstance -InputObject $cs -Property @{AutomaticManagedPagefile=$false} }
$pf = Get-CimInstance Win32_PageFileSetting | ? Name -eq 'C:\pagefile.sys'
if ($pf) { Set-CimInstance -InputObject $pf -Property @{InitialSize=8192; MaximumSize=8192} } else { New-CimInstance -ClassName Win32_PageFileSetting -Property @{Name='C:\pagefile.sys'; InitialSize=[uint32]8192; MaximumSize=[uint32]8192} | Out-Null }
# WlanSvc fuera (solo Ethernet)
Set-Service WlanSvc -StartupType Disabled; Stop-Service WlanSvc -Force -ErrorAction SilentlyContinue
"wuauserv=" + (Get-Service wuauserv -ErrorAction SilentlyContinue).StartType
"GPU=" + ((Get-CimInstance Win32_VideoController | % Name) -join ';')
"OK base"
