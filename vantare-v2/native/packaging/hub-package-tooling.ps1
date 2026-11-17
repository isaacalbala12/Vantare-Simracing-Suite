# P1's receipt closes the Electron tree; no third-party EXE is executed.
function Assert-ExecutableSidecar([string]$Path) {
    $sidecar=Assert-BuildPath "$Path.sha256"
    if(([IO.File]::ReadAllText($sidecar)).Trim() -cne "$(Get-NativeHash $Path)  $([IO.Path]::GetFileName($Path))"){throw 'Sidecar ejecutable incompatible'}
}
function Assert-SealedFiles([string]$Directory,$Files) {
    $directory=Assert-BuildPath $Directory
    $names=@($Files|ForEach-Object {$_.path})
    if(-not $names.Count -or @($names|Sort-Object -Unique).Count -ne $names.Count){throw 'Inventario Electron vacío o duplicado'}
    foreach($file in $Files){
        if($file.path -cnotmatch '^[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$' -or @($file.path.Split('/')|Where-Object {$_ -in @('.','..') -or $_ -like '.env*'}).Count){throw 'Ruta Electron inválida'}
        $path=Assert-BuildPath (Join-Path $directory $file.path)
        if($file.size -lt 0 -or $file.sha256 -cnotmatch '^[0-9a-f]{64}$' -or (Get-Item -LiteralPath $path).Length -ne $file.size -or (Get-NativeHash $path) -cne $file.sha256){throw 'Integridad Electron incompatible'}
        if($file.path.EndsWith('.exe',[StringComparison]::OrdinalIgnoreCase)){Assert-ExecutableSidecar $path}
    }
    $actual=@(Get-ChildItem -LiteralPath $directory -Recurse -Force|ForEach-Object {
        $null=Assert-BuildPath $_.FullName
        if(-not $_.PSIsContainer){$_.FullName.Substring($directory.Length+1).Replace('\','/')}
    })
    if((@($actual|Sort-Object -CaseSensitive) -join "`n") -cne (@($names|Sort-Object -CaseSensitive) -join "`n")){throw 'Miembros Electron incompatibles'}
}
function Assert-HubPackage([string]$Directory,[string]$Receipt,[string]$Version,[string]$SourceSha,[bool]$SourceDirty) {
    $receiptPath=Assert-BuildPath $Receipt
    if((Get-Item -LiteralPath $receiptPath).Length -gt 65536){throw 'Recibo Electron demasiado grande'}
    $build=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
    if($build.qa -isnot [bool] -or $build.qa -or $build.version -cne $Version -or $build.source_sha -cne $SourceSha -or $build.source_dirty -isnot [bool] -or $build.source_dirty -ne $SourceDirty -or $build.source_tree_sha256 -cnotmatch '^[0-9a-f]{64}$' -or $build.architecture -cne 'windows-x64' -or $build.electron_version -cne '45.2.3'){throw 'Procedencia Electron incompatible'}
    foreach($required in @('vantare-hub-ui.exe','vantare-hub-ui.exe.sha256','resources/app.asar','LICENSE','LICENSES.chromium.html','locales/es.pak','locales/en-US.pak')){
        if($required -cnotin @($build.files.path)){throw 'Electron incompleto'}
    }
    if(@($build.files|Where-Object {$_.path -like 'locales/*' -and $_.path -cnotin @('locales/es.pak','locales/en-US.pak')}).Count){throw 'Locales Electron no autorizados'}
    Assert-SealedFiles $Directory $build.files
    Assert-NativeDistributionTree $Directory
    $build
}
function Write-HubNotices([string]$Project,[string]$Destination) {
    # Preserve installed package license texts, including transitive dependencies.
    # Electron's own LICENSE/Chromium notices already travel in the sealed UI.
    $modules=Join-Path $Project 'node_modules'
    $writer=[IO.StreamWriter]::new($Destination,$false,[Text.UTF8Encoding]::new($false))
    try{
        $writer.WriteLine('Hub web: package.json and frozen bun.lock')
        $writer.WriteLine([IO.File]::ReadAllText((Join-Path $Project 'package.json')))
        $writer.WriteLine([IO.File]::ReadAllText((Join-Path $Project 'bun.lock')))
        $count=0
        foreach($file in Get-ChildItem -LiteralPath $modules -File -Recurse -Force|Where-Object {$_.Name -match '^(LICENSE|LICENCE|COPYING|NOTICE)([._-].*)?$'}|Sort-Object FullName){
            if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'License link rejected'}
            $writer.WriteLine("`n--- $($file.FullName.Substring($modules.Length+1).Replace('\','/')) ---")
            $writer.WriteLine([IO.File]::ReadAllText($file.FullName));$count++
        }
        if(-not $count){throw 'Missing npm license texts'}
    }finally{$writer.Dispose()}
}

function Assert-HubSource([string]$Project) {
    Push-Location $Project
    try{
        & bun --eval 'import { readFileSync } from "node:fs"; import { packageBuild, assertPackageBuild } from "./scripts/package-inventory.ts"; const r=JSON.parse(readFileSync("release/package/package-inventory.json","utf8")); const e=packageBuild(process.cwd()); assertPackageBuild(Object.fromEntries(Object.keys(e).map(k=>[k,r[k]])),e);'
        if($LASTEXITCODE){throw 'Recibo Electron ajeno a las fuentes actuales'}
    }finally{Pop-Location}
}
