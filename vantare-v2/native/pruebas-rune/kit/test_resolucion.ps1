$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'RESOLUCION.ps1')
$original=@([pscustomobject]@{Name='GPU';CurrentHorizontalResolution=1920;CurrentVerticalResolution=1080})
$changed=@([pscustomobject]@{Name='GPU';CurrentHorizontalResolution=1280;CurrentVerticalResolution=720})
if(Test-VantareResolutionConfirmation $false $original $original){throw 'R declarativa sin cambio no vale.'}
if(Test-VantareResolutionConfirmation $true $original $changed){throw 'R sin restauración no vale.'}
if(-not(Test-VantareResolutionConfirmation $true $original $original)){throw 'Cambio observado y restaurado debe aceptarse.'}
if(-not(Test-VantareActualResolutionChange $original $changed)){throw 'No se detectó el cambio de píxeles.'}
$off=@([pscustomobject]@{Name='GPU';CurrentHorizontalResolution=0;CurrentVerticalResolution=0})
if(Test-VantareActualResolutionChange $original $off){throw 'Monitor apagado no demuestra un cambio de resolución.'}
'PASS: R exige cambio observado y restauración; sin consultar Windows.'
