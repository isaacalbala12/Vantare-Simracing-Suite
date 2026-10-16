# Para Isaac, en PowerShell ADMINISTRADOR del servidor: fija SU contraseña para la cuenta y actualiza tareas/servicio.
#   & C:\VantareServer\ops\Set-VantareCredential.ps1 -User vantare-ci
param([Parameter(Mandatory)][ValidateSet('vantare-ci','vantare-svc')][string]$User)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\VantareCred.ps1"
$a = Read-Host "Nueva contraseña para $User" -AsSecureString
$b = Read-Host 'Repetir' -AsSecureString
$pa = [Net.NetworkCredential]::new('', $a).Password; $pb = [Net.NetworkCredential]::new('', $b).Password
if ($pa -cne $pb -or $pa.Length -lt 14) { throw 'No coinciden o tiene menos de 14 caracteres.' }
Set-VantareCredential $User $pa
Remove-Variable pa, pb
Set-Content "$PSScriptRoot\credential-owner-$User" (Get-Date -Format s)
"Hecho: $User actualizado (tareas y servicio)."
