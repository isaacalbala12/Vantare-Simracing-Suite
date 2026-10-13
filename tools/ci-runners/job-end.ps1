$ErrorActionPreference='Stop'
& python C:/VantareCI/hooks/cleanup.py
if($LASTEXITCODE){throw 'No se pudo limpiar workspace.'}
