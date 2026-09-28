param(
    [Parameter(Mandatory)] [string] $QtRoot,
    [string] $PackageDir = (Join-Path $PSScriptRoot 'out/package-qt-trimmed'),
    [switch] $OmitOpenSSL
)

$ErrorActionPreference = 'Stop'
$qt = (Resolve-Path -LiteralPath $QtRoot).Path
$package = (Resolve-Path -LiteralPath $PackageDir).Path
$deploy = Join-Path $qt 'bin/windeployqt.exe'
$executable = Join-Path $package 'vantare-native-go-qt.exe'
if (-not (Test-Path -LiteralPath $deploy -PathType Leaf)) { throw "Missing windeployqt: $deploy" }
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw "Missing trial executable: $executable" }

$mapping = @(& $deploy --dry-run --list mapping --release --qmldir (Join-Path $PSScriptRoot 'qtquick') --compiler-runtime --no-translations --no-system-dxc-compiler --no-opengl-sw $executable)
if ($LASTEXITCODE -ne 0) { throw "windeployqt dry run failed: $LASTEXITCODE" }
$targets = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$matchedFiles = 0
$omittedOpenSSL = 0
foreach ($line in $mapping) {
    if ($line -notmatch '^"([^"]+)" "([^"]+)"$') { throw "Unexpected windeployqt mapping: $line" }
    $source = $Matches[1]
    $relative = $Matches[2]
    $target = [IO.Path]::GetFullPath((Join-Path $package $relative))
    if (-not $target.StartsWith($package + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Mapping escapes package: $relative"
    }
    if (-not $targets.Add($relative.Replace('/', '\'))) { throw "Duplicate mapped target: $relative" }
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing Qt source: $source" }
    if ($OmitOpenSSL -and $relative -eq 'tls\qopensslbackend.dll') {
        if (Test-Path -LiteralPath $target) { throw 'OpenSSL backend is present despite -OmitOpenSSL' }
        $omittedOpenSSL++
        continue
    }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Missing package file: $relative" }
    if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $target).Hash) {
        throw "Package file differs from Qt source: $relative"
    }
    $matchedFiles++
}

$files = @(Get-ChildItem -LiteralPath $package -File -Recurse)
$extra = @($files | ForEach-Object { $_.FullName.Substring($package.Length + 1) } | Where-Object { -not $targets.Contains($_) })
if ($extra.Count -ne 1 -or $extra[0] -ne 'vantare-native-go-qt.exe') {
    throw "Unexpected files outside windeployqt mapping: $($extra -join ', ')"
}
[pscustomobject]@{
    MappedFiles = $mapping.Count
    ByteIdenticalFiles = $matchedFiles
    OmittedOptionalOpenSSL = $omittedOpenSSL
    PackageFiles = $files.Count
    OnlyExtraFile = $extra[0]
    ExecutableSHA256 = (Get-FileHash -LiteralPath $executable).Hash
}
