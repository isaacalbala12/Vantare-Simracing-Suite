[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [Parameter(Mandatory = $true)][string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
# Nightly.14 published portable. This pins bytes, not a mutable release name.
$expectedHash = 'a931be3ad57a5442c4a64ae3b2c52431df3b9fdeb92248dd2d237f18362f010f'
if ((Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedHash) {
    throw 'Approved runtime archive checksum mismatch'
}
$output = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw 'Runtime extraction requires an absent destination' }
$members = @('duckdb.dll', 'manifest.json', 'sbom.spdx.json', 'THIRD_PARTY_NOTICES.md', 'vantare-telemetry-reader.exe')
$prefix = 'runtime\telemetry\duckdb-v1\'
$archive = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($ArchivePath))
try {
    $entries = @($archive.Entries | Where-Object { $_.FullName.StartsWith($prefix, [StringComparison]::Ordinal) -and $_.Name })
    if ($entries.Count -ne $members.Count) { throw 'Unexpected approved runtime member count' }
    foreach ($name in $members) {
        $matches = @($entries | Where-Object { $_.FullName -ceq ($prefix + $name) })
        if ($matches.Count -ne 1) { throw "Missing or duplicate runtime member: $name" }
    }
    New-Item -ItemType Directory -Path $output | Out-Null
    foreach ($name in $members) {
        $entry = $entries | Where-Object { $_.FullName -ceq ($prefix + $name) }
        # Only the five exact names above are extracted; never arbitrary ZIP paths.
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $output $name), $false)
    }
} finally {
    $archive.Dispose()
}
