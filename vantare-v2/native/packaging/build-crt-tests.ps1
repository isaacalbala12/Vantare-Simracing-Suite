#requires -Version 5.1
param([string]$EvidenceDirectory=(Join-Path ([IO.Path]::GetTempPath()) ('vantare-crt-'+[guid]::NewGuid().ToString('N'))))
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'candidate.ps1')
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
if(Test-Path $evidence){throw 'Use a fresh CRT fixture directory'}
[IO.Directory]::CreateDirectory($evidence)|Out-Null
$passed=0
function Assert-Crt([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message};$script:passed++;"PASS $Message"}
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

# Exercise the actual candidate builder's flags and finally paths without Rust
# compilation. The real Release build is validated independently on its artifacts.
$saved=@{}
foreach($name in @('DUCKDB_LIB_DIR','CARGO_ENCODED_RUSTFLAGS','RUSTFLAGS','VANTARE_VERSION','VANTARE_BUILD_CHANNEL')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
function cargo {
    $script:seenArgs=@($args)
    $script:seenFlags=$env:CARGO_ENCODED_RUSTFLAGS
    if($script:throwCargo){throw 'Deliberate command exception'}
    $global:LASTEXITCODE=17
}
try {
    Remove-Item Env:DUCKDB_LIB_DIR -ErrorAction SilentlyContinue
    $cases=@(
        @{encoded=$null;rust=$null;throws=$false;prefix=''},
        @{encoded=('--cfg'+[char]31+'encoded_fixture');rust='--cfg ignored_fixture';throws=$false;prefix=('--cfg'+[char]31+'encoded_fixture'+[char]31)},
        @{encoded=$null;rust='--cfg fallback_fixture';throws=$true;prefix=('--cfg'+[char]31+'fallback_fixture'+[char]31)}
    )
    $index=0
    foreach($case in $cases){
        $index++
        $env:CARGO_ENCODED_RUSTFLAGS=$case.encoded;$env:RUSTFLAGS=$case.rust
        $env:VANTARE_VERSION='before';$env:VANTARE_BUILD_CHANNEL='before'
        $script:throwCargo=$case.throws
        $oldLocation=(Get-Location).Path
        Reject-Crt {Build-NativeCandidate (Join-Path $evidence "failed-$index") '0.0.979' 'beta' 'Release' $true|Out-Null} "Builder propagates cargo failure $index"
        Assert-Crt ($script:seenFlags -ceq ($case.prefix+'-C'+[char]31+'target-feature=+crt-static')) "Distribution appends static CRT and preserves caller flags $index"
        Assert-Crt (($script:seenArgs -join ' ').Contains('--target x86_64-pc-windows-msvc') -and '--offline' -cin $script:seenArgs -and '--locked' -cin $script:seenArgs) "Target separates host/proc macros and retains offline lock $index"
        Assert-Crt ($env:CARGO_ENCODED_RUSTFLAGS -ceq $case.encoded -and $env:RUSTFLAGS -ceq $case.rust -and $env:VANTARE_VERSION -ceq 'before' -and $env:VANTARE_BUILD_CHANNEL -ceq 'before' -and (Get-Location).Path -ceq $oldLocation) "Failure restores flags, version, channel and location $index"
    }
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
"$passed CRT build checks PASS; inert fixtures: $evidence"
