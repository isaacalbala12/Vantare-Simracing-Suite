# Entrada como vantare-svc, lanzada por Invoke-WorkersPlaneAsSvc desde tarea SYSTEM.
$ErrorActionPreference='Stop'
$env:WSL_UTF8='1'
& 'C:\Program Files\WSL\wsl.exe' -d vantare-svc -u root -- bash /mnt/c/VantareServer/ops/linux/deploy-vigilante.sh
exit $LASTEXITCODE
