# Una sola copia cuando el orquestador confirme que el Mac está despierto.
# No compila, no reintenta SSH, no ejecuta ningún PE.
[CmdletBinding()]
param([switch]$CopiarMac)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root='D:/VantareServer/evidence/rune-vs-gpui'
$artifact=Join-Path $root 'artefactos/pieza8-54ef276c3-transfer03'
$python=@(Get-Command python -CommandType Application -ErrorAction Stop)[0].Source
if($CopiarMac){
 & $python (Join-Path $PSScriptRoot 'COPIAR_MAC.py') --host 100.91.91.82 --user isaacalbala --source-sha 54ef276c38ed4e7f70ed220db57257898f56ec2c --output $artifact
 if($LASTEXITCODE){throw 'No se pudo copiar Inicio Rune; sin reintentos automáticos.'}
}
if(-not(Test-Path -LiteralPath (Join-Path $artifact 'vantare-inicio-rune.exe'))){throw 'Falta el binario nuevo de Inicio Rune.'}
& $python (Join-Path $PSScriptRoot 'GENERAR_MANIFIESTO.py')
if($LASTEXITCODE){throw 'Manifiesto final incompleto; conservar cualquier intento anterior.'}
& (Join-Path $PSScriptRoot 'package.ps1') -Manifest (Join-Path $root 'manifiesto-kit-20261113.json') -Staging (Join-Path $root 'kit/staging-20261113-FINAL') -Output (Join-Path $root 'kit/kit-rune-vs-gpui-2026-11-13.zip')
if($LASTEXITCODE){throw 'No se pudo cerrar el ZIP final.'}
