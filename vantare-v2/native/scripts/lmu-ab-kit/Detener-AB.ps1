param([Parameter(Mandatory=$true)][string]$Run)
$ErrorActionPreference='Stop'
if (-not (Test-Path -LiteralPath $Run -PathType Container)) { throw 'Carpeta de resultados inexistente.' }
New-Item -ItemType File -Path (Join-Path $Run 'STOP') -Force | Out-Null
Write-Output 'STOP enviado. Espera run.json=cancelled/failed/complete; no se cierra LMU.'
$launch=Join-Path $Run 'launch.json'
if (Test-Path -LiteralPath $launch) {
    $task=(Get-Content -LiteralPath $launch -Raw|ConvertFrom-Json).task
    if ($task -notmatch '^VantareLMUAB-[a-f0-9]{8}$') { throw 'Nombre de tarea ajeno al kit.' }
    $info=Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
    if ($info -and $info.State -ne 'Running') { Unregister-ScheduledTask -TaskName $task -Confirm:$false }
}
