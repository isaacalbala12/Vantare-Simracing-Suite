[CmdletBinding()]
param(
    [string]$BuildDirectory = (Join-Path $PSScriptRoot ("build-validation-{0}" -f $PID)),
    [switch]$BuildOnly
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$build = [IO.Path]::GetFullPath($BuildDirectory)
if (-not $build.StartsWith($source + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "BuildDirectory must stay inside the qtquick-redline candidate: $build"
}
if (Test-Path -LiteralPath $build) {
    throw "Fresh build required; directory already exists: $build"
}

$qtCandidates = @()
if ($env:VANTARE_QT_ROOT) {
    $qtCandidates += $env:VANTARE_QT_ROOT
}
$sdkRoot = 'C:\tmp\isa370-tools\qt\sdk'
if (Test-Path -LiteralPath $sdkRoot) {
    $qtCandidates += Get-ChildItem -LiteralPath $sdkRoot -Directory |
        ForEach-Object { Join-Path $_.FullName 'msvc2022_64' }
}
$qmake = Get-Command qmake.exe -ErrorAction SilentlyContinue
if ($qmake) {
    $qtCandidates += Split-Path -Parent (Split-Path -Parent $qmake.Source)
}
$qt = $qtCandidates |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'lib\cmake\Qt6\Qt6Config.cmake') } |
    Sort-Object -Descending -Unique |
    Select-Object -First 1
if (-not $qt) {
    throw 'Qt 6 MSVC SDK not found. Set VANTARE_QT_ROOT or install it under C:\tmp\isa370-tools\qt\sdk.'
}

function Invoke-Native {
    param([Parameter(Mandatory)][string]$FilePath, [Parameter(Mandatory)][string[]]$ArgumentList)
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath failed with exit code $LASTEXITCODE"
    }
}

$env:PATH = "$(Join-Path $qt 'bin');$env:PATH"
Invoke-Native -FilePath cmake.exe -ArgumentList @('-S', $source, '-B', $build, '-G', 'Visual Studio 17 2022', '-A', 'x64', "-DCMAKE_PREFIX_PATH=$qt", '-DBUILD_TESTING=ON')
Invoke-Native -FilePath cmake.exe -ArgumentList @('--build', $build, '--config', 'Release', '--parallel')
if ($BuildOnly) {
    Write-Output "qt=$qt"
    Write-Output "build=$build"
    Write-Output 'build-only=PASS'
    return
}
Invoke-Native -FilePath ctest.exe -ArgumentList @('--test-dir', $build, '-C', 'Release', '--output-on-failure')
$qmlFiles = @(
    (Join-Path $source 'Main.qml')
) + @(Get-ChildItem -LiteralPath (Join-Path $source 'qml') -Recurse -Filter '*.qml' |
    Sort-Object FullName |
    Select-Object -ExpandProperty FullName)
Invoke-Native -FilePath (Join-Path $qt 'bin\qmllint.exe') -ArgumentList (@(
    '-I', (Join-Path $qt 'qml'), '--max-warnings', '0'
) + $qmlFiles)

$portableReplay = Join-Path $build 'Release\replay\redline-viewmodels-v1.jsonl'
$portableManifest = Join-Path $build 'Release\replay\redline-viewmodels-v1.manifest.json'
if (-not (Test-Path -LiteralPath $portableReplay) -or -not (Test-Path -LiteralPath $portableManifest)) {
    throw 'Portable replay custody files are missing beside the executables.'
}
$fontSource = Join-Path $source 'assets\fonts\barlow-semi-condensed'
$fontPackage = Join-Path $build 'Release\fonts'
foreach ($fontFile in @(
    'BarlowSemiCondensed-Regular.ttf',
    'BarlowSemiCondensed-SemiBold.ttf',
    'BarlowSemiCondensed-Bold.ttf',
    'BarlowSemiCondensed-ExtraBold.ttf',
    'OFL.txt'
)) {
    $sourceFont = Join-Path $fontSource $fontFile
    $packagedFont = Join-Path $fontPackage $fontFile
    if (-not (Test-Path -LiteralPath $packagedFont -PathType Leaf)) {
        throw "Portable font asset is missing beside the executables: $fontFile"
    }
    if ((Get-FileHash -LiteralPath $sourceFont -Algorithm SHA256).Hash -ne
        (Get-FileHash -LiteralPath $packagedFont -Algorithm SHA256).Hash) {
        throw "Portable font asset differs from its licensed source: $fontFile"
    }
}
Write-Output "qt=$qt"
Write-Output "build=$build"
Write-Output 'portable-replay-smoke=PASS (headless CTest loaded all 15 packaged scenes)'
Write-Output 'portable-font-smoke=PASS (four Barlow Semi Condensed weights + OFL exact)'
