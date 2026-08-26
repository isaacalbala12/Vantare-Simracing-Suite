[CmdletBinding()]
param([string]$GccBin = "C:\msys64\ucrt64\bin")

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$flagScript = Join-Path $repoRoot "build\windows\telemetry-reader\cgo-flags.ps1"
if (-not (Test-Path -LiteralPath $flagScript -PathType Leaf)) {
    throw "Missing production CGO flag builder: $flagScript"
}
. $flagScript

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("vantare cgo flags " + [guid]::NewGuid().ToString("N"))
$includeDirectory = Join-Path $tempRoot "include directory"
$libraryDirectory = Join-Path $tempRoot "library directory"
$moduleDirectory = Join-Path $tempRoot "module source"
$output = Join-Path $tempRoot "output binary.exe"

function Write-TestUtf8 {
    param([string]$Path, [string]$Value)
    [System.IO.File]::WriteAllText($Path, $Value, [System.Text.UTF8Encoding]::new($false))
}

$oldCGO = $env:CGO_ENABLED
$oldPath = $env:PATH
$oldCFlags = $env:CGO_CFLAGS
$oldCXXFlags = $env:CGO_CXXFLAGS
$oldLDFlags = $env:CGO_LDFLAGS
try {
    if (-not (Test-Path -LiteralPath (Join-Path $GccBin "gcc.exe") -PathType Leaf)) {
        throw "GCC fixture compiler not found at $GccBin."
    }
    New-Item -ItemType Directory -Force -Path $includeDirectory, $libraryDirectory, $moduleDirectory | Out-Null
    Write-TestUtf8 (Join-Path $includeDirectory "fixture.h") "int fixture_value(void);`n"
    Write-TestUtf8 (Join-Path $moduleDirectory "fixture.cc") "extern `"C`" int fixture_value(void) { return 7; }`n"
    Write-TestUtf8 (Join-Path $moduleDirectory "go.mod") "module example.com/vantare/cgoflagtest`n`ngo 1.25.0`n"
    Write-TestUtf8 (Join-Path $moduleDirectory "main.go") @'
package main

/*
#include "fixture.h"
*/
import "C"

func main() {
	if C.fixture_value() != 7 {
		panic("unexpected C++ fixture value")
	}
}
'@
    $env:CGO_ENABLED = "1"
    $env:PATH = "$GccBin;$oldPath"
    $env:CGO_CFLAGS = New-CgoIncludeFlags -Directory $includeDirectory
    $env:CGO_CXXFLAGS = New-CgoIncludeFlags -Directory $includeDirectory
    $env:CGO_LDFLAGS = New-CgoLinkerFlags -Directory $libraryDirectory -LibraryName ""
    Push-Location $moduleDirectory
    try {
        & go build -trimpath -buildvcs=false -o $output .
        if ($LASTEXITCODE -ne 0) { throw "Go/GCC rejected quoted CGO flags for paths containing spaces." }
    } finally {
        Pop-Location
    }
    if (-not (Test-Path -LiteralPath $output -PathType Leaf)) {
        throw "CGO parser regression did not produce the fixture executable."
    }
} finally {
    $env:PATH = $oldPath
    $env:CGO_ENABLED = $oldCGO
    $env:CGO_CFLAGS = $oldCFlags
    $env:CGO_CXXFLAGS = $oldCXXFlags
    $env:CGO_LDFLAGS = $oldLDFlags
    $full = [System.IO.Path]::GetFullPath($tempRoot)
    $tempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd("\") + "\"
    if (-not $full.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not (Split-Path -Leaf $full).StartsWith("vantare cgo flags ", [System.StringComparison]::Ordinal)) {
        throw "Refusing unsafe CGO test cleanup: $full"
    }
    if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Recurse -Force }
}

Write-Host "PASS Go/GCC parsed quoted CGO C, C++ and linker paths containing spaces."
