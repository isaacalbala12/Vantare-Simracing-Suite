$a = New-ScheduledTaskAction -Execute rundll32.exe -Argument 'user32.dll,LockWorkStation'
$t = New-ScheduledTaskTrigger -AtLogOn -User Administrator
$p = New-ScheduledTaskPrincipal -UserId Administrator -LogonType Interactive
Register-ScheduledTask -TaskName LockAtLogon -TaskPath '\Vantare\' -Action $a -Trigger $t -Principal $p -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries) -Force | Out-Null
Set-Service W32Time -StartupType Manual
"$(Get-Date -f s) W32Time vuelve a Manual (arranque por disparador; tareas SynchronizeTime activas)" | Add-Content C:\VantareServer\logs\services-reenabled.txt
'lock task ok'
