# Cierra el kit con los tres Rune reconstruidos sin audio/MPL y ya copiados.
# No compila, no hace SSH y no ejecuta ningún PE.
[CmdletBinding()]
param([switch]$CopiarMac,[string]$RuneArtifacts,[string]$RuneSourceSha)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root='D:/VantareServer/evidence/rune-vs-gpui'
$python=@(Get-Command python -CommandType Application -ErrorAction Stop)[0].Source
if($CopiarMac){throw 'No reutilizar el Inicio antiguo. Reconstruir los tres Rune sin audio/MPL y copiar sus artefactos auditados.'}
if(-not $RuneArtifacts -or $RuneSourceSha -notmatch '^[a-f0-9]{40}$'){throw 'Indicar RuneArtifacts y RuneSourceSha de la reconstrucción auditada en Mac.'}
& $python (Join-Path $PSScriptRoot 'GENERAR_MANIFIESTO.py') --rune-artifact-root $RuneArtifacts --rune-source-sha $RuneSourceSha
if($LASTEXITCODE){throw 'Manifiesto final incompleto; conservar cualquier intento anterior.'}
& (Join-Path $PSScriptRoot 'package.ps1') -Manifest (Join-Path $root 'manifiesto-kit-20261113.json') -Staging (Join-Path $root 'kit/staging-20261113-FINAL') -Output (Join-Path $root 'kit/kit-rune-vs-gpui-2026-11-13.zip')
if($LASTEXITCODE){throw 'No se pudo cerrar el ZIP final.'}
