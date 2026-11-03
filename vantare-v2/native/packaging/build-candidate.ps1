# Repository build tool. Its output contains only motor 2 binaries and manifests.
#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Version,
    [Parameter(Mandatory)][ValidateSet('nightly','testers','master','beta')][string]$Channel,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [ValidateSet('Debug','Release')][string]$BuildProfile='Release',
    [switch]$AllowDirty
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
if($env:DUCKDB_LIB_DIR){throw 'Empaquetado exige DuckDB bundled'}
if($Version -cnotmatch '^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})$'){throw 'Versión inválida'}
$destination=Assert-BuildPath $OutputDirectory
if((Test-Path -LiteralPath $destination) -and @(Get-ChildItem -LiteralPath $destination -Force).Count){throw 'La salida debe estar vacía'}
$native=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceSha=(& git -C $native rev-parse HEAD).Trim()
if($LASTEXITCODE){throw 'No se pudo identificar el SHA fuente'}
$dirty=[bool]@(& git -C $native status --porcelain)
if($LASTEXITCODE -or ($dirty -and -not $AllowDirty)){throw 'Build exige checkout limpio'}
[IO.Directory]::CreateDirectory($destination)|Out-Null
$oldVersion=$env:VANTARE_VERSION;$oldChannel=$env:VANTARE_BUILD_CHANNEL
$oldTarget=$env:CARGO_TARGET_DIR;$oldFlags=$env:CARGO_ENCODED_RUSTFLAGS
try{
    if(-not $env:CARGO_TARGET_DIR){$env:CARGO_TARGET_DIR=Join-Path $destination 'target-build'}
    $env:VANTARE_VERSION=$Version;$env:VANTARE_BUILD_CHANNEL=$Channel
    $staticFlags='-C'+[char]31+'target-feature=+crt-static'
    if($oldFlags){$env:CARGO_ENCODED_RUSTFLAGS=$oldFlags+[char]31+$staticFlags}
    else{$env:CARGO_ENCODED_RUSTFLAGS=$staticFlags}
    Push-Location $native
    try{
        $args=@('build','--workspace','--exclude','vantare-admin','--exclude','vantare-installer','--bins','--target','x86_64-pc-windows-msvc','--locked','--offline','-j','2')
        if($BuildProfile -ceq 'Release'){$args+='--release'}
        & pwsh -NoProfile -File scripts/compilar.ps1 cargo @args
        if($LASTEXITCODE){throw 'Falló la compilación offline'}
        $metadata=& cargo metadata --offline --locked --format-version 1 --filter-platform x86_64-pc-windows-msvc|ConvertFrom-Json
        if($LASTEXITCODE){throw 'No se pudo leer cargo metadata'}
    }finally{Pop-Location}
    $excluded=@('vantare-admin','vantare-setup','vantare-uninstall','vantare-grabar-lmu-completo','vantare-verificar-lmu')
    if($Channel -ceq 'beta'){$excluded+= 'vantare-workshop'}
    $bins=@($metadata.packages|Where-Object {$_.id -cin $metadata.workspace_members}|ForEach-Object {$_.targets|Where-Object {'bin' -cin $_.kind -and $_.name -cnotin $excluded}|ForEach-Object {$_.name}}|Sort-Object -Unique)
    if($bins -cnotcontains 'vantare' -or $bins -cnotcontains 'vantare-hub' -or $bins -cnotcontains 'vantare-services'){throw 'Faltan binarios de producto'}
    $payload=Join-Path $destination 'payload';$binDirectory=Join-Path $payload 'bin'
    [IO.Directory]::CreateDirectory($binDirectory)|Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $payload 'licenses'))|Out-Null
    $dumpbin=Get-NativeDumpbin
    $target=Join-Path ([IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)) ('x86_64-pc-windows-msvc/'+$BuildProfile.ToLowerInvariant())
    foreach($bin in $bins){
        $source=Join-Path $target "$bin.exe"
        Assert-NativeStaticCrt $source $dumpbin
        $embedded=@(& $source --version)
        if($LASTEXITCODE -or ($embedded -join "`n").Trim() -cne "Vantare Native $Version ($Channel)"){throw "Versión del binario incompatible: $bin"}
        $dest=Join-Path $binDirectory "$bin.exe"
        Copy-Item -LiteralPath $source -Destination $dest
        [IO.File]::WriteAllText("$dest.sha256","$(Get-NativeHash $dest)  $bin.exe`n",[Text.UTF8Encoding]::new($false))
    }
    $fixtures=Join-Path $native 'ui/fixtures'
    foreach($item in Get-ChildItem -LiteralPath $fixtures -Recurse -File -Force){
        $null=Assert-BuildPath $item.FullName
        $relative=$item.FullName.Substring($fixtures.Length+1)
        $dest=Join-Path $payload ('bin/fixtures/'+$relative)
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null
        Copy-Item -LiteralPath $item.FullName -Destination $dest
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination (Join-Path $payload 'README.md')
    Copy-Item -LiteralPath (Join-Path $native 'ui/assets/fonts/OFL-Inter.txt') -Destination (Join-Path $payload 'licenses/OFL-Inter.txt')
    $dependencies=@($metadata.packages|Sort-Object name,version|ForEach-Object {@{name=$_.name;version=$_.version;license=$_.license;source=$_.source}})
    Write-BuildJson (Join-Path $payload 'dependencies.json') $dependencies
    $files=@(Get-ChildItem -LiteralPath $payload -Recurse -File -Force|Sort-Object FullName|ForEach-Object {
        $null=Assert-BuildPath $_.FullName
        @{path=$_.FullName.Substring($payload.Length+1).Replace('\','/');size=$_.Length;sha256=(Get-NativeHash $_.FullName)}
    })
    $manifest=[ordered]@{schema=1;product='vantare-native';candidate=$true;channel=$Channel;version=$Version;source_sha=$sourceSha;source_dirty=$dirty;build_profile=$BuildProfile;architecture='windows-x64';data_schema='opaque-v1';engine=2;files=$files}
    Write-BuildJson (Join-Path $payload 'manifest.json') $manifest
    $package=Join-Path $destination 'vantare-native-amd64-package.zip'
    New-BuildZip $payload $package
    $null=Test-BuildPackage $package $Version $Channel
    $hash=Get-NativeHash $package
    $portableTree=Join-Path $destination 'portable-tree'
    $id=[guid]::NewGuid().ToString('N')
    $generation=Join-Path $portableTree ('generations/'+$id)
    [IO.Directory]::CreateDirectory($generation)|Out-Null
    Copy-Item -Path (Join-Path $payload '*') -Destination $generation -Recurse
    [IO.Directory]::CreateDirectory((Join-Path $generation 'data'))|Out-Null
    [IO.File]::WriteAllText((Join-Path $portableTree '.vantare-native'),'offline-candidate-v1')
    Write-BuildJson (Join-Path $portableTree 'state.json') @{schema=1;product='vantare-native';channel=$Channel;active=@{generation=$id;manifest_sha256=(Get-NativeHash (Join-Path $generation 'manifest.json'))};previous=$null}
    Copy-Item -LiteralPath (Join-Path $binDirectory 'vantare.exe') -Destination (Join-Path $portableTree 'Vantare.exe')
    $portable=Join-Path $destination 'vantare-native-portable-amd64.zip'
    New-BuildZip $portableTree $portable
    foreach($artifact in @($package,$portable)){
        [IO.File]::WriteAllText("$artifact.sha256","$(Get-NativeHash $artifact)  $([IO.Path]::GetFileName($artifact))`n",[Text.UTF8Encoding]::new($false))
    }
    [pscustomobject]@{package=$package;sha256=$hash;portable=$portable;source_sha=$sourceSha;source_dirty=$dirty;build_profile=$BuildProfile}
}finally{
    $env:VANTARE_VERSION=$oldVersion;$env:VANTARE_BUILD_CHANNEL=$oldChannel
    $env:CARGO_TARGET_DIR=$oldTarget;$env:CARGO_ENCODED_RUSTFLAGS=$oldFlags
}
