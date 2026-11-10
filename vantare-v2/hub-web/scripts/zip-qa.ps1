param([Parameter(Mandatory)][string]$Root)
$ErrorActionPreference='Stop'
$candidate=[IO.Path]::GetFullPath($Root)
$qa=[IO.Path]::GetFullPath($env:VANTARE_HUB_QA_ROOT)
$prefix=$qa.TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
if(-not $candidate.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Candidate must be inside QA root'}
if(-not (Test-Path -LiteralPath (Join-Path $candidate 'QA-ONLY.txt'))){throw 'QA marker missing'}
[IO.Compression.ZipFile]::CreateFromDirectory($candidate,$candidate+'.zip',[IO.Compression.CompressionLevel]::Optimal,$false)
