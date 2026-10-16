# Funciones compartidas: credencial de cuentas de servicio y tareas que la usan. Nunca imprime contraseñas.
function New-RandomPassword { Add-Type -AssemblyName System.Web; [System.Web.Security.Membership]::GeneratePassword(32, 6) }

function Register-Keepalive([string]$User, [string]$PlainPassword) {
  # Mantiene viva la distro WSL de la cuenta (systemd arranca sus servicios). Sin sesión, al arrancar.
  $a = New-ScheduledTaskAction -Execute 'C:\Program Files\WSL\wsl.exe' -Argument "-d $User -u root --exec /bin/sleep infinity"
  $t = New-ScheduledTaskTrigger -AtStartup
  $s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
       -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable
  Register-ScheduledTask -TaskName "WSL-$User" -TaskPath '\Vantare\' -Action $a -Trigger $t -Settings $s `
    -User $User -Password $PlainPassword -RunLevel Limited -Force | Out-Null
}

function Set-VantareCredential([string]$User, [string]$PlainPassword) {
  Set-LocalUser -Name $User -Password (ConvertTo-SecureString $PlainPassword -AsPlainText -Force)
  if (Get-ScheduledTask -TaskName "WSL-$User" -TaskPath '\Vantare\' -ErrorAction SilentlyContinue) {
    $running = (Get-ScheduledTask -TaskName "WSL-$User" -TaskPath '\Vantare\').State -eq 'Running'
    Register-Keepalive $User $PlainPassword
    if ($running) { 'keepalive sigue en marcha' } }
  $svc = Get-CimInstance Win32_Service | ? { $_.StartName -match "\$User$" }
  foreach ($s in $svc) {
    $r = Invoke-CimMethod -InputObject $s -MethodName Change -Arguments @{ StartName = ".\$User"; StartPassword = $PlainPassword }
    "servicio $($s.Name) credencial actualizada rc=$($r.ReturnValue)" }
}
