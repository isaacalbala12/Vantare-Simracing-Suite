# Vantare release artifacts helper (R03.B).
#
# Standard library only (PowerShell 5.1+, no external modules).
# Provides four operations used by build/windows/Taskfile.yml:
#
#   1. portable-zip   : build the portable app plus its trusted DuckDB runtime.
#   2. sha256         : write <artifact>.sha256 for each official release file.
#   3. verify         : check that each artifact embeds the expected VERSION.
#   4. clean-stale    : remove stale *.exe from bin/ that are NOT the current build.
#
# Every operation prints a clear human-readable line and returns a non-zero
# exit code on failure so Taskfile can fail the pipeline.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('portable-zip', 'sha256', 'verify', 'clean-stale', 'all')]
    [string]$Operation,

    [string]$RepoRoot = (Resolve-Path "$PSScriptRoot/..").Path,
    [string]$BinDir = 'bin',
    [string]$ConfigsDir = 'configs',
    [string]$DocsDir = 'docs',
    [string]$VersionFile = 'VERSION',
    [string]$RuntimeDirectory = ''
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "[release-artifacts] $Message" -ForegroundColor Cyan
}

function Resolve-RuntimeDirectory {
    [CmdletBinding()]
    param([string]$RepoRoot, [string]$BinDir, [string]$RuntimeDirectory)
    if ($RuntimeDirectory) {
        return [System.IO.Path]::GetFullPath($RuntimeDirectory)
    }
    return [System.IO.Path]::GetFullPath((Join-Path (Join-Path $RepoRoot $BinDir) 'runtime\telemetry\duckdb-v1'))
}

function Assert-TrustedRuntime {
    [CmdletBinding()]
    param([string]$RepoRoot, [string]$RuntimeDirectory)
    $verifier = Join-Path $PSScriptRoot '..\build\windows\telemetry-reader\verify-runtime.ps1'
    & $verifier -RuntimeDirectory $RuntimeDirectory -RepoRoot $RepoRoot | Out-Null
}

function Remove-ExactPortableTempDirectory {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)
    $full = [System.IO.Path]::GetFullPath($Path)
    $tempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $leaf = Split-Path -Leaf $full
    if (-not $full.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not ($leaf.StartsWith('vantare-portable-', [System.StringComparison]::Ordinal) -or
              $leaf.StartsWith('vantare-portable-verify-', [System.StringComparison]::Ordinal))) {
        throw "Refusing unsafe portable temp cleanup: $full"
    }
    if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Recurse -Force }
}

function Get-CurrentVersion {
    [CmdletBinding()]
    param([string]$RepoRoot, [string]$VersionFile)
    $path = Join-Path $RepoRoot $VersionFile
    if (-not (Test-Path -LiteralPath $path)) {
        throw "VERSION file not found at $path"
    }
    $raw = (Get-Content -LiteralPath $path -Raw).Trim()
    if ($raw -notmatch '^\d+\.\d+\.\d+\.\d+$') {
        throw "VERSION content '$raw' does not match required format X.X.X.X"
    }
    return $raw
}

function Resolve-ArtifactPath {
    [CmdletBinding()]
    param([string]$RepoRoot, [string]$BinDir, [string]$FileName)
    $path = Join-Path (Join-Path $RepoRoot $BinDir) $FileName
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required artifact not found: $path"
    }
    return (Resolve-Path -LiteralPath $path).Path
}

function Get-Sha256 {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)
    # certutil is part of Windows since XP and is always available, including
    # in constrained PowerShell hosts that may not expose Get-FileHash.
    # Output format: "<hash>\r\n CertUtil: -hashfile command completed successfully.\r\n"
    $output = & certutil.exe -hashfile $Path SHA256 2>&1
    $hashLine = $output | Where-Object { $_ -match '^[0-9a-fA-F]{64}$' } | Select-Object -First 1
    if ($null -eq $hashLine) {
        throw "Could not parse SHA256 from certutil output for $Path"
    }
    return $hashLine.ToLowerInvariant()
}

function Write-Sha256Sidecar {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)
    $hash = Get-Sha256 -Path $Path
    $sidecar = "$Path.sha256"
    $rel = Split-Path -Path $Path -Leaf
    Set-Content -LiteralPath $sidecar -Value "$hash  $rel" -Encoding ASCII -NoNewline
    Write-Step "sha256 $rel = $hash"
}

function Test-ArtifactVersion {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$ExePath,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion
    )
    # The version token can show up as:
    #   - UTF-8 inside the raw .exe (Go ldflags: -X main.version=vX.X.X.X)
    #   - UTF-16 LE inside the NSIS installer (VIAddVersionKey compiles the
    #     version into the PE version resource as wide strings).
    # We scan the first 16 MiB of the file (binary is ~13 MiB, installer ~7 MiB).
    # Use a bounded FileStream (not ReadAllBytes) so the installer scan is bounded
    # and the handle is always released, even on early return / exception.
    $maxScanBytes = 16MB
    $expectedToken = "v$ExpectedVersion"
    $expectedRaw = $ExpectedVersion
    $stream = $null
    $bytes = $null
    try {
        $stream = [System.IO.File]::OpenRead($ExePath)
        $head = [int64]$stream.Length
        if ($head -gt $maxScanBytes) { $head = $maxScanBytes }
        $bytes = New-Object byte[] $head
        $read = $stream.Read($bytes, 0, [int]$head)
        if ($read -lt $head) {
            # Truncated read: shrink the buffer to what we actually got.
            $truncated = New-Object byte[] $read
            [Array]::Copy($bytes, 0, $truncated, 0, $read)
            $bytes = $truncated
            $head = $read
        }
    }
    finally {
        if ($null -ne $stream) { $stream.Dispose() }
    }
    $utf8 = [System.Text.Encoding]::UTF8.GetString($bytes, 0, $head)
    $utf16 = [System.Text.Encoding]::Unicode.GetString($bytes, 0, $head)
    $leaf = Split-Path -Path $ExePath -Leaf
    if ($utf8.Contains($expectedToken) -or $utf16.Contains($expectedToken)) {
        Write-Step "version OK: '$expectedToken' (utf8) found in $leaf"
        return $true
    }
    if ($utf8.Contains($expectedRaw) -or $utf16.Contains($expectedRaw)) {
        Write-Step "version OK: '$expectedRaw' (no-v prefix, utf16) found in $leaf"
        return $true
    }
    Write-Step "version MISMATCH: '$expectedToken' / '$expectedRaw' NOT found in $leaf"
    Write-Error "Artifact $leaf does not embed version $ExpectedVersion"
    return $false
}

function New-PortableZip {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$BinDir,
        [Parameter(Mandatory = $true)][string]$ConfigsDir,
        [Parameter(Mandatory = $true)][string]$DocsDir,
        [Parameter(Mandatory = $true)][string]$Version,
        [Parameter(Mandatory = $true)][string]$RuntimeDirectory
    )
    $exePath = Resolve-ArtifactPath -RepoRoot $RepoRoot -BinDir $BinDir -FileName 'vantare.exe'
    $configsPath = Join-Path $RepoRoot $ConfigsDir
    if (-not (Test-Path -LiteralPath $configsPath)) {
        throw "Configs directory not found: $configsPath"
    }
    $readmeSrc = Join-Path $RepoRoot (Join-Path $DocsDir 'tester-build-instructions.md')
    if (-not (Test-Path -LiteralPath $readmeSrc)) {
        throw "Tester build instructions doc not found: $readmeSrc"
    }
    Assert-TrustedRuntime -RepoRoot $RepoRoot -RuntimeDirectory $RuntimeDirectory

    $stage = Join-Path $env:TEMP "vantare-portable-$Version-$([System.Guid]::NewGuid().ToString('N'))"
    $stageExe = Join-Path $stage 'vantare.exe'
    $stageConfigs = Join-Path $stage 'configs'
    $stageDocs = Join-Path $stage 'docs'
    $stageRuntime = Join-Path $stage 'runtime\telemetry\duckdb-v1'
    try {
        New-Item -ItemType Directory -Path $stage -Force | Out-Null
        Copy-Item -LiteralPath $exePath -Destination $stageExe -Force
        # Copy configs non-recursive is enough: profiles are flat JSON files.
        New-Item -ItemType Directory -Path $stageConfigs -Force | Out-Null
        Get-ChildItem -LiteralPath $configsPath -File -Filter '*.json' | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $stageConfigs -Force
        }
        New-Item -ItemType Directory -Path $stageDocs -Force | Out-Null
        Copy-Item -LiteralPath $readmeSrc -Destination (Join-Path $stageDocs 'README.txt') -Force
        New-Item -ItemType Directory -Path $stageRuntime -Force | Out-Null
        Get-ChildItem -Force -LiteralPath $RuntimeDirectory -File | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $stageRuntime
        }
        Assert-TrustedRuntime -RepoRoot $RepoRoot -RuntimeDirectory $stageRuntime

        $outZip = Join-Path (Join-Path $RepoRoot $BinDir) "vantare-portable-amd64.zip"
        if (Test-Path -LiteralPath $outZip) {
            Remove-Item -LiteralPath $outZip -Force
        }
        # Compress-Archive with -CompressionLevel Optimal is built-in since PS 5.0.
        Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $outZip -CompressionLevel Optimal
        Assert-PortableRuntime -RepoRoot $RepoRoot -ZipPath $outZip
        Write-Step "portable zip created: $outZip"
    }
    finally {
        if (Test-Path -LiteralPath $stage) {
            Remove-ExactPortableTempDirectory -Path $stage
        }
    }
}

function Assert-PortableRuntime {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$ZipPath
    )
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $prefix = 'runtime/telemetry/duckdb-v1/'
    $members = @('manifest.json', 'duckdb.dll', 'vantare-telemetry-reader.exe', 'sbom.spdx.json', 'THIRD_PARTY_NOTICES.md')
    $expectedEntries = @($members | ForEach-Object { $prefix + $_ } | Sort-Object)
    $extractRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('vantare-portable-verify-' + [guid]::NewGuid().ToString('N'))
    $extractRuntime = Join-Path $extractRoot 'runtime\telemetry\duckdb-v1'
    $archive = $null
    try {
        New-Item -ItemType Directory -Path $extractRuntime -Force | Out-Null
        $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
        $actualEntries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') } | Where-Object {
            $_.StartsWith($prefix, [System.StringComparison]::Ordinal) -and $_ -ne $prefix
        } | Sort-Object)
        if ([string]::Join("`n", $actualEntries) -cne [string]::Join("`n", $expectedEntries)) {
            $allEntries = @($archive.Entries | ForEach-Object { $_.FullName })
            throw "Portable zip must contain exactly the trusted runtime unit at $prefix Expected: $($expectedEntries -join ', '); found: $($actualEntries -join ', '); all entries: $($allEntries -join ', ')."
        }
        foreach ($member in $members) {
            $entryName = $prefix + $member
            $entries = @($archive.Entries | Where-Object { $_.FullName.Replace('\', '/') -ceq $entryName })
            if ($entries.Count -ne 1) { throw "Portable zip is missing or duplicates $entryName" }
            $destination = Join-Path $extractRuntime $member
            $input = $entries[0].Open()
            $output = $null
            try {
                $output = [System.IO.File]::Create($destination)
                $input.CopyTo($output)
            } finally {
                if ($null -ne $output) { $output.Dispose() }
                $input.Dispose()
            }
        }
        Assert-TrustedRuntime -RepoRoot $RepoRoot -RuntimeDirectory $extractRuntime
    } finally {
        if ($null -ne $archive) { $archive.Dispose() }
        if (Test-Path -LiteralPath $extractRoot) { Remove-ExactPortableTempDirectory -Path $extractRoot }
    }
}

function Write-AllChecksums {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$BinDir,
        [Parameter(Mandatory = $true)][string]$Version
    )
    $installer = Resolve-ArtifactPath -RepoRoot $RepoRoot -BinDir $BinDir -FileName "vantare-amd64-installer.exe"
    $exe = Resolve-ArtifactPath -RepoRoot $RepoRoot -BinDir $BinDir -FileName 'vantare.exe'
    $zip = Join-Path (Join-Path $RepoRoot $BinDir) 'vantare-portable-amd64.zip'
    if (-not (Test-Path -LiteralPath $zip)) {
        throw "Portable zip not found: $zip (run 'portable-zip' first)"
    }
    Write-Sha256Sidecar -Path $installer
    Write-Sha256Sidecar -Path $zip
    Write-Sha256Sidecar -Path $exe
}

function Invoke-Verify {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$BinDir,
        [Parameter(Mandatory = $true)][string]$Version
    )
    $installer = Resolve-ArtifactPath -RepoRoot $RepoRoot -BinDir $BinDir -FileName "vantare-amd64-installer.exe"
    $exe = Resolve-ArtifactPath -RepoRoot $RepoRoot -BinDir $BinDir -FileName 'vantare.exe'
    $zip = Resolve-ArtifactPath -RepoRoot $RepoRoot -BinDir $BinDir -FileName 'vantare-portable-amd64.zip'
    $okExe = Test-ArtifactVersion -ExePath $exe -ExpectedVersion $Version
    # Installer wraps the exe via NSIS so the version string is also present.
    $okInstaller = Test-ArtifactVersion -ExePath $installer -ExpectedVersion $Version
    if (-not ($okExe -and $okInstaller)) {
        throw "Verification failed: at least one artifact does not embed $Version"
    }
    Assert-PortableRuntime -RepoRoot $RepoRoot -ZipPath $zip
    Write-Step "all artifacts verified for version $Version"
}

function Invoke-CleanStale {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$BinDir
    )
    # Resolve both paths to canonical absolute paths so the containment check
    # is robust against .. traversal, mixed slashes and relative inputs.
    $repoFull = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RepoRoot).Path)
    $binCandidate = Join-Path $repoFull $BinDir
    $binFull = [System.IO.Path]::GetFullPath($binCandidate)

    # Hard containment rule: BinDir must equal <RepoRoot>\bin or be nested inside
    # <RepoRoot>\bin. This prevents release:clean from ever deleting files
    # outside the official artifact directory even if BinDir is misconfigured.
    $expectedRoot = Join-Path $repoFull 'bin'
    $expectedRootFull = [System.IO.Path]::GetFullPath($expectedRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $binFullTrimmed = $binFull.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)

    $isRootBin = $binFullTrimmed.Equals($expectedRootFull, [System.StringComparison]::OrdinalIgnoreCase)
    $nestedUnderBin = $binFullTrimmed.StartsWith($expectedRootFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
    if (-not ($isRootBin -or $nestedUnderBin)) {
        throw "Refusing to clean: BinDir '$binFull' is not '$expectedRootFull' or a subdirectory of it. release:clean is restricted to <RepoRoot>\bin."
    }
    if (-not (Test-Path -LiteralPath $binFull)) {
        Write-Step "clean skipped: $binFull does not exist"
        return
    }
    $binPath = $binFull
    $keep = @(
        'vantare.exe',
        'vantare-amd64-installer.exe',
        'vantare-portable-amd64.zip',
        'vantare.exe.sha256',
        'vantare-amd64-installer.exe.sha256',
        'vantare-portable-amd64.zip.sha256'
    )
    Get-ChildItem -LiteralPath $binPath -File | ForEach-Object {
        if ($keep -notcontains $_.Name) {
            Write-Step "removing stale artifact: $($_.Name)"
            Remove-Item -LiteralPath $_.FullName -Force
        }
    }
}

$version = Get-CurrentVersion -RepoRoot $RepoRoot -VersionFile $VersionFile
$resolvedRuntime = Resolve-RuntimeDirectory -RepoRoot $RepoRoot -BinDir $BinDir -RuntimeDirectory $RuntimeDirectory
Write-Step "operation=$Operation version=$version repo=$RepoRoot"

switch ($Operation) {
    'portable-zip' {
        New-PortableZip -RepoRoot $RepoRoot -BinDir $BinDir -ConfigsDir $ConfigsDir -DocsDir $DocsDir -Version $version -RuntimeDirectory $resolvedRuntime
    }
    'sha256' {
        Write-AllChecksums -RepoRoot $RepoRoot -BinDir $BinDir -Version $version
    }
    'verify' {
        Invoke-Verify -RepoRoot $RepoRoot -BinDir $BinDir -Version $version
    }
    'clean-stale' {
        Invoke-CleanStale -RepoRoot $RepoRoot -BinDir $BinDir
    }
    'all' {
        New-PortableZip -RepoRoot $RepoRoot -BinDir $BinDir -ConfigsDir $ConfigsDir -DocsDir $DocsDir -Version $version -RuntimeDirectory $resolvedRuntime
        Write-AllChecksums -RepoRoot $RepoRoot -BinDir $BinDir -Version $version
        Invoke-Verify -RepoRoot $RepoRoot -BinDir $BinDir -Version $version
    }
}

Write-Step "operation '$Operation' completed."
