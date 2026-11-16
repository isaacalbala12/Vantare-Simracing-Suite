# Repository-only measurement. Never installs or launches the package.
#requires -Version 7.0
param(
    [Parameter(Mandatory)][string]$PackageDirectory,
    [Parameter(Mandatory)][string]$BaselineZip,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$BaselineSha256,
    [Parameter(Mandatory)][string]$OutputDirectory
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
. (Join-Path $PSScriptRoot 'matrix/guard.ps1')
$source=Assert-BuildPath $PackageDirectory
$baseline=Assert-BuildPath $BaselineZip
$output=Assert-MatrixRoot $OutputDirectory
$sourcePrefix=$source.TrimEnd('\')+'\'
$outputPrefix=$output.TrimEnd('\')+'\'
if($output -ieq $source -or $output.StartsWith($sourcePrefix,[StringComparison]::OrdinalIgnoreCase) -or $source.StartsWith($outputPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Source and output must be separate'}
if($baseline.StartsWith($sourcePrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Baseline ZIP must be outside source'}
if((Get-NativeHash $baseline) -ine $BaselineSha256){throw 'Baseline SHA mismatch'}
if(Test-Path -LiteralPath $output){throw 'Measurement needs a new output directory'}
$level=[Enum]::Parse([IO.Compression.CompressionLevel],'SmallestSize')
function Get-PackageFiles([string]$Directory){
    @(Get-ChildItem -LiteralPath $Directory -Recurse -Force | Sort-Object FullName | ForEach-Object {
        $path=Assert-BuildPath $_.FullName
        if(-not $_.PSIsContainer){
            $relative=$path.Substring($Directory.Length+1).Replace('\','/')
            [pscustomobject]@{path=$relative;size=$_.Length;sha256=(Get-NativeHash $path);map=$relative.EndsWith('.map',[StringComparison]::OrdinalIgnoreCase);extraLocale=($relative -match '^locales/[^/]+\.pak$' -and $relative -notin @('locales/es.pak','locales/en-US.pak'))}
        }
    })
}
$files=@(Get-PackageFiles $source)
$kept=@($files | Where-Object {-not $_.map -and -not $_.extraLocale})
foreach($required in @('vantare-hub-ui.exe','resources/app.asar','locales/es.pak','locales/en-US.pak')){
    if($required -cnotin $kept.path){throw "Missing required package member: $required"}
}
# ASAR is a Pickle header + raw members. Gzip is not an accepted ASAR header.
$asar=Join-Path $source 'resources/app.asar'
$readStream=[IO.File]::OpenRead($asar);$reader=[IO.BinaryReader]::new($readStream)
try{
    if($reader.ReadUInt32() -ne 4){throw 'Unsupported ASAR header'}
    $headerSize=$reader.ReadUInt32();$null=$reader.ReadUInt32();$jsonSize=$reader.ReadUInt32()
    if($jsonSize -gt 1MB -or $headerSize -lt 8 -or $jsonSize -gt $headerSize-8 -or 16+$jsonSize -gt $readStream.Length){throw 'Invalid ASAR header size'}
    $header=[Text.Encoding]::UTF8.GetString($reader.ReadBytes($jsonSize))|ConvertFrom-Json
    if(-not $header.PSObject.Properties['files']){throw 'ASAR files missing'}
}finally{$reader.Dispose();$readStream.Dispose()}
function Get-AsarMapCount($Node){
    $count=0
    $members=$Node.PSObject.Properties['files']
    if($members){foreach($entry in $members.Value.PSObject.Properties){
        if($entry.Value.PSObject.Properties['files']){$count+=Get-AsarMapCount $entry.Value}
        elseif($entry.Name.EndsWith('.map',[StringComparison]::OrdinalIgnoreCase)){$count++}
    }}
    $count
}
$embeddedMaps=Get-AsarMapCount $header
[IO.Directory]::CreateDirectory($output)|Out-Null
# Avoid a second 300+ MiB tree when the real package is already pruned.
$stage=$source
if($kept.Count -ne $files.Count){
    $stage=Join-Path $output 'pruned'
    foreach($file in $kept){
        $target=Join-Path $stage $file.path
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
        [IO.File]::Copy((Join-Path $source $file.path),$target,$false)
    }
}
$reduced=Join-Path $output 'reduced.zip'
New-BuildZip $stage $reduced -CompressionLevel 'SmallestSize'
$gzipPath=Join-Path $output 'app.asar.gz'
$readStream=[IO.File]::OpenRead($asar);$destination=[IO.File]::Open($gzipPath,[IO.FileMode]::CreateNew)
$gzip=[IO.Compression.GZipStream]::new($destination,$level)
try{$readStream.CopyTo($gzip)}finally{$gzip.Dispose();$destination.Dispose();$readStream.Dispose()}
$readStream=[IO.File]::OpenRead($gzipPath);$reader=[IO.BinaryReader]::new($readStream)
try{$gzipHeaderValid=$reader.ReadUInt32() -eq 4}finally{$reader.Dispose();$readStream.Dispose()}
$readStream=[IO.File]::OpenRead($gzipPath);$gzip=[IO.Compression.GZipStream]::new($readStream,[IO.Compression.CompressionMode]::Decompress);$sha=[Security.Cryptography.SHA256]::Create()
try{$roundTrip=[BitConverter]::ToString($sha.ComputeHash($gzip)).Replace('-','').ToLowerInvariant() -ceq ($files|Where-Object {$_.path -ceq 'resources/app.asar'}).sha256}
finally{$sha.Dispose();$gzip.Dispose();$readStream.Dispose()}
if(-not $roundTrip){throw 'Gzip trial lost ASAR bytes'}
$after=@(Get-PackageFiles $source)
if(($files|ConvertTo-Json -Depth 4 -Compress) -cne ($after|ConvertTo-Json -Depth 4 -Compress)){throw 'Source changed during measurement'}
$result=[ordered]@{
    package='electron-only';compression='SmallestSize';sourceUnchanged=$true
    beforeBytes=[long](($files|Measure-Object size -Sum).Sum);afterBytes=[long](($kept|Measure-Object size -Sum).Sum)
    beforeZipBytes=(Get-Item -LiteralPath $baseline).Length;afterZipBytes=(Get-Item -LiteralPath $reduced).Length
    beforeZipSha256=$BaselineSha256.ToLowerInvariant();afterZipSha256=(Get-NativeHash $reduced)
    removedMaps=@($files|Where-Object {$_.map}).Count;removedLocales=@($files|Where-Object {$_.extraLocale}).Count;embeddedMaps=$embeddedMaps
    asarBytes=(Get-Item -LiteralPath $asar).Length;asarGzipBytes=(Get-Item -LiteralPath $gzipPath).Length
    asarGzipHeaderValid=$gzipHeaderValid;asarGzipRoundTrip=$roundTrip;asarCompressionApplied=$false
    exceedsOld128MiB=(Get-Item -LiteralPath $reduced).Length -gt 128MB;graphicsExecuted=$false
}
Write-BuildJson (Join-Path $output 'measurement.json') $result
$result|ConvertTo-Json
