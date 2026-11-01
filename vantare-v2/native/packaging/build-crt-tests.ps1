#requires -Version 5.1
param([string]$EvidenceDirectory=(Join-Path ([IO.Path]::GetTempPath()) ('vantare-crt-'+[guid]::NewGuid().ToString('N'))))
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'candidate.ps1') -Library -Root $PSScriptRoot
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
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
# Successful cargo/metadata boundary: the real builder must inspect the actual
# distributed PE before its --version invocation or copying it into the ZIP.
$fixtureTarget=Join-Path $evidence 'candidate-target'
$fixtureBin=Join-Path $fixtureTarget 'x86_64-pc-windows-msvc/release'
[IO.Directory]::CreateDirectory($fixtureBin)|Out-Null
$firstBin=(Get-NativeBins 'beta')[0]
$dynamic=Join-Path $fixtureBin ($firstBin+'.exe')
Copy-Item (Join-Path $evidence 'dynamic.exe') $dynamic
$script:metadataFixture=@{
    target_directory=$fixtureTarget
    workspace_members=@('fixture-app','fixture-installer')
    packages=@(
        @{id='fixture-app';name='fixture-app';targets=@(($script:NativeBuildBins+$script:NativePrivateBuildBins)|ForEach-Object{@{name=$_;kind=@('bin')}})},
        @{id='fixture-installer';name='vantare-installer';targets=@('vantare-setup','vantare-uninstall'|ForEach-Object{@{name=$_;kind=@('bin')}})}
    )
}|ConvertTo-Json -Depth 8
$script:metadataSeen=$false
function cargo {
    $global:LASTEXITCODE=0
    if($args[0] -ceq 'metadata'){$script:metadataSeen=$true;$script:metadataFixture}
    elseif($args[0] -cne 'build'){throw 'Unexpected fixture cargo operation'}
}
$oldDuck=$env:DUCKDB_LIB_DIR
try{
    Remove-Item Env:DUCKDB_LIB_DIR -ErrorAction SilentlyContinue
    $destination=Join-Path $evidence 'builder-import-rejected'
    $reason=''
    try{Build-NativeCandidate $destination '0.0.979' 'beta' 'Release' $true|Out-Null}catch{$reason=$_.Exception.Message}
    Assert-Crt ($script:metadataSeen -and $reason.Contains('CRT din') -and $reason.Contains($dynamic)) 'Successful build and valid metadata reach the real builder import rejection'
    Assert-Crt (-not (Test-Path (Join-Path $destination ('payload/bin/'+$firstBin+'.exe')))) 'Builder rejects dynamic CRT before copying distributed EXE'
}finally{$env:DUCKDB_LIB_DIR=$oldDuck}

# Exercise build-installer.ps1 itself with real PE files and a valid closed ZIP.
# Cargo is the substituted compilation boundary; imports, metadata and archive
# validation remain real. The version resource lets the static case finish.
$resource=Join-Path $evidence 'version.rc'
[IO.File]::WriteAllText($resource,@'
1 VERSIONINFO
FILEVERSION 0,0,979,0
PRODUCTVERSION 0,0,979,0
BEGIN
 BLOCK "StringFileInfo"
 BEGIN
  BLOCK "040904B0"
  BEGIN
   VALUE "ProductName", "Vantare\0"
   VALUE "ProductVersion", "0.0.979\0"
   VALUE "FileVersion", "0.0.979\0"
  END
 END
 BLOCK "VarFileInfo"
 BEGIN
  VALUE "Translation", 0x0409, 0x04B0
 END
END
'@)
Push-Location $evidence
try{
    & rc.exe /nologo version.rc *> resource-build.log
    if($LASTEXITCODE){throw 'Version resource fixture failed'}
    & cl /nologo /MT main.c version.res /Fe:installer-static.exe *> installer-static-build.log
    if($LASTEXITCODE){throw 'Static installer fixture failed'}
}finally{Pop-Location}
$payload=Join-Path $evidence 'installer-payload'
foreach($member in Get-NativeMembers 'beta'){
    $file=Join-Path $payload $member
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file))|Out-Null
    if($member.EndsWith('.exe')){Copy-Item (Join-Path $evidence 'installer-static.exe') $file}
    elseif($member.EndsWith('.exe.sha256')){[IO.File]::WriteAllText($file,((Get-NativeHash $file.Substring(0,$file.Length-7))+'  '+[IO.Path]::GetFileName($file.Substring(0,$file.Length-7))+"`n"))}
    elseif($member -ceq 'candidate.ps1'){Copy-Item (Join-Path $PSScriptRoot 'candidate.ps1') $file}
    else{[IO.File]::WriteAllText($file,'inert fixture')}
}
$members=@(Get-NativeMembers 'beta'|ForEach-Object{$file=Join-Path $payload $_;@{path=$_;size=(Get-Item $file).Length;sha256=(Get-NativeHash $file)}})
Write-NativeJson (Join-Path $payload 'manifest.json') @{schema=1;product='vantare-native';candidate=$true;architecture='windows-x64';data_schema='opaque-v1';source_sha=('a'*40);source_dirty=$false;build_profile='Release';version='0.0.979';channel='beta';files=$members}
$archive=Join-Path $evidence 'installer-package.zip';New-NativeZip $payload $archive
$installerStatic=Join-Path $evidence 'installer-static.exe'
$installerDynamic=Join-Path $evidence 'dynamic.exe'
$previousTarget=$env:CARGO_TARGET_DIR
try{
    foreach($badBin in @('vantare-uninstall','vantare-setup','')){
        $fixtureBadBin=$badBin
        # Bind fixture paths to this test, independent of the child script scope.
        Set-Item Function:cargo -Value ({
            $global:LASTEXITCODE=0
            if($args[0] -cne 'build'){throw 'Unexpected installer fixture cargo operation'}
            $bin=$args[[Array]::IndexOf($args,'--bin')+1]
            $source=if($bin -ceq $fixtureBadBin){$installerDynamic}else{$installerStatic}
            $target=Join-Path $env:CARGO_TARGET_DIR ('x86_64-pc-windows-msvc/release/'+$bin+'.exe')
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
            Copy-Item -LiteralPath $source -Destination $target -Force
        }.GetNewClosure())
        $label=if($badBin){$badBin}else{'both-static'}
        $output=Join-Path $evidence $label;[IO.Directory]::CreateDirectory($output)|Out-Null
        Copy-Item $archive (Join-Path $output 'vantare-native-amd64-package.zip')
        $env:CARGO_TARGET_DIR=Join-Path $evidence ($label+'-target')
        $reason=''
        try{& (Join-Path $PSScriptRoot 'build-installer.ps1') -Version '0.0.979' -OutputDirectory $output|Out-Null}catch{$reason=$_.Exception.Message}
        if($badBin){
            $exe=if($badBin -ceq 'vantare-uninstall'){'Uninstall.exe'}else{'VantareSetup.exe'}
            Assert-Crt ($reason.Contains('CRT din') -and $reason.Contains($exe)) "Actual installer builder rejects dynamic $exe imports" $reason
            Assert-Crt (-not(Test-Path (Join-Path $output 'VantareSetup.exe.sha256'))) "Rejected $exe never produces a validated Setup sidecar"
        }else{
            Assert-Crt (-not $reason -and (Test-Path (Join-Path $output 'VantareSetup.exe.sha256')) -and (Test-Path (Join-Path $output 'Uninstall.exe.sha256'))) 'Actual installer builder accepts both static PE files and validates version metadata' $reason
        }
    }
}finally{$env:CARGO_TARGET_DIR=$previousTarget}
"$passed CRT build checks PASS; inert fixtures: $evidence"
