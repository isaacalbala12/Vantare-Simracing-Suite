# Only this fixed task is elevated. Never invokes captures, lifecycle or Python.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Kit,[Parameter(Mandatory)][string]$Round,[ValidateSet(60,65)][int]$Seconds)
$ErrorActionPreference='Stop'
if($env:VANTARE_SIN_GRAFICOS -eq '1' -or $env:COMPUTERNAME -ieq 'SAPPHIREOS'){throw 'GRAPHICS_DISABLED: sampler real prohibido en servidor'}
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Sampler ETW necesita token elevado'}
$code=1
try {
 # Existing sampler owns/cleans its GUID session in finally, including errors.
 & (Join-Path $Kit 'vantare-v2/native/pruebas-rune/muestreador/MUESTREAR.ps1') -RootInfoFile (Join-Path $Round 'root-info.json') -PresentMon (Join-Path $Kit 'bin/PresentMon-2.6.0-x64.exe') -OutputDirectory (Join-Path $Round 'muestreo') -Seconds $Seconds -ProcessOnly *> (Join-Path $Round 'sampler.log')
 $code=0
} catch {
 $_.Exception.Message|Add-Content -LiteralPath (Join-Path $Round 'sampler.log')
} finally {
 $final=Join-Path $Round 'sampler-result.json'
 @{code=$code;finished=$true;role='PresentMon/ETW only'}|ConvertTo-Json|Set-Content -LiteralPath ($final+'.tmp') -Encoding utf8
 [IO.File]::Move($final+'.tmp',$final)
}
exit $code
