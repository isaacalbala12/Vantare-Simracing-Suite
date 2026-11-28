# Repository-only packaging helpers. Never copied into an installed generation.
#requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Assert-BuildPath([string]$Path) {
    if([string]::IsNullOrWhiteSpace($Path)){throw 'Ruta de build obligatoria'}
    $full=[IO.Path]::GetFullPath($Path)
    if($full -eq [IO.Path]::GetPathRoot($full) -or $full.StartsWith('\\')){throw 'Raíz de build inválida'}
    if([IO.DriveInfo]::new([IO.Path]::GetPathRoot($full)).DriveType -eq [IO.DriveType]::Network){throw 'Unidad de red rechazada'}
    for($parent=$full;$parent;$parent=[IO.Path]::GetDirectoryName($parent)){
        if([IO.Path]::GetFileName($parent) -like '.env*'){throw 'Ruta .env rechazada'}
        if(Test-Path -LiteralPath $parent){
            if((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point rechazado'}
        }
    }
    $full
}
function Get-NativeHash([string]$Path) {
    (Get-FileHash -LiteralPath (Assert-BuildPath $Path) -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Write-BuildJson([string]$Path,$Value) {
    [IO.File]::WriteAllText($Path,($Value|ConvertTo-Json -Depth 100),[Text.UTF8Encoding]::new($false))
}
# New-generation tooling limits. Installed clients and their limits are unchanged.
$script:BuildPackageZipLimitBytes = 256MB
$script:BuildPackageExpandedLimitBytes = 768MB
function Assert-BuildPackageCapacity([string]$Archive) {
    $path=Assert-BuildPath $Archive
    if((Get-Item -LiteralPath $path).Length -gt $script:BuildPackageZipLimitBytes){throw 'PACKAGE_ZIP_LIMIT'}
    $zip=[IO.Compression.ZipFile]::OpenRead($path)
    try{
        [long]$expanded=0
        foreach($entry in $zip.Entries){
            if($entry.Length -gt ($script:BuildPackageExpandedLimitBytes - $expanded)){throw 'PACKAGE_EXPANDED_LIMIT'}
            $expanded+=$entry.Length
        }
    }finally{$zip.Dispose()}
}
function Get-BuildCompressionChoice([double]$OptimalSeconds,[double]$SmallestSizeSeconds) {
    if($SmallestSizeSeconds - $OptimalSeconds -lt 120){'SmallestSize'}else{'Optimal'}
}

function New-BuildZip([string]$Directory,[string]$Destination,[ValidateSet('Optimal','SmallestSize')][string]$CompressionLevel=$(if([Enum]::GetNames([IO.Compression.CompressionLevel]) -contains 'SmallestSize'){'SmallestSize'}else{'Optimal'})) {
    $directory=Assert-BuildPath $Directory;$destination=Assert-BuildPath $Destination
    # Resolve before creating the archive: PS 5.1 has no SmallestSize.
    $level=[Enum]::Parse([IO.Compression.CompressionLevel],$CompressionLevel,$true)
    $zip=[IO.Compression.ZipFile]::Open($destination,[IO.Compression.ZipArchiveMode]::Create)
    try{
        foreach($item in Get-ChildItem -LiteralPath $directory -Recurse -Force){
            $null=Assert-BuildPath $item.FullName
            $name=$item.FullName.Substring($directory.Length+1).Replace('\','/')
            if(-not $item.PSIsContainer){$null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$item.FullName,$name,$level)}
        }
    }finally{$zip.Dispose()}
    Assert-BuildPackageCapacity $destination
}
function Test-BuildPackage([string]$Archive,[string]$Version,[string]$Channel,[string]$Verifier) {
    $archive=Assert-BuildPath $Archive
    if(-not $Verifier){
        $native=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
        & pwsh -NoProfile -File (Join-Path $native 'scripts/compilar.ps1') pwsh -NoProfile -File (Join-Path $PSScriptRoot 'verify-build-package.ps1') -Archive $archive -Version $Version -Channel $Channel
        if($LASTEXITCODE){throw 'Falló la verificación Rust dentro del slot'}
        return
    }
    $null=Invoke-BuildProcess $Verifier @($archive,(Get-NativeHash $archive),$Version,$Channel) $null 120000
}
# #2863: margen frente a los topes de stage/Setup. Los topes llegan del verificador
# (constantes de package.rs); aquí no hay copia. Aviso al 90 %, fallo por encima.
function Get-PackageCapacityReport([object]$Capacity,[string]$Name) {
    $fields=@('compressed','compressed_limit','expanded','expanded_limit','largest','largest_limit')
    if((@($Capacity.PSObject.Properties.Name|Sort-Object) -join ',') -cne (@($fields|Sort-Object) -join ',')){throw 'Medidas de capacidad incompatibles'}
    foreach($field in $fields){if(($Capacity.$field -isnot [int] -and $Capacity.$field -isnot [long]) -or $Capacity.$field -lt 0){throw "Medida de capacidad inválida: $field"}}
    $culture=[Globalization.CultureInfo]::GetCultureInfo('es-ES')
    $parts=@();$warnings=@();$failures=@()
    foreach($measure in @(@('ZIP','compressed'),@('expandido','expanded'),@('miembro más grande','largest'))){
        $value=[uint64]$Capacity.($measure[1]);$limit=[uint64]$Capacity.($measure[1]+'_limit')
        if(-not $limit){throw 'Tope de capacidad nulo'}
        $text=[string]::Format($culture,'{0} {1:N1} de {2:N0} MiB ({3:N1} %)',$measure[0],$value/1MB,$limit/1MB,100.0*$value/$limit)
        $parts+=$text
        if($value -gt $limit){$failures+=$text}elseif($value*10 -ge $limit*9){$warnings+=$text}
    }
    [pscustomobject]@{Line="[capacidad] ${Name}: $($parts -join '; ')";Warnings=$warnings;Failures=$failures}
}
function Assert-PackageCapacity([string]$Verifier,[string]$Archive) {
    $archive=Assert-BuildPath $Archive
    if(-not (Test-Path -LiteralPath $archive -PathType Leaf) -or -not $Verifier -or -not (Test-Path -LiteralPath $Verifier -PathType Leaf)){throw 'Gate de capacidad (#2863): falta el paquete o el verificador real'}
    $raw=Invoke-BuildProcess $Verifier @('--capacity',$archive) $null 120000
    $report=Get-PackageCapacityReport ($raw|ConvertFrom-Json) ([IO.Path]::GetFileName($archive))
    $report.Line
    foreach($warning in $report.Warnings){"::warning::Paquete al 90 % o más de un tope de stage: $warning"}
    if($report.Failures.Count){throw "Paquete por encima del tope de stage: $($report.Failures -join '; ')"}
}
function Get-NativeDumpbin {
    $command=Get-Command dumpbin.exe -ErrorAction SilentlyContinue
    if($command){return $command.Source}
    $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    $paths=@(& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find 'VC/Tools/MSVC/**/bin/Hostx64/x64/dumpbin.exe')
    if($LASTEXITCODE -or -not $paths.Count){throw 'Empaquetado requiere dumpbin de MSVC'}
    $paths[0]
}
function Assert-NativeStaticCrt([string]$Path,[string]$Dumpbin) {
    $bytes=[IO.File]::ReadAllBytes((Assert-BuildPath $Path))
    if($bytes.Length -lt 64 -or $bytes[0] -ne 77 -or $bytes[1] -ne 90){throw 'Binario sin cabecera MZ'}
    $offset=[BitConverter]::ToUInt32($bytes,60)
    if($offset -gt $bytes.Length-6 -or [BitConverter]::ToUInt32($bytes,$offset) -ne 0x4550 -or [BitConverter]::ToUInt16($bytes,$offset+4) -ne 0x8664){throw 'Se requiere PE Windows x64'}
    $report=@(& $Dumpbin /NOLOGO /DEPENDENTS $Path)
    if($LASTEXITCODE){throw 'No se pudieron inspeccionar los imports'}
    $dlls=@($report|ForEach-Object{if($_ -match '^\s+([A-Za-z0-9_.-]+\.dll)\s*$'){$matches[1]}})
    if(-not $dlls.Count -or @($dlls|Where-Object{$_ -match '^(vcruntime|msvcp[0-9]|msvcr[0-9]|concrt[0-9]|ucrtbase|api-ms-win-crt-)'}).Count){throw 'CRT dinámico o inventario vacío'}
}
function Invoke-BuildProcess([string]$Executable,[string[]]$Arguments,[string]$InputText,[int]$TimeoutMilliseconds=30000) {
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Assert-BuildPath $Executable
    $info.Arguments=(@($Arguments|ForEach-Object {'"'+[regex]::Replace([regex]::Replace($_,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')+'"'}) -join ' ')
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $info.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
    $process=[Diagnostics.Process]::new();$process.StartInfo=$info
    $started=$false
    try{
        if(-not $process.Start()){throw 'No se pudo iniciar el verificador'}
        $started=$true
        $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
        $watch=[Diagnostics.Stopwatch]::StartNew()
        if($null -ne $InputText){
            $bytes=[Text.UTF8Encoding]::new($false).GetBytes($InputText)
            $write=$process.StandardInput.BaseStream.WriteAsync($bytes,0,$bytes.Length)
            if(-not $write.Wait([Math]::Max(0,$TimeoutMilliseconds-[int]$watch.ElapsedMilliseconds))){throw 'Proceso agotó el plazo al recibir stdin'}
            $null=$write.GetAwaiter().GetResult()
        }
        $process.StandardInput.Close()
        if(-not $process.WaitForExit([Math]::Max(0,$TimeoutMilliseconds-[int]$watch.ElapsedMilliseconds))){throw 'Proceso agotó el plazo'}
        if($process.ExitCode){throw "Proceso rechazó la petición: $($stderr.GetAwaiter().GetResult())"}
        $stdout.GetAwaiter().GetResult()
    }finally{
        if($started -and -not $process.HasExited){$process.Kill();$process.WaitForExit()}
        $process.Dispose()
    }
}

function Assert-BetaManifest([object]$Manifest) {
    $fields=@($Manifest.PSObject.Properties.Name|Sort-Object)
    $expected=@('channel','notes','product','schema','sha256','url','version')
    if(($fields -join ',') -cne ($expected -join ',')){throw 'Campos del manifiesto beta inválidos'}
    if(($Manifest.schema -isnot [int] -and $Manifest.schema -isnot [long]) -or $Manifest.schema -ne 1 -or $Manifest.product -cne 'vantare-native' -or $Manifest.channel -cne 'beta'){throw 'Manifiesto beta incompatible'}
    if($Manifest.version -isnot [string] -or $Manifest.version -cnotmatch '^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\z'){throw 'Versión beta inválida'}
    if(@($Manifest.version.Split('.')|Where-Object {[int]$_ -gt 65535}).Count){throw 'Versión beta fuera de rango'}
    if($Manifest.sha256 -isnot [string] -or $Manifest.sha256 -cnotmatch '^[0-9a-f]{64}\z'){throw 'SHA beta inválido'}
    if($Manifest.notes -isnot [string] -or [Text.Encoding]::UTF8.GetByteCount($Manifest.notes) -gt 8192){throw 'Notas beta inválidas'}
    if($Manifest.url -isnot [string] -or $Manifest.url -cnotmatch '^https://github\.com/isaacalbala12/Vantare-Downloads/releases/download/native-beta-v([0-9]+\.[0-9]+\.[0-9]+)/vantare-native-amd64-package\.zip\z' -or $Matches[1] -cne $Manifest.version){throw 'URL beta inválida'}
}

function Assert-PublishArtifacts([string]$OutputDirectory) {
    foreach($name in @('VantareSetup.exe','vantare-native-amd64-package.zip')){
        $artifact=Join-Path $OutputDirectory $name
        if(-not (Test-Path -LiteralPath $artifact -PathType Leaf) -or -not (Test-Path -LiteralPath "$artifact.sha256" -PathType Leaf)){throw "Artefacto o sidecar ausente: $name"}
        $expected="$(Get-NativeHash $artifact)  $name"
        if(([IO.File]::ReadAllText("$artifact.sha256")).Trim() -cne $expected){throw "Sidecar incompatible: $name"}
    }
}

# Scope only the isolated Rune phase, never the host's Cargo configuration.
function Invoke-RuneCargoHome([string]$Directory,[scriptblock]$Action) {
    $runeHome=Assert-BuildPath $Directory
    if([IO.Path]::GetPathRoot($runeHome) -ine 'D:\'){throw 'CARGO_HOME de Rune exige una ruta propia en D:'}
    $previousCargoHome=$env:CARGO_HOME
    $hadCargoHome=Test-Path Env:CARGO_HOME
    $hostCargoHome=if($previousCargoHome){$previousCargoHome}else{Join-Path $env:USERPROFILE '.cargo'}
    if($runeHome.TrimEnd('\') -ieq [IO.Path]::GetFullPath($hostCargoHome).TrimEnd('\')){throw 'Rune no puede usar CARGO_HOME del host'}
    foreach($name in @('config','config.toml')) {
        if(Test-Path -LiteralPath (Join-Path $runeHome $name)){throw 'CARGO_HOME de Rune debe estar libre de config/config.toml'}
    }
    [IO.Directory]::CreateDirectory($runeHome)|Out-Null
    try{
        $env:CARGO_HOME=$runeHome
        & $Action
    }finally{
        if($hadCargoHome){$env:CARGO_HOME=$previousCargoHome}
        else{Remove-Item -LiteralPath Env:CARGO_HOME -ErrorAction SilentlyContinue}
    }
}
function Assert-RuneNoSubmodules([string]$CargoHome) {
    $checkouts=Join-Path (Assert-BuildPath $CargoHome) 'git/checkouts'
    if(Test-Path -LiteralPath $checkouts){
        if(@(Get-ChildItem -LiteralPath $checkouts -Filter '.gitmodules' -File -Force -Recurse -ErrorAction Stop).Count){throw 'Rune: submodulos Git no permitidos (.gitmodules en CARGO_HOME propio)'}
    }
}

# Only Rune is built outside the main Cargo workspace; it is still a public image.
function Assert-PublicExternalBins([object]$Inventory) {
    $property=$Inventory.PSObject.Properties['external_bins']
    if(-not $property -or $property.Value -isnot [array]){throw 'external_bins debe ser una lista'}
    $external=@($property.Value)
    if(@($external|Sort-Object -Unique).Count -ne $external.Count){throw 'external_bins duplicados'}
    foreach($name in $external){
        if($name -isnot [string] -or $name -cne 'vantare-overlays-rune.exe' -or $name -cnotin $Inventory.executables){throw 'Binario externo no autorizado'}
        if((Get-PublicArtifact $name $Inventory) -cne $name){throw 'Override de binario externo rechazado'}
    }
    if('vantare-overlays-rune.exe' -cin $Inventory.executables -and 'vantare-overlays-rune.exe' -cnotin $external){throw 'Rune exige external_bins'}
    $external
}
function Assert-RuneLock([string]$Path,[string]$ExpectedHash) {
    $hash=Get-NativeHash $Path
    if($ExpectedHash -and $hash -cne $ExpectedHash){throw 'Cargo.lock de Rune cambió'}
    & python (Join-Path $PSScriptRoot 'rune-lock.py') $Path
    if($LASTEXITCODE){throw 'Fuentes de Cargo.lock de Rune rechazadas'}
    if((Get-NativeHash $Path) -cne $hash){throw 'Cargo.lock de Rune cambió durante la validación'}
    $hash
}

function Assert-PublicInventory([string]$Payload,[object]$Inventory,$HubFiles=@()) {
    $null=Assert-PublicExternalBins $Inventory
    $listed=@($Inventory.executables)
    foreach($name in $listed){$null=Get-PublicArtifact $name $Inventory}
    if($Inventory.schema -ne 1 -or -not $listed.Count -or @($listed|Where-Object {$_ -cnotmatch '^vantare(?:-[a-z0-9]+)*\.exe$'}).Count -or @($listed|Sort-Object -Unique).Count -ne $listed.Count){throw 'Inventario público inválido'}
    if(@($Inventory.resources|Where-Object {$_ -cmatch '(^|/)\.\.?(/|$)' -or $_ -cmatch '^/' -or $_ -cmatch '\\|:' -or $_ -cmatch '^(layouts|telemetry-real)/'}).Count){throw 'Ruta de recurso inválida'}
    foreach($required in @('standings-design-system.sequence.json','session-alerts.snapshot.json')){
        if($required -cnotin $Inventory.resources){throw "Recurso obligatorio ausente: $required"}
    }
    $expected=@('README.md','licenses/OFL-Inter.txt','dependencies.json','licenses/hub-web-notices.txt')
    $expected+=@($listed|ForEach-Object {"bin/$_";"bin/$_.sha256"})
    $expected+=@($Inventory.resources|ForEach-Object {"bin/fixtures/$_"})
    if(@($HubFiles).Count){
        Assert-SealedFiles (Join-Path $Payload 'hub-ui') $HubFiles
        $expected+=@($HubFiles|ForEach-Object {'hub-ui/'+$_.path})
    }
    $actual=@(Get-ChildItem -LiteralPath $Payload -Force -Recurse|ForEach-Object {
        $null=Assert-BuildPath $_.FullName
        if(-not $_.PSIsContainer){$_.FullName.Substring($Payload.Length+1).Replace('\','/')}
    })
    if((@($expected|Sort-Object -CaseSensitive) -join "`n") -cne (@($actual|Sort-Object -CaseSensitive) -join "`n")){throw 'Inventario público incompatible'}
    foreach($exe in $listed){Assert-ExecutableSidecar (Join-Path $Payload "bin/$exe")}
}

function Get-PublicArtifact([string]$Name,[object]$Inventory) {
    $overrides=$Inventory.PSObject.Properties['artifact_overrides']
    if($overrides){
        foreach($entry in $overrides.Value.PSObject.Properties){
            if($entry.Name -cnotmatch '^vantare(-[a-z0-9]+)*\.exe\z' -or $entry.Name -cnotin $Inventory.executables -or $entry.Value -isnot [string] -or $entry.Value -cnotmatch '^vantare(-[a-z0-9]+)*\.exe\z'){throw 'Override de artefacto inválido'}
        }
    }
    $override=if($overrides){$overrides.Value.PSObject.Properties[$Name]}else{$null}
    $artifact=if($override){$override.Value}else{$Name}
    if($Name -ieq 'vantare-qa-license.exe' -or $artifact -ieq 'vantare-qa-license.exe'){throw 'QA license binary in public inventory.'}
    $artifact
}
function Assert-PublicBins([string[]]$Available,[object]$Inventory) {
    $external=@(Assert-PublicExternalBins $Inventory)
    $public=@($Inventory.executables|Where-Object {$_ -cnotin $external}|ForEach-Object {[IO.Path]::GetFileNameWithoutExtension((Get-PublicArtifact $_ $Inventory))})
    $internal=@('vantare-admin','vantare-setup','vantare-uninstall','vantare-grabar-lmu-completo','vantare-verificar-lmu','vantare-workshop','root-launch-probe','vantare-hub','vantare-qa-license')
    if(@($public|Where-Object {$_ -cnotin $Available}).Count -or @($Available|Where-Object {$_ -cnotin $public -and $_ -cnotin $internal}).Count){throw 'Binarios públicos incompatibles'}
}

. (Join-Path $PSScriptRoot 'hub-package-tooling.ps1')

. (Join-Path $PSScriptRoot 'hub-feed-tooling.ps1')
