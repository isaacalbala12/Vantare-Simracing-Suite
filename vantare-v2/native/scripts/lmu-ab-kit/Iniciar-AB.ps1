param(
    [string]$GameExe,
    [string]$InteractiveUser,
    [ValidateSet('ABAB','BABA')][string]$Order='ABAB',
    [ValidateRange(15,900)][int]$BlockSeconds=180,
    [ValidateRange(0,120)][int]$ControlSeconds=60,
    [switch]$ValidateOnly
)
$ErrorActionPreference='Stop'
$kit=$PSScriptRoot
$manifest=Get-Content -LiteralPath (Join-Path $kit 'manifest.json') -Raw | ConvertFrom-Json
foreach ($item in $manifest.files) {
    $file=Join-Path $kit $item.name
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $item.sha256) { throw "Hash incorrecto: $($item.name)" }
}
if ($ValidateOnly) { Write-Output "KIT VALIDADO: C=$ControlSeconds s, $Order, $BlockSeconds s/bloque; sin procesos ni tareas."; exit 0 }
if (-not $GameExe) {
    foreach ($candidate in @('D:\SteamLibrary\steamapps\common\Le Mans Ultimate\Le Mans Ultimate.exe','C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\Le Mans Ultimate.exe','C:\SteamLibrary\steamapps\common\Le Mans Ultimate\Le Mans Ultimate.exe')) {
        if (Test-Path -LiteralPath $candidate) { $GameExe=$candidate; break }
    }
}
if (-not $GameExe -or -not (Test-Path -LiteralPath $GameExe)) { throw 'Indica -GameExe con la ruta del ejecutable instalado; no se abre LMU.' }
if (-not $InteractiveUser) { $InteractiveUser=(Get-CimInstance Win32_ComputerSystem).UserName }
if (-not $InteractiveUser) { throw 'No hay usuario interactivo; indica -InteractiveUser DOMINIO\isaac.' }
$games=@(Get-Process -Name 'Le Mans Ultimate' -ErrorAction SilentlyContinue)
if ($games.Count -ne 1) { throw 'Debe existir exactamente un LMU abierto por Isaac.' }
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$nonce=[Guid]::NewGuid().ToString('N').Substring(0,8)
$run=Join-Path $kit "resultados\$stamp-$nonce"
$task="VantareLMUAB-$nonce"
New-Item -ItemType Directory -Path $run -Force | Out-Null
$runner=Join-Path $kit 'Runner-AB.ps1'
foreach ($value in @($runner,$run,$GameExe)) { if ($value.Contains('"') -or $value.Contains("`n")) { throw 'Ruta inválida.' } }
$arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Run "{1}" -GameExe "{2}" -TaskName "{3}" -Order {4} -BlockSeconds {5} -ControlSeconds {6} -GameProcessId {7}' -f $runner,$run,$GameExe,$task,$Order,$BlockSeconds,$ControlSeconds,$games[0].Id
$action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments
$principal=New-ScheduledTaskPrincipal -UserId $InteractiveUser -LogonType Interactive -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $task -Action $action -Principal $principal -Settings $settings -Description 'LMU A/B temporal; no abre juego ni ventanas; se elimina al finalizar.' | Out-Null
try { Start-ScheduledTask -TaskName $task }
catch { Unregister-ScheduledTask -TaskName $task -Confirm:$false; throw }
@{task=$task;run=$run;game_pid=$games[0].Id;state='scheduled'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $run 'launch.json') -Encoding UTF8
Write-Output "LANZADO: $run"
Write-Output "TAREA: $task (se elimina al terminar). Estado: run.json; espera a jugador rodando."
