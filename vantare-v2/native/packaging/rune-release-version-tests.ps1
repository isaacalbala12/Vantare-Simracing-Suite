# Deferred until a real Release candidate exists. Never launches the renderer.
#requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$Version,
    [Parameter(Mandatory)][string]$Channel
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
# Require a PE32+ Windows GUI image, not the debug console binary.
$bytes=[IO.File]::ReadAllBytes((Assert-BuildPath $Executable))
if($bytes.Length -lt 64 -or $bytes[0] -ne 77 -or $bytes[1] -ne 90){throw 'Expected Rune Release PE image'}
$pe=[BitConverter]::ToUInt32($bytes,60)
if($pe -gt $bytes.Length-94 -or [BitConverter]::ToUInt32($bytes,$pe) -ne 0x4550 -or [BitConverter]::ToUInt16($bytes,$pe+4) -ne 0x8664 -or [BitConverter]::ToUInt16($bytes,$pe+24) -ne 0x20b -or [BitConverter]::ToUInt16($bytes,$pe+92) -ne 2){throw 'Expected Rune Release Windows GUI x64 image'}
# Invoke-BuildProcess redirects stdout/stderr to pipes; no console is attached.
$actual=Invoke-BuildProcess $Executable @('--version') $null
$expected="Vantare Native $Version ($Channel)`n"
if($actual -cne $expected){throw 'Rune Release --version stdout differs'}
Write-Host "PASS Rune Release Windows GUI --version through stdout pipe: $($expected.TrimEnd())"
