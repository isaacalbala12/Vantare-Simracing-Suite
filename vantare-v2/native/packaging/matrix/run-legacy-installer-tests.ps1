#requires -Version 5.1
# Historical assertions run with a frozen driver in an explicit QA copy.
param([string]$Root,[ValidateSet('registration','shell')][string]$Suite,[string]$EvidenceDirectory,[switch]$PrepareOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaLegacyRoot=Assert-MatrixRoot $Root
if(Test-Path -LiteralPath $qaLegacyRoot){throw 'LEGACY_NEEDS_FRESH_ROOT'}
$source=Split-Path $PSScriptRoot -Parent
$packaging=Join-Path $qaLegacyRoot 'native/packaging'
[IO.Directory]::CreateDirectory((Split-Path $packaging -Parent))|Out-Null
Copy-Item -LiteralPath $source -Destination $packaging -Recurse
$driver=Join-Path $PSScriptRoot 'legacy/installer-driver.ps1'
Copy-Item -LiteralPath $driver -Destination $packaging
if((Get-FileHash -LiteralPath $driver).Hash -cne (Get-FileHash -LiteralPath (Join-Path $packaging 'installer-driver.ps1')).Hash){throw 'LEGACY_DRIVER_COPY_CHANGED'}
$fixtures=Join-Path (Split-Path $source -Parent) 'ui/fixtures'
$ui=Join-Path $qaLegacyRoot 'native/ui'
[IO.Directory]::CreateDirectory($ui)|Out-Null
Copy-Item -LiteralPath $fixtures -Destination $ui -Recurse
# Assert these legacy files still test the current scripts and assertions.
foreach($name in @('candidate.ps1','beta.ps1','installer-registration-tests.ps1','installer-shell-tests.ps1')){
    if((Get-FileHash -LiteralPath (Join-Path $source $name)).Hash -cne (Get-FileHash -LiteralPath (Join-Path $packaging $name)).Hash){throw 'LEGACY_SOURCE_COPY_CHANGED'}
}
if($PrepareOnly){Write-Output ('Prepared legacy QA copy: '+$packaging);exit 0}
$arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File')
if($Suite -ceq 'registration'){$arguments+=Join-Path $packaging 'installer-registration-tests.ps1'}
else{
    $arguments+=Join-Path $packaging 'installer-shell-tests.ps1'
    $arguments+=@('-EvidenceDirectory',$EvidenceDirectory)
}
& "$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe" @arguments
exit $LASTEXITCODE
