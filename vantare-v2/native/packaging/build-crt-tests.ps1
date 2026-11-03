#requires -Version 5.1
param([string]$EvidenceDirectory=(Join-Path 'D:/VantareServer/qa/isa-1840' ('p7-crt-'+[guid]::NewGuid().ToString('N'))))
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'matrix/guard.ps1')
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
$evidence=Assert-MatrixRoot $EvidenceDirectory
if(Test-Path $evidence){throw 'Use a fresh CRT fixture directory'}
[IO.Directory]::CreateDirectory($evidence)|Out-Null
$passed=0
function Assert-Crt([bool]$Condition,[string]$Message,[string]$Detail=''){if(-not $Condition){throw "$Message $Detail"};$script:passed++;"PASS $Message"}
function Reject-Crt([scriptblock]$Action,[string]$Message){$failed=$false;try{& $Action}catch{$failed=$true};Assert-Crt $failed $Message}
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
Import-Module (Join-Path $vs 'Common7/Tools/Microsoft.VisualStudio.DevShell.dll')
$env:PATH=(Split-Path -Parent $vswhere)+';'+$env:PATH
Enter-VsDevShell -VsInstallPath $vs -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64'|Out-Null
$dumpbin=Get-NativeDumpbin
[IO.File]::WriteAllText((Join-Path $evidence 'main.c'),('#include <stdio.h>'+"`n"+'int main(void){puts("inert CRT fixture");return 0;}'))
[IO.File]::WriteAllText((Join-Path $evidence 'library.c'),'__declspec(dllexport) int fixture(void){return 7;}')
[IO.File]::WriteAllText((Join-Path $evidence 'delay.c'),'__declspec(dllimport) int fixture(void); int main(void){return fixture();}')
Push-Location $evidence
try {
    # Compiler fixtures are inspected only; never execute them or their DLL.
    & cl /nologo /MT main.c /Fe:static.exe *> static-build.log
    if($LASTEXITCODE){throw 'Static C fixture failed to build'}
    & cl /nologo /MD main.c /Fe:dynamic.exe *> dynamic-build.log
    if($LASTEXITCODE){throw 'Dynamic C fixture failed to build'}
    & cl /nologo /MT /LD library.c /link /OUT:vcruntime999.dll /IMPLIB:vcruntime999.lib *> dll-build.log
    if($LASTEXITCODE){throw 'Inert delay DLL fixture failed to build'}
    & cl /nologo /MT delay.c vcruntime999.lib delayimp.lib /Fe:delay.exe /link /DELAYLOAD:vcruntime999.dll *> delay-build.log
    if($LASTEXITCODE){throw 'Delay import fixture failed to build'}
    Assert-NativeStaticCrt (Join-Path $evidence 'static.exe') $dumpbin
    Assert-Crt $true '/MT fixture passes actual PE import gate'
    Reject-Crt {Assert-NativeStaticCrt (Join-Path $evidence 'dynamic.exe') $dumpbin} '/MD fixture rejected by actual PE imports'
    Reject-Crt {Assert-NativeStaticCrt (Join-Path $evidence 'delay.exe') $dumpbin} 'Delay-loaded CRT fixture rejected'
    function No-Imports {$global:LASTEXITCODE=0;'No DLL report'}
    Reject-Crt {Assert-NativeStaticCrt (Join-Path $evidence 'static.exe') 'No-Imports'} 'Empty inspector inventory fails closed'
    function Failed-Inspector {$global:LASTEXITCODE=1;'    KERNEL32.dll'}
    Reject-Crt {Assert-NativeStaticCrt (Join-Path $evidence 'static.exe') 'Failed-Inspector'} 'Failed inspector cannot validate even plausible output'
}finally{Pop-Location}

