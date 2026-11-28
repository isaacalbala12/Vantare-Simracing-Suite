# Runs the real Rust stage of build-candidate.ps1 with a fake toolchain, in a
# temporary copy: nothing is compiled, fetched or executed (#2862).
#requires -Version 5.1
param([Parameter(Mandatory)][string]$QaRoot)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $QaRoot ('rune-target-'+[guid]::NewGuid().ToString('N'))))
$native=Join-Path $root 'repo/native'
$packaging=Join-Path $native 'packaging'
$destination=Join-Path $root 'salida'
$slot=Join-Path $root 'slot'
function Put-Fixture([string]$Path,[string]$Text) {
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path))|Out-Null
    [IO.File]::WriteAllText($Path,$Text)
}
# The temporary copy goes away even when an assertion fails.
try{
    # Script under test and the queue's target rules are real; the rest are stubs.
    foreach($pair in @(@('build-candidate.ps1','packaging'),@('../scripts/target-slot.ps1','scripts'))){
        $copy=Join-Path $native (Join-Path $pair[1] (Split-Path $pair[0] -Leaf))
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($copy))|Out-Null
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $pair[0]) -Destination $copy
    }
    Put-Fixture (Join-Path $packaging 'public-inventory.json') '{"executables":["vantare.exe","vantare-overlays-rune.exe"],"external_bins":["vantare-overlays-rune.exe"],"resources":[]}'
    Put-Fixture (Join-Path $packaging 'README.md') 'fixture'
    Put-Fixture (Join-Path $native 'ui/assets/fonts/OFL-Inter.txt') 'fixture'
    Put-Fixture (Join-Path $root 'repo/hub-web/release/package/vantare-hub-ui-win32-x64/fixture.txt') 'fixture'
    Put-Fixture (Join-Path $packaging 'build-config.ps1') 'function Assert-NativeDistributionConfigFile {};function Import-NativeBuildConfig {};function Restore-NativeBuildConfig {}'
    Put-Fixture (Join-Path $packaging 'no-qa.ps1') 'function Assert-NativeDistributionFeatures {};function Assert-NativeDistributionBinary {}'
    Put-Fixture (Join-Path $packaging 'build-tooling.ps1') @'
function Assert-BuildPath($Path){[IO.Path]::GetFullPath($Path)}
function Assert-HubPackage {[pscustomobject]@{files=@()}}
function Assert-HubSource {}
function Invoke-RuneCargoHome($Directory,[scriptblock]$Action){& $Action}
function Assert-RuneLock {'hash'}
function Assert-RuneNoSubmodules {}
function Assert-PublicBins {}
function Get-NativeDumpbin {'dumpbin'}
function Assert-NativeStaticCrt {}
function Get-PublicArtifact($Name){$Name}
function Invoke-BuildProcess {'Vantare Native 0.0.989 (nightly)'}
function Get-NativeHash {'0'*64}
function Write-BuildJson {}
# First step after copying the binaries: the test ends here.
function Write-HubNotices {throw 'FIN-DE-PRUEBA'}
'@
    Put-Fixture (Join-Path $packaging 'rune-release-version-tests.ps1') 'param($Executable,$Version,$Channel);[IO.File]::WriteAllText((Join-Path (Split-Path $PSScriptRoot) ''version-checked.txt''),$Executable)'
    # A previous build left a Rune executable in the shared location.
    $shared=Join-Path $slot 'x86_64-pc-windows-msvc/release/vantare-overlays-rune.exe'
    Put-Fixture $shared 'resto de otro checkout'

    function git {$global:LASTEXITCODE=0;if($args -contains 'rev-parse'){'a'*40}}
    function cargo {$global:LASTEXITCODE=0;'{"packages":[],"workspace_members":[],"resolve":{"nodes":[]}}'}
    # The queue: a build writes its executable where Cargo would.
    function pwsh {
        $words=@($args|ForEach-Object {"$_"});$global:LASTEXITCODE=0
        if($words -cnotcontains 'build'){return}
        $option=[array]::IndexOf($words,'--target-dir')
        $directory=if($option -ge 0){$words[$option+1]}else{$env:CARGO_TARGET_DIR}
        $name=if($words -ccontains 'overlays-rune/Cargo.toml'){'vantare-overlays-rune'}else{'vantare'}
        Put-Fixture (Join-Path $directory "x86_64-pc-windows-msvc/release/$name.exe") "compilado en $([IO.Path]::GetFullPath($directory))"
    }

    $names=@('CARGO_TARGET_DIR','VANTARE_CARGO_QUEUE_OWNER','VANTARE_INTERNAL_CANDIDATE_STAGE','DUCKDB_LIB_DIR','CARGO_ENCODED_RUSTFLAGS')
    $saved=@{}
    foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
    $location=Get-Location
    try{
        Remove-Item Env:DUCKDB_LIB_DIR -ErrorAction SilentlyContinue
        $env:CARGO_TARGET_DIR=$slot
        $env:VANTARE_CARGO_QUEUE_OWNER='99999919'
        $env:VANTARE_INTERNAL_CANDIDATE_STAGE=$destination
        $reached=$false
        try{& (Join-Path $packaging 'build-candidate.ps1') -Version '0.0.989' -Channel nightly -OutputDirectory $destination -AllowDirty|Out-Null}
        catch{if($_.Exception.Message -cne 'FIN-DE-PRUEBA'){throw};$reached=$true}
        if(-not $reached){throw 'La fase Rust no llegó a copiar los binarios.'}
    }finally{
        foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
        Set-Location $location
    }
    $rune=Join-Path $slot 'rune'
    if([IO.File]::ReadAllText($shared) -cne 'resto de otro checkout'){throw 'Rune se compiló en la carpeta compartida.'}
    if([IO.File]::ReadAllText((Join-Path $destination 'payload/bin/vantare-overlays-rune.exe')) -cne "compilado en $rune"){throw 'El candidato no lleva el Rune compilado en <ranura>/rune.'}
    if([IO.File]::ReadAllText((Join-Path $destination 'payload/bin/vantare.exe')) -cne "compilado en $slot"){throw 'Un binario nativo no salió de la carpeta de la ranura.'}
    $checked=[IO.File]::ReadAllText((Join-Path $native 'version-checked.txt'))
    if(-not [IO.Path]::GetFullPath($checked).StartsWith($rune+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'La versión se comprobó en otro Rune.'}
}finally{
    if(Test-Path -LiteralPath $root){[IO.Directory]::Delete($root,$true)}
}
'PASS Rune builds in <target>/rune and the candidate takes that executable'
