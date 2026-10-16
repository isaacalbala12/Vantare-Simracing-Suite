param([string]$User = 'vantare-svc')
$ErrorActionPreference = 'Stop'
. C:\VantareServer\ops\VantareCred.ps1
$pw = New-RandomPassword
Set-VantareCredential $User $pw
Register-Keepalive $User $pw
Remove-Variable pw
Start-ScheduledTask -TaskName "WSL-$User" -TaskPath '\Vantare\'
Start-Sleep 20
"keepalive ${User}: $((Get-ScheduledTask -TaskName "WSL-$User" -TaskPath '\Vantare\').State)"
