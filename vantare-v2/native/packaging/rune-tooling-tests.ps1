# CPU-only fixtures; no compiler, executable or network is started.
#requires -Version 5.1
param([Parameter(Mandatory)][string]$QaRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
. (Join-Path $PSScriptRoot 'no-qa.ps1')
$root=Join-Path (Assert-BuildPath $QaRoot) ('rune-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
function Reject-Rune([scriptblock]$Action) {
    $failed=$false;try{& $Action|Out-Null}catch{$failed=$true}
    if(-not $failed){throw 'Unsafe Rune input accepted'}
}
$inventory=Get-Content (Join-Path $PSScriptRoot 'public-inventory.json') -Raw|ConvertFrom-Json
$expected=@('vantare.exe','vantare-core.exe','vantare-overlays.exe','vantare-overlays-rune.exe','vantare-hub.exe','vantare-engineer.exe','vantare-services.exe','vantare-storage.exe','vantare-grabar-lmu.exe','vantare-grabar-acc.exe','vantare-import-profile.exe')
if(($inventory.executables -join ',') -cne ($expected -join ',')){throw 'Public executable inventory differs'}
if(($inventory.external_bins -join ',') -cne 'vantare-overlays-rune.exe'){throw 'Rune must be the only external executable'}
$null=Assert-PublicExternalBins $inventory
foreach($external in @(@('vantare-core.exe'),@('foreign.exe'),@('vantare-overlays-rune.exe','vantare-overlays-rune.exe'))) {
    $bad=$inventory|ConvertTo-Json -Depth 20|ConvertFrom-Json
    $bad.external_bins=$external
    Reject-Rune {Assert-PublicExternalBins $bad}
}
$bad=$inventory|ConvertTo-Json -Depth 20|ConvertFrom-Json
$bad.executables=@($bad.executables|Where-Object {$_ -cne 'vantare-overlays-rune.exe'})
Reject-Rune {Assert-PublicExternalBins $bad}
$bad=$inventory|ConvertTo-Json -Depth 20|ConvertFrom-Json
$bad.external_bins='vantare-overlays-rune.exe'
Reject-Rune {Assert-PublicExternalBins $bad}
$bad=$inventory|ConvertTo-Json -Depth 20|ConvertFrom-Json
$bad.PSObject.Properties.Remove('external_bins')
Reject-Rune {Assert-PublicExternalBins $bad}
$bad=$inventory|ConvertTo-Json -Depth 20|ConvertFrom-Json
$bad.external_bins=@()
Reject-Rune {Assert-PublicExternalBins $bad}
$bad=$inventory|ConvertTo-Json -Depth 20|ConvertFrom-Json
$bad.artifact_overrides|Add-Member -NotePropertyName 'vantare-overlays-rune.exe' -NotePropertyValue 'vantare-overlays.exe'
Reject-Rune {Assert-PublicExternalBins $bad}
# Rune is absent from main-workspace metadata, without hiding any ordinary bin.
$main=@($expected|Where-Object {$_ -cne 'vantare-overlays-rune.exe'}|ForEach-Object {
    if($_ -ceq 'vantare-hub.exe'){'vantare-hub-host'}else{[IO.Path]::GetFileNameWithoutExtension($_)}
})
Assert-PublicBins $main $inventory
Reject-Rune {Assert-PublicBins @($main|Where-Object {$_ -cne 'vantare-overlays'}) $inventory}
$lock=Join-Path $root 'Cargo.lock'
function Put-RuneLock([string]$Source) {
    $text="version = 4`n[[package]]`nname = `"fixture`"`nversion = `"1.0.0`"`nsource = `"$Source`"`n"
    [IO.File]::WriteAllText($lock,$text,[Text.UTF8Encoding]::new($false))
}
$git='git+https://github.com/isaacalbala12/rune?rev=d5338988a7c1b3377adb60853815b6d0843dae7c#d5338988a7c1b3377adb60853815b6d0843dae7c'
foreach($source in @($git,'registry+https://github.com/rust-lang/crates.io-index')) {
    Put-RuneLock $source
    $hash=Assert-RuneLock $lock
    $null=Assert-RuneLock $lock $hash
}
foreach($source in @($git.Replace('isaacalbala12','other'),$git.Replace('#d5338988','#05338988'),'registry+https://registry.invalid/index','sparse+https://registry.invalid/')) {
    Put-RuneLock $source
    Reject-Rune {Assert-RuneLock $lock}
}
Put-RuneLock $git
$hash=Assert-RuneLock $lock
[IO.File]::AppendAllText($lock,"# changed`n")
Reject-Rune {Assert-RuneLock $lock $hash}
# Rune is an ordinary non-QA image; the byte gate must still reject QA bytes.
$image=Join-Path $root 'tree/bin/vantare-overlays-rune.exe'
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($image))|Out-Null
[IO.File]::WriteAllText($image,'ordinary product bytes')
Assert-NativeDistributionTree (Join-Path $root 'tree')
[IO.File]::WriteAllText($image,'VANTARE_QA_E2E_NOT_FOR_DISTRIBUTION_1916')
Reject-Rune {Assert-NativeDistributionTree (Join-Path $root 'tree')}
'PASS Rune inventory, lock sources/hash and distribution byte gate'

& (Join-Path $PSScriptRoot 'rune-cargo-home-tests.ps1') -QaRoot $root
& (Join-Path $PSScriptRoot 'rune-target-tests.ps1') -QaRoot $root
