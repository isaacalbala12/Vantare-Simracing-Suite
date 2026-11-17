# Inert fixtures only: no Cargo, fetch, compiler or window.
#requires -Version 5.1
param([Parameter(Mandatory)][string]$QaRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
$root=Join-Path (Assert-BuildPath $QaRoot) ('rune-home-'+[guid]::NewGuid().ToString('N'))
$hostHome=Join-Path $root 'host'
$privateHome=Join-Path $root 'private'
[IO.Directory]::CreateDirectory($hostHome)|Out-Null
[IO.File]::WriteAllText((Join-Path $hostHome 'config.toml'),'[source.crates-io]')
$previousCargoHome=$env:CARGO_HOME
function Reject-Home([scriptblock]$Action) {
    $failed=$false;try{& $Action|Out-Null}catch{$failed=$true}
    if(-not $failed){throw 'Unsafe Rune Cargo home accepted'}
}
try {
    $env:CARGO_HOME=$hostHome
    $value=Invoke-RuneCargoHome $privateHome {
        if($env:CARGO_HOME -cne $privateHome){throw 'Host Cargo home leaked into Rune'}
        if(@(Get-ChildItem -LiteralPath $env:CARGO_HOME -Force).Count){throw 'New home was not empty'}
        [IO.File]::WriteAllText((Join-Path $env:CARGO_HOME 'cache-marker'),'keep')
        'metadata-result'
    }
    if($value -cne 'metadata-result' -or $env:CARGO_HOME -cne $hostHome){throw 'Result/environment not restored'}
    Invoke-RuneCargoHome $privateHome {
        if(-not (Test-Path (Join-Path $env:CARGO_HOME 'cache-marker'))){throw 'Dedicated cache was not reusable'}
    }
    Reject-Home {Invoke-RuneCargoHome $privateHome {throw 'fetch failed'}}
    if($env:CARGO_HOME -cne $hostHome){throw 'Environment leaked after failed action'}
    [IO.File]::Delete((Join-Path $hostHome 'config.toml'))
    Reject-Home {Invoke-RuneCargoHome $hostHome {'must not run'}}
    # Reused cache may contain registry/git data, but no Cargo source/patch config.
    foreach($name in @('config','config.toml')) {
        $config=Join-Path $privateHome $name
        [IO.File]::WriteAllText($config,'[patch.crates-io]')
        Reject-Home {Invoke-RuneCargoHome $privateHome {'must not run'}}
        [IO.File]::Delete($config)
    }
    Remove-Item -LiteralPath Env:CARGO_HOME -ErrorAction SilentlyContinue
    Invoke-RuneCargoHome $privateHome {}
    if(Test-Path Env:CARGO_HOME){throw 'Unset environment was not restored'}
    $env:CARGO_HOME=$hostHome
    # Cargo checkout layout: git/checkouts/<repo-hash>/<short-revision>/...
    Assert-RuneNoSubmodules $privateHome
    $checkout=Join-Path $privateHome 'git/checkouts/rune-fixture/d533898/crates/nested'
    [IO.Directory]::CreateDirectory($checkout)|Out-Null
    Assert-RuneNoSubmodules $privateHome
    foreach($directory in @($checkout,(Join-Path $privateHome 'git/checkouts/rune-fixture/d533898'))) {
        $modules=Join-Path $directory '.gitmodules'
        [IO.File]::WriteAllText($modules,'[submodule "forbidden"]')
        $message=''
        try{Assert-RuneNoSubmodules $privateHome}catch{$message=$_.Exception.Message}
        if($message -notlike '*.gitmodules*'){throw 'Submodule was not clearly rejected'}
        Reject-Home {Invoke-RuneCargoHome $privateHome {Assert-RuneNoSubmodules $env:CARGO_HOME}}
        if($env:CARGO_HOME -cne $hostHome){throw 'Environment leaked after submodule rejection'}
        [IO.File]::Delete($modules)
    }
    Assert-RuneNoSubmodules $privateHome
} finally {$env:CARGO_HOME=$previousCargoHome}
# Validate the repository lock itself, in addition to the synthetic source cases.
$repoLock=Join-Path $PSScriptRoot '../overlays-rune/Cargo.lock'
$before=Get-NativeHash $repoLock
if((Assert-RuneLock $repoLock) -cne $before){throw 'Real Rune lock rejected or changed'}
'PASS dedicated Rune home, restore/reuse/config rejection, submodules and real Cargo.lock'
