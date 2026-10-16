# Ejecuta un script como cuenta de servicio (tarea temporal) y devuelve su salida.
# Rota la contraseña a una aleatoria solo en memoria y la propaga a sus tareas/servicio.
# Tras Set-VantareCredential de Isaac, NO usar (cambiaría su contraseña).
param([Parameter(Mandatory)][ValidateSet('vantare-ci','vantare-svc')][string]$User,
      [Parameter(Mandatory)][string]$Script, [int]$TimeoutSec = 3600)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\VantareCred.ps1"
if (Test-Path "C:\VantareServer\ops\credential-owner-$User") { throw "Isaac ya fijó la contraseña de $User; no rotar." }
$dir = "C:\VantareServer\ops\as\$User"
if (-not (Test-Path $dir)) {
  New-Item -ItemType Directory -Force $dir | Out-Null
  icacls $dir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' "${User}:(OI)(CI)M" | Out-Null }
$name = Split-Path $Script -Leaf
Copy-Item $Script "$dir\$name" -Force
$out = "$dir\out.txt"; Remove-Item $out -ErrorAction SilentlyContinue
$task = "VantareAs-$User"
$cmd = "`$env:WSL_UTF8='1'; & '$dir\$name' *>&1 | Out-File -Encoding utf8 '$out'; exit `$LASTEXITCODE"
$a = New-ScheduledTaskAction -Execute powershell.exe -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command `"$cmd`""
$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds $TimeoutSec) -AllowStartIfOnBatteries
$pw = New-RandomPassword
Set-VantareCredential $User $pw
Register-ScheduledTask -TaskName $task -TaskPath '\Vantare\' -Action $a -Settings $s -User $User -Password $pw -RunLevel Limited -Force | Out-Null
Remove-Variable pw
try {
  Start-ScheduledTask -TaskName $task -TaskPath '\Vantare\'
  Start-Sleep 2
  while ((Get-ScheduledTask -TaskName $task -TaskPath '\Vantare\').State -eq 'Running') { Start-Sleep 2 }
  $rc = (Get-ScheduledTaskInfo -TaskName $task -TaskPath '\Vantare\').LastTaskResult
} finally { Unregister-ScheduledTask -TaskName $task -TaskPath '\Vantare\' -Confirm:$false }
if (Test-Path $out) { Get-Content $out }
"[as $User rc=$rc]"
