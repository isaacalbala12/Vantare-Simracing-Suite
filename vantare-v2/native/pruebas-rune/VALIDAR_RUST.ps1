# Validación sin Rune/GPUI ni ejecución gráfica, siempre dentro de la cola.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if(Test-Path -LiteralPath 'D:\VantareServer\qa\captura.lock'){throw 'Captura activa: no iniciar Rust.'}
if(-not $env:VANTARE_CARGO_QUEUE_OWNER -or -not $env:CARGO_TARGET_DIR){throw 'Usar native/scripts/compilar.ps1.'}
$target=$env:CARGO_TARGET_DIR
$env:VANTARE_NATIVE_DATA_ROOT=Join-Path $target 'rune-measurement-qa/native'
$env:LOCALAPPDATA=Join-Path $target 'rune-measurement-qa/local'
$env:APPDATA=Join-Path $target 'rune-measurement-qa/roaming'
foreach($path in @($env:VANTARE_NATIVE_DATA_ROOT,$env:LOCALAPPDATA,$env:APPDATA)){[IO.Directory]::CreateDirectory($path)|Out-Null}
$python=@(Get-Command python -CommandType Application -ErrorAction Stop)[0].Source
& $python (Join-Path $PSScriptRoot 'preparar_fuentes.py') gpui
if($LASTEXITCODE){throw 'Fuente de medición modificada o incompleta.'}
$manifest=Join-Path $PSScriptRoot 'fuentes-generadas/gpui/vantare-v2/native/Cargo.toml'
$counter=Join-Path $PSScriptRoot 'Cargo.toml'
$commands=@(
 ,@('clippy','--manifest-path',$manifest,'--locked','--release','-p','vantare-ipc','-p','vantare-profiling','--features','medir-latencia','--lib','-j','2','--','-D','warnings')
 ,@('test','--manifest-path',$manifest,'--locked','--release','-p','vantare-ipc','-p','vantare-profiling','--features','medir-latencia','--lib','-j','2')
 ,@('clippy','--manifest-path',$counter,'--locked','--release','-p','vantare-contador-replay','--all-targets','-j','2','--','-D','warnings')
 ,@('test','--manifest-path',$counter,'--locked','--release','-p','vantare-contador-replay','-j','2')
)
foreach($command in $commands){
 if(Test-Path -LiteralPath 'D:\VantareServer\qa\captura.lock'){throw 'Captura activa: no iniciar otro comando Rust.'}
 $env:CARGO_TARGET_DIR=$target
 & (Join-Path $PSScriptRoot 'compilar_windows.ps1') @command
 if($LASTEXITCODE){throw "Falló $($command[0]) con Rust 1.99.1; conservar el diagnóstico."}
}
'PASS: Clippy y tests IPC/profiling/contador, Rust 1.99.1, sin renderer.'
