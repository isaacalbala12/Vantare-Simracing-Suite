# Abre wails3 dev en una ventana PowerShell visible (logs de Go en pantalla).
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $scriptDir "start-wails-dev.ps1"
Start-Process powershell.exe -ArgumentList @(
  "-NoExit",
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", $launcher
)