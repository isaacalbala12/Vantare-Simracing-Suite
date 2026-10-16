$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
try {
    $game=@(Get-Process -Name 'Le Mans Ultimate' -ErrorAction SilentlyContinue)
    if ($game.Count -ne 1) { throw 'Abre LMU primero (puede estar en el menú) y vuelve a pulsar Grabar-LMU.cmd.' }
    $image=$game[0].Path
    $build=[Diagnostics.FileVersionInfo]::GetVersionInfo($image).FileVersionRaw.ToString()
    $build=([regex]::Match($build,'\d+\.\d+\.\d+\.\d+')).Value
    if (-not $build) { throw 'No se pudo leer la versión del juego.' }
    $uiZip=Join-Path (Split-Path -Parent $image) 'Bin\UI.zip'
    $catalog=Join-Path $PSScriptRoot 'catalogo-local.json'
    & "$PSScriptRoot\Discover-LmuRest.ps1" -UiZip $uiZip -Output $catalog
    $output=Join-Path $PSScriptRoot ('grabaciones\'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path (Split-Path -Parent $output) -Force | Out-Null
    Write-Host 'No cierres esta consola. Para terminar usa Detener-LMU.cmd y espera FINALIZADO.'
    & "$PSScriptRoot\vantare-grabar-lmu-completo.exe" $output $build $catalog 2>&1 | Tee-Object -FilePath "$PSScriptRoot\ultima-grabacion.log"
    if ($LASTEXITCODE -ne 0) { throw "Grabadora terminó con código $LASTEXITCODE; conserva el log." }
} catch { Write-Host "ERROR: $_" -ForegroundColor Red }
Read-Host 'Pulsa Intro para cerrar'
