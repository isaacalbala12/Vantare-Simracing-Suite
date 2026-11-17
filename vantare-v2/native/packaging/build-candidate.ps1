# Repository build tool. Its output contains only motor 2 binaries and manifests.
#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Version,
    [Parameter(Mandatory)][ValidateSet('nightly','testers','master','beta')][string]$Channel,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [ValidateSet('Debug','Release')][string]$BuildProfile='Release',
    [string]$ConfigFile,
    [switch]$AllowDirty
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
. (Join-Path $PSScriptRoot 'build-config.ps1')
. (Join-Path $PSScriptRoot 'no-qa.ps1')
if($env:DUCKDB_LIB_DIR){throw 'Empaquetado exige DuckDB bundled'}
if($Version -cnotmatch '^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\z'){throw 'Versión inválida'}
if(@($Version.Split('.')|Where-Object {[int]$_ -gt 65535}).Count){throw 'Versión fuera de rango'}
Assert-NativeDistributionConfigFile $Channel $ConfigFile
$destination=Assert-BuildPath $OutputDirectory
# Private, one-use handoff from this process to its queued child, bound to output.
$rustStage=$env:VANTARE_INTERNAL_CANDIDATE_STAGE -ceq $destination
Remove-Item Env:VANTARE_INTERNAL_CANDIDATE_STAGE -ErrorAction SilentlyContinue
if(-not $RustStage -and (Test-Path -LiteralPath $destination) -and @(Get-ChildItem -LiteralPath $destination -Force).Count){throw 'La salida debe estar vacía'}
$native=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceSha=(& git -C $native rev-parse HEAD).Trim()
if($LASTEXITCODE){throw 'No se pudo identificar el SHA fuente'}
$dirty=[bool]@(& git -C $native status --porcelain)
if($LASTEXITCODE -or ($dirty -and -not $AllowDirty)){throw 'Build exige checkout limpio'}
[IO.Directory]::CreateDirectory($destination)|Out-Null
$oldVersion=$env:VANTARE_VERSION;$oldChannel=$env:VANTARE_BUILD_CHANNEL
$oldTarget=$env:CARGO_TARGET_DIR;$oldFlags=$env:CARGO_ENCODED_RUSTFLAGS
$oldLocal=$env:LOCALAPPDATA;$oldRoaming=$env:APPDATA
$previousConfig=$null
try{
    $previousConfig=Import-NativeBuildConfig $ConfigFile
    if($Channel -ieq 'beta'){Assert-NativeDistributionLicenseRegistry $env:VANTARE_LICENSE_PUBLIC_KEYS -Required}
    foreach($pair in @(@('VANTARE_NATIVE_DATA_ROOT','native'),@('LOCALAPPDATA','local'),@('APPDATA','roaming'))){
        $data=Join-Path $destination ('.build-data/'+$pair[1])
        [IO.Directory]::CreateDirectory($data)|Out-Null
        [Environment]::SetEnvironmentVariable($pair[0],$data,'Process')
    }
    $env:VANTARE_VERSION=$Version;$env:VANTARE_BUILD_CHANNEL=$Channel
    $web=Join-Path $native '../hub-web'
    if(-not $RustStage){
        Push-Location $web
        try{
            & bun run build
            if($LASTEXITCODE){throw 'Falló build Electron'}
            & bun run package
            if($LASTEXITCODE){throw 'Falló package Electron'}
        }finally{Pop-Location}
        # Build and copy before releasing the shared target's lease.
        $forward=@('-Version',$Version,'-Channel',$Channel,'-OutputDirectory',$destination,'-BuildProfile',$BuildProfile)
        if($ConfigFile){$forward+=@('-ConfigFile',([IO.Path]::GetFullPath($ConfigFile)))}
        if($AllowDirty){$forward+='-AllowDirty'}
        $priorStage=$env:VANTARE_INTERNAL_CANDIDATE_STAGE
        try{
            $env:VANTARE_INTERNAL_CANDIDATE_STAGE=$destination
            if($env:VANTARE_CARGO_QUEUE_OWNER){& $PSCommandPath -Version $Version -Channel $Channel -OutputDirectory $destination -BuildProfile $BuildProfile -ConfigFile $ConfigFile -AllowDirty:$AllowDirty}
            else{
                & pwsh -NoProfile -File (Join-Path $native 'scripts/compilar.ps1') pwsh -NoProfile -File $PSCommandPath @forward
                if($LASTEXITCODE){throw 'Falló el candidato dentro del slot'}
            }
        }finally{$env:VANTARE_INTERNAL_CANDIDATE_STAGE=$priorStage}
        return
    }
    if(-not $env:VANTARE_CARGO_QUEUE_OWNER -or -not $env:CARGO_TARGET_DIR){throw 'La fase Rust exige el slot de compilación'}
    $staticFlags='-C'+[char]31+'target-feature=+crt-static'
    if($oldFlags){$env:CARGO_ENCODED_RUSTFLAGS=$oldFlags+[char]31+$staticFlags}
    else{$env:CARGO_ENCODED_RUSTFLAGS=$staticFlags}
    $ui=Join-Path $web 'release/package/vantare-hub-ui-win32-x64'
    $receipt=Assert-HubPackage $ui (Join-Path $web 'release/package/package-inventory.json') $Version $sourceSha $dirty
    Assert-HubSource $web

    Push-Location $native
    try{
        # The queue exports Machine > process jobs; do not override it with -j 2.
        $args=@('build','--workspace','--exclude','vantare-admin','--exclude','vantare-installer','--exclude','vantare-hub','--exclude','vantare-hub-host','--bins','--target','x86_64-pc-windows-msvc','--locked','--offline','--timings')
        if($BuildProfile -ceq 'Release'){$args+='--release'}
        & pwsh -NoProfile -File scripts/compilar.ps1 cargo @args
        if($LASTEXITCODE){throw 'Falló la compilación offline'}
        $hostArgs=@('build','-p','vantare-hub-host','--bin','vantare-hub-host','--target','x86_64-pc-windows-msvc','--locked','--offline')
        if($BuildProfile -ceq 'Release'){$hostArgs+='--release'}
        & pwsh -NoProfile -File scripts/compilar.ps1 cargo @hostArgs
        if($LASTEXITCODE){throw 'Falló el anfitrión Rust aislado'}
        $metadata=& cargo metadata --offline --locked --format-version 1 --filter-platform x86_64-pc-windows-msvc|ConvertFrom-Json
        if($LASTEXITCODE){throw 'No se pudo leer cargo metadata'}
        Assert-NativeDistributionFeatures @($metadata.resolve.nodes|ForEach-Object {$_.features})
        # Rune is isolated: validate the pin before allowing its one online fetch.
        $runeLock=Join-Path $native 'overlays-rune/Cargo.lock'
        $runeHash=Assert-RuneLock $runeLock
        $oldOffline=$env:CARGO_NET_OFFLINE
        try{
            $env:CARGO_NET_OFFLINE='false'
            & pwsh -NoProfile -File scripts/compilar.ps1 cargo fetch --locked --manifest-path overlays-rune/Cargo.toml
            if($LASTEXITCODE){throw 'Falló el fetch bloqueado de Rune'}
        }finally{$env:CARGO_NET_OFFLINE=$oldOffline}
        $null=Assert-RuneLock $runeLock $runeHash
        $runeArgs=@('build','--manifest-path','overlays-rune/Cargo.toml','--target','x86_64-pc-windows-msvc','--offline','--locked')
        if($BuildProfile -ceq 'Release'){$runeArgs+='--release'}
        & pwsh -NoProfile -File scripts/compilar.ps1 cargo @runeArgs
        if($LASTEXITCODE){throw 'Falló la compilación offline de Rune'}
        $null=Assert-RuneLock $runeLock $runeHash
        $runeMetadata=& cargo metadata --manifest-path overlays-rune/Cargo.toml --offline --locked --format-version 1 --filter-platform x86_64-pc-windows-msvc|ConvertFrom-Json
        if($LASTEXITCODE){throw 'No se pudo leer cargo metadata de Rune'}
        Assert-NativeDistributionFeatures @($runeMetadata.resolve.nodes|ForEach-Object {$_.features})
    }finally{Pop-Location}
    $inventory=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'public-inventory.json') -Raw|ConvertFrom-Json
    $bins=@($inventory.executables|ForEach-Object {[IO.Path]::GetFileNameWithoutExtension($_)}|Sort-Object -Unique)
    $available=@($metadata.packages|Where-Object {$_.id -cin $metadata.workspace_members}|ForEach-Object {$_.targets|Where-Object {'bin' -cin $_.kind}|ForEach-Object {$_.name}}|Sort-Object -Unique)
    Assert-PublicBins $available $inventory
    $payload=Join-Path $destination 'payload';$binDirectory=Join-Path $payload 'bin'
    [IO.Directory]::CreateDirectory($binDirectory)|Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $payload 'licenses'))|Out-Null
    $dumpbin=Get-NativeDumpbin
    $target=Join-Path ([IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)) ('x86_64-pc-windows-msvc/'+$BuildProfile.ToLowerInvariant())
    foreach($bin in $bins){
        $name="$bin.exe"
        $artifact=Get-PublicArtifact $name $inventory
        $source=Join-Path $target $artifact
        Assert-NativeDistributionBinary $source
        Assert-NativeStaticCrt $source $dumpbin
        $embedded=Invoke-BuildProcess $source @('--version') $null
        if($embedded.Trim() -cne "Vantare Native $Version ($Channel)"){throw "Versión del binario incompatible: $bin"}
        $dest=Join-Path $binDirectory "$bin.exe"
        Copy-Item -LiteralPath $source -Destination $dest
        [IO.File]::WriteAllText("$dest.sha256","$(Get-NativeHash $dest)  $bin.exe`n",[Text.UTF8Encoding]::new($false))
    }
    $fixtures=Join-Path $native 'ui/fixtures'
    foreach($relative in $inventory.resources){
        $item=Get-Item -LiteralPath (Join-Path $fixtures $relative)
        $null=Assert-BuildPath $item.FullName
        $dest=Join-Path $payload ('bin/fixtures/'+$relative)
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null
        Copy-Item -LiteralPath $item.FullName -Destination $dest
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination (Join-Path $payload 'README.md')
    Copy-Item -LiteralPath (Join-Path $native 'ui/assets/fonts/OFL-Inter.txt') -Destination (Join-Path $payload 'licenses/OFL-Inter.txt')
    $dependencies=@(($metadata.packages+$runeMetadata.packages)|Sort-Object name,version,source -Unique|ForEach-Object {@{name=$_.name;version=$_.version;license=$_.license;source=$_.source}})
    Write-BuildJson (Join-Path $payload 'dependencies.json') $dependencies
    Copy-Item -LiteralPath $ui -Destination (Join-Path $payload 'hub-ui') -Recurse
    Write-HubNotices $web (Join-Path $payload 'licenses/hub-web-notices.txt')
    Assert-PublicInventory $payload $inventory $receipt.files
    Assert-NativeDistributionTree $payload
    Assert-HubSource $web
    if((& git -C $native rev-parse HEAD).Trim() -cne $sourceSha -or [bool]@(& git -C $native status --porcelain) -ne $dirty){throw 'La fuente cambió durante el candidato'}
    $files=@(Get-ChildItem -LiteralPath $payload -Recurse -File -Force|Sort-Object FullName|ForEach-Object {
        $null=Assert-BuildPath $_.FullName
        @{path=$_.FullName.Substring($payload.Length+1).Replace('\','/');size=$_.Length;sha256=(Get-NativeHash $_.FullName)}
    })
    $manifest=[ordered]@{schema=1;product='vantare-native';candidate=$true;channel=$Channel;version=$Version;source_sha=$sourceSha;source_dirty=$dirty;build_profile=$BuildProfile;architecture='windows-x64';data_schema='opaque-v1';engine=2;files=$files}
    Write-BuildJson (Join-Path $payload 'manifest.json') $manifest
    Assert-NativeDistributionLicensePackage -Registry $env:VANTARE_LICENSE_PUBLIC_KEYS -Executables @(
        Get-ChildItem -LiteralPath $payload -Filter '*.exe' -File -Recurse | Select-Object -ExpandProperty FullName
    )
    $package=Join-Path $destination 'vantare-native-amd64-package.zip'
    New-BuildZip $payload $package
    $null=Test-BuildPackage $package $Version $Channel
    $hash=Get-NativeHash $package
    $portableTree=Join-Path $destination 'portable-tree'
    $id=[guid]::NewGuid().ToString('N')
    $generation=Join-Path $portableTree ('generations/'+$id)
    [IO.Directory]::CreateDirectory($generation)|Out-Null
    Copy-Item -Path (Join-Path $payload '*') -Destination $generation -Recurse
    $manifestPath=Join-Path $payload 'manifest.json'
    Assert-SealedFiles $generation ($files+@(@{path='manifest.json';size=(Get-Item -LiteralPath $manifestPath).Length;sha256=(Get-NativeHash $manifestPath)}))
    [IO.Directory]::CreateDirectory((Join-Path $generation 'data'))|Out-Null
    # The portable ZIP omits directory records; keep its initial data/ on extraction.
    [IO.File]::WriteAllBytes((Join-Path $generation 'data/.vantare-directory'),[byte[]]::new(0))
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
    Restore-NativeBuildConfig $previousConfig
    $env:LOCALAPPDATA=$oldLocal;$env:APPDATA=$oldRoaming
    $env:VANTARE_VERSION=$oldVersion;$env:VANTARE_BUILD_CHANNEL=$oldChannel
    $env:CARGO_TARGET_DIR=$oldTarget;$env:CARGO_ENCODED_RUSTFLAGS=$oldFlags
}
