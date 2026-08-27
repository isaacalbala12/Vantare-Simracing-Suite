[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$prepare = Join-Path $repoRoot "build\windows\telemetry-reader\prepare-runtime.ps1"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("vantare prepare safety " + [guid]::NewGuid().ToString("N"))
$fakeRepo = Join-Path $tempRoot "repo"
$external = Join-Path $tempRoot "external target"
$junction = Join-Path $fakeRepo "bin"
$sentinel = Join-Path $external "runtime\telemetry\duckdb-v1\sentinel.txt"

function Assert-Safety {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Invoke-PrepareFailure {
    param([string]$BinDir)
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = @(& pwsh -NoProfile -File $prepare -RepoRoot $fakeRepo -BinDir $BinDir 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $oldPreference
    }
    return [ordered]@{ exitCode = $exitCode; output = ($output -join "`n") }
}

$junctionCreated = $false
try {
    New-Item -ItemType Directory -Force -Path $fakeRepo, (Split-Path -Parent $sentinel) | Out-Null
    [System.IO.File]::WriteAllText($sentinel, "preserve", [System.Text.UTF8Encoding]::new($false))
    try {
        New-Item -ItemType Junction -Path $junction -Target $external -ErrorAction Stop | Out-Null
        $junctionCreated = $true
    } catch {
        $reason = $_.Exception.Message
        if ($reason -notmatch '(?i)privilege|not supported|operation is not supported|reparse points are not supported') {
            throw
        }
        Write-Warning "SKIP junction execution: platform/privilege error: $reason"
    }

    if ($junctionCreated) {
        $result = Invoke-PrepareFailure -BinDir "bin"
        Assert-Safety ($result.exitCode -ne 0) "prepare-runtime accepted a junction destination"
        Assert-Safety ($result.output -match '(?i)reparse') "prepare-runtime did not fail at its reparse guard: $($result.output)"
        Assert-Safety (Test-Path -LiteralPath $sentinel -PathType Leaf) "prepare-runtime followed the junction and removed the external sentinel"
        Assert-Safety ((Get-Content -Raw -LiteralPath $sentinel) -eq "preserve") "external sentinel content changed"
    }

    if ($junctionCreated) {
        [System.IO.Directory]::Delete($junction)
        $junctionCreated = $false
    }
    New-Item -ItemType Directory -Path $junction | Out-Null
    $absoluteCaseResult = Invoke-PrepareFailure -BinDir $junction.ToUpperInvariant()
    Assert-Safety ($absoluteCaseResult.exitCode -ne 0) "prepare-runtime fixture unexpectedly completed"
    Assert-Safety ($absoluteCaseResult.output -notmatch '(?i)must resolve nominally and exactly') `
        "prepare-runtime rejected the exact absolute BinDir only because casing differed: $($absoluteCaseResult.output)"

    $subdirResult = Invoke-PrepareFailure -BinDir "bin\nested"
    Assert-Safety ($subdirResult.exitCode -ne 0) "prepare-runtime accepted a BinDir below the canonical bin"
    Assert-Safety ($subdirResult.output -match '(?i)exact') "prepare-runtime did not reject non-exact BinDir before build: $($subdirResult.output)"

    $source = Get-Content -Raw -LiteralPath $prepare
    Assert-Safety ($source.Contains("[System.IO.FileAttributes]::ReparsePoint")) "prepare-runtime has no structural ReparsePoint guard"
    foreach ($relative in @('"runtime"', '"runtime\telemetry"', '"runtime\telemetry\duckdb-v1"')) {
        Assert-Safety ($source.Contains($relative)) "prepare-runtime does not guard path component $relative"
    }
} finally {
    if ($junctionCreated -and (Test-Path -LiteralPath $junction)) {
        [System.IO.Directory]::Delete($junction)
    }
    $full = [System.IO.Path]::GetFullPath($tempRoot)
    $tempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd("\") + "\"
    if (-not $full.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not (Split-Path -Leaf $full).StartsWith("vantare prepare safety ", [System.StringComparison]::Ordinal)) {
        throw "Refusing unsafe prepare-runtime test cleanup: $full"
    }
    if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Recurse -Force }
}

Write-Host "PASS prepare-runtime rejects reparse destinations and non-canonical BinDir before deletion."
