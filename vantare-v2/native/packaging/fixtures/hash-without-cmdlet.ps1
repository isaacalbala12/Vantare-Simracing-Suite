# Entorno reproducible del host: SHA-256 debe funcionar sin Get-FileHash.
param([string]$Candidate, [string]$ProbePath, [string]$ProbeHash)
$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Utility
Import-Module Microsoft.PowerShell.Management
. $Candidate
Remove-Item Function:/Get-FileHash -ErrorAction SilentlyContinue
$PSModuleAutoLoadingPreference = 'None'
if (Get-Command Get-FileHash -ErrorAction SilentlyContinue) { throw 'El probe todavía dispone de Get-FileHash.' }
if ((Get-NativeHash $ProbePath) -cne $ProbeHash) { throw 'SHA-256 diferente del publicado.' }
Write-Output 'PASS SHA-256 del paquete sin Get-FileHash ni autoload'
