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
function New-BuildZip([string]$Directory,[string]$Destination) {
    $directory=Assert-BuildPath $Directory;$destination=Assert-BuildPath $Destination
    $zip=[IO.Compression.ZipFile]::Open($destination,[IO.Compression.ZipArchiveMode]::Create)
    try{
        foreach($item in Get-ChildItem -LiteralPath $directory -Recurse -Force){
            $null=Assert-BuildPath $item.FullName
            $name=$item.FullName.Substring($directory.Length+1).Replace('\','/')
            if(-not $item.PSIsContainer){$null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$item.FullName,$name)}
            elseif(-not @(Get-ChildItem -LiteralPath $item.FullName -Force).Count){$null=$zip.CreateEntry("$name/")}
        }
    }finally{$zip.Dispose()}
}
function Test-BuildPackage([string]$Archive,[string]$Version,[string]$Channel) {
    $archive=Assert-BuildPath $Archive
    $zip=[IO.Compression.ZipFile]::OpenRead($archive)
    try{
        $entries=@($zip.Entries|Where-Object {-not $_.FullName.EndsWith('/')})
        $manifestEntry=@($entries|Where-Object {$_.FullName -ceq 'manifest.json'})
        if($manifestEntry.Count -ne 1 -or $manifestEntry[0].Length -gt 65536){throw 'Manifiesto de paquete inválido'}
        $reader=[IO.StreamReader]::new($manifestEntry[0].Open(),[Text.UTF8Encoding]::new($false))
        try{$manifest=$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}
        if($manifest.schema -ne 1 -or $manifest.product -cne 'vantare-native' -or $manifest.version -cne $Version -or $manifest.channel -cne $Channel -or $manifest.engine -ne 2){throw 'Versión o canal del paquete incompatibles'}
        $names=@($entries|ForEach-Object {$_.FullName})
        $expected=@($manifest.files|ForEach-Object {$_.path})+@('manifest.json')
        if(@(Compare-Object $names $expected -CaseSensitive).Count -or @($names|Group-Object|Where-Object Count -gt 1).Count){throw 'Inventario del ZIP incompatible'}
        foreach($member in $manifest.files){
            $entry=@($entries|Where-Object {$_.FullName -ceq $member.path})[0]
            if($entry.Length -ne $member.size){throw "Tamaño inválido: $($member.path)"}
            $sha=[Security.Cryptography.SHA256]::Create()
            $stream=$entry.Open()
            try{$actual=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$sha.Dispose()}
            if($actual -cne $member.sha256){throw "Hash inválido: $($member.path)"}
        }
        $manifest
    }finally{$zip.Dispose()}
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
    if($Manifest.version -isnot [string] -or $Manifest.version -cnotmatch '^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})$'){throw 'Versión beta inválida'}
    if(@($Manifest.version.Split('.')|Where-Object {[int]$_ -gt 65535}).Count){throw 'Versión beta fuera de rango'}
    if($Manifest.sha256 -isnot [string] -or $Manifest.sha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'SHA beta inválido'}
    if($Manifest.notes -isnot [string] -or [Text.Encoding]::UTF8.GetByteCount($Manifest.notes) -gt 8192){throw 'Notas beta inválidas'}
    if($Manifest.url -isnot [string] -or $Manifest.url -cnotmatch '^https://github\.com/isaacalbala12/Vantare-Downloads/releases/download/native-beta-v([0-9]+\.[0-9]+\.[0-9]+)/vantare-native-amd64-package\.zip$' -or $Matches[1] -cne $Manifest.version){throw 'URL beta inválida'}
}

function Assert-PublishArtifacts([string]$OutputDirectory) {
    foreach($name in @('VantareSetup.exe','vantare-native-amd64-package.zip')){
        $artifact=Join-Path $OutputDirectory $name
        if(-not (Test-Path -LiteralPath $artifact -PathType Leaf) -or -not (Test-Path -LiteralPath "$artifact.sha256" -PathType Leaf)){throw "Artefacto o sidecar ausente: $name"}
        $expected="$(Get-NativeHash $artifact)  $name"
        if(([IO.File]::ReadAllText("$artifact.sha256")).Trim() -cne $expected){throw "Sidecar incompatible: $name"}
    }
}

function Assert-PublicInventory([string]$Payload,[object]$Inventory) {
    $public=@('vantare.exe','vantare-core.exe','vantare-overlays.exe','vantare-hub.exe','vantare-engineer.exe','vantare-services.exe','vantare-storage.exe','vantare-grabar-lmu.exe','vantare-grabar-acc.exe','vantare-import-profile.exe')
    $listed=@($Inventory.executables|Sort-Object -CaseSensitive)
    $approved=@($public|Sort-Object -CaseSensitive)
    if($Inventory.schema -ne 1 -or [string]::Join("`n",$listed) -cne [string]::Join("`n",$approved)){throw 'Inventario público inválido'}
    if(@($Inventory.resources|Where-Object {$_ -cmatch '(^|/)\.\.?(/|$)' -or $_ -cmatch '^/' -or $_ -cmatch '\\' -or $_ -cmatch '^(layouts|telemetry-real)/'}).Count){throw 'Ruta de recurso inválida'}
    foreach($required in @('standings-design-system.sequence.json','session-alerts.snapshot.json')){
        if($required -cnotin $Inventory.resources){throw "Recurso obligatorio ausente: $required"}
    }
    $expected=@('README.md','licenses/OFL-Inter.txt','dependencies.json')
    $expected+=@($Inventory.executables|ForEach-Object {"bin/$_";"bin/$_.sha256"})
    $expected+=@($Inventory.resources|ForEach-Object {"bin/fixtures/$_"})
    $actual=@(Get-ChildItem -LiteralPath $Payload -File -Recurse|ForEach-Object {$_.FullName.Substring($Payload.Length+1).Replace('\','/')})
    $expected=@($expected|Sort-Object -CaseSensitive)
    $actual=@($actual|Sort-Object -CaseSensitive)
    if([string]::Join("`n",$expected) -cne [string]::Join("`n",$actual)){throw 'Inventario público incompatible'}
}

function Assert-PublicBins([string[]]$Available,[object]$Inventory) {
    $public=@($Inventory.executables|ForEach-Object {[IO.Path]::GetFileNameWithoutExtension($_)})
    $internal=@('vantare-admin','vantare-setup','vantare-uninstall','vantare-grabar-lmu-completo','vantare-verificar-lmu','vantare-workshop')
    if(@($public|Where-Object {$_ -cnotin $Available}).Count -or @($Available|Where-Object {$_ -cnotin $public -and $_ -cnotin $internal}).Count){throw 'Binarios públicos incompatibles'}
}
