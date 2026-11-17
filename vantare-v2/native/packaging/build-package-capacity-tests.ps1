# Tooling capacity and compression policy; inert ZIP fixtures only.
#requires -Version 5.1
param([Parameter(Mandatory)][string]$QaRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
. (Join-Path $PSScriptRoot 'matrix/guard.ps1')
$qa=Assert-MatrixRoot $QaRoot
$root=Join-Path $qa ('capacity-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$archive=Join-Path $root 'small.zip'
$zip=[IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Create)
try{foreach($name in @('a','b','c')){$null=$zip.CreateEntry($name)}}finally{$zip.Dispose()}
Assert-BuildPackageCapacity $archive
# Reject a physical compressed-size excess before attempting to parse the ZIP.
$large=Join-Path $root 'over-compressed.zip'
$stream=[IO.File]::Create($large)
try{$stream.SetLength(256MB+1)}finally{$stream.Dispose()}
try{
    $rejected=$false
    try{Assert-BuildPackageCapacity $large}catch{if($_.Exception.Message -cne 'PACKAGE_ZIP_LIMIT'){throw};$rejected=$true}
    if(-not $rejected){throw 'Compressed excess accepted'}
}finally{[IO.File]::Delete($large)}
# Declared expanded lengths: inclusive 768 MiB, then one extra byte.
# No large payload is inflated; the Rust verifier remains the integrity authority.
$bytes=[IO.File]::ReadAllBytes($archive)
$positions=@()
for($i=0;$i -le $bytes.Length-46;$i++){
    if([BitConverter]::ToUInt32($bytes,$i) -eq 0x02014b50){$positions+=$i}
}
if($positions.Count -ne 3){throw 'ZIP fixture directory wrong'}
foreach($position in $positions){[Array]::Copy([BitConverter]::GetBytes([uint32]256MB),0,$bytes,$position+24,4)}
$boundary=Join-Path $root 'expanded-boundary.zip'
[IO.File]::WriteAllBytes($boundary,$bytes)
Assert-BuildPackageCapacity $boundary
[Array]::Copy([BitConverter]::GetBytes([uint32](256MB+1)),0,$bytes,$positions[-1]+24,4)
$over=Join-Path $root 'over-expanded.zip'
[IO.File]::WriteAllBytes($over,$bytes)
$rejected=$false
try{Assert-BuildPackageCapacity $over}catch{if($_.Exception.Message -cne 'PACKAGE_EXPANDED_LIMIT'){throw};$rejected=$true}
if(-not $rejected){throw 'Expanded excess accepted'}
foreach($case in @(@(10,129.999,'SmallestSize'),@(10,130,'Optimal'),@(10,131,'Optimal'),@(20,10,'SmallestSize'))){
    if((Get-BuildCompressionChoice $case[0] $case[1]) -cne $case[2]){throw 'Two-minute compression policy wrong'}
}
'PASS capacity: compressed >256 MiB rejected; declared expanded 768 MiB accepted, +1 rejected; strict two-minute compression policy.'
