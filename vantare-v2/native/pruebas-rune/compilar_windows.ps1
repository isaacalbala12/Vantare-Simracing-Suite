# Run from vantare-v2 through native/scripts/compilar.ps1 pwsh -NoProfile -File <this> <cargo args>.
# Recheck after waiting for the queue, not only when requesting a slot.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (Test-Path -LiteralPath 'D:\VantareServer\qa\captura.lock') { throw 'Captura activa: no se inicia Cargo.' }
if (-not $env:VANTARE_CARGO_QUEUE_OWNER -or -not $env:CARGO_TARGET_DIR) { throw 'Ejecutar dentro de la cola del repositorio.' }
if ($args.Count -eq 0 -or $args[0] -notin @('build','clippy','test','nextest')) { throw 'Comando de medicion no admitido.' }
if ($env:RUSTFLAGS -or $env:CARGO_ENCODED_RUSTFLAGS) { throw 'No mezclar opciones Rust externas con el perfil comun.' }
$target = $env:CARGO_TARGET_DIR
$env:CARGO_PROFILE_RELEASE_OPT_LEVEL = '3'
$env:CARGO_PROFILE_RELEASE_LTO = 'false'
$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS = '16'
$env:CARGO_PROFILE_RELEASE_DEBUG = 'false'
$env:CARGO_PROFILE_RELEASE_INCREMENTAL = 'false'
$env:CARGO_BUILD_JOBS = '2'
# Cargo's explicit path avoids making CARGO_TARGET_DIR part of sccache's key.
Remove-Item Env:CARGO_TARGET_DIR
$command = @($args)
$separator = [array]::IndexOf($command,'--')
if ($separator -lt 0) { $command += @('--target-dir',$target) }
else { $command = @($command[0..($separator-1)]) + @('--target-dir',$target) + @($command[$separator..($command.Count-1)]) }
& cargo @command
exit $LASTEXITCODE
