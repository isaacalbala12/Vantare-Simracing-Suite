$ErrorActionPreference='Stop'
& python C:/VantareCI/hooks/job-guard.py
if($LASTEXITCODE){throw 'Runner rechazado por politica de privacidad/forks.'}
while(Test-Path C:/tmp/fase2/pantalla-ocupada){Start-Sleep -Seconds 10}
& python C:/VantareCI/hooks/cleanup.py
if($LASTEXITCODE){throw 'No se pudo limpiar workspace.'}
