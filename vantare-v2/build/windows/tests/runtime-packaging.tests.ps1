[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$releaseScript = Join-Path $repoRoot "tools\release_artifacts.ps1"
$runtimeRelative = "runtime\telemetry\duckdb-v1"
$runtimeMembers = @(
    "manifest.json",
    "duckdb.dll",
    "vantare-telemetry-reader.exe",
    "sbom.spdx.json",
    "THIRD_PARTY_NOTICES.md"
)
$failures = [System.Collections.Generic.List[string]]::new()
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("vantare-ta03f-tests-" + [guid]::NewGuid().ToString("N"))

function Invoke-Case {
    param([string]$Name, [scriptblock]$Test)
    try {
        & $Test
        Write-Host "PASS $Name"
    } catch {
        $failures.Add("${Name}: $($_.Exception.Message)")
        Write-Host "FAIL $Name - $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Assert-Throws {
    param([scriptblock]$Action, [string]$Message)
    $threw = $false
    try { & $Action } catch { $threw = $true }
    if (-not $threw) { throw $Message }
}

function Write-Utf8 {
    param([string]$Path, [string]$Value)
    [System.IO.File]::WriteAllText($Path, $Value, [System.Text.UTF8Encoding]::new($false))
}

function New-TestRepo {
    param([string]$Name)
    $root = Join-Path $tempRoot $Name
    $runtime = Join-Path $root (Join-Path "bin" $runtimeRelative)
    New-Item -ItemType Directory -Force -Path `
        (Join-Path $root "bin"), `
        (Join-Path $root "configs"), `
        (Join-Path $root "docs"), `
        (Join-Path $root "internal\telemetryanalysis\duckdbadapter"), `
        $runtime | Out-Null
    Write-Utf8 (Join-Path $root "VERSION") "1.2.3.4`n"
    Write-Utf8 (Join-Path $root "bin\vantare.exe") "fixture-v1.2.3.4"
    Write-Utf8 (Join-Path $root "configs\fixture.json") "{}"
    Write-Utf8 (Join-Path $root "docs\tester-build-instructions.md") "fixture"

    foreach ($name in $runtimeMembers | Where-Object { $_ -ne "manifest.json" }) {
        Write-Utf8 (Join-Path $runtime $name) "fixture-$name"
    }
    $entries = foreach ($name in $runtimeMembers | Where-Object { $_ -ne "manifest.json" } | Sort-Object) {
        $path = Join-Path $runtime $name
        [ordered]@{
            name = $name
            size = (Get-Item -LiteralPath $path).Length
            sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
        }
    }
    $manifest = [ordered]@{
        protocol_version = 1
        helper_version = "1"
        duckdb_version = "v1.5.5"
        schema_version = 1
        os = "windows"
        arch = "amd64"
        files = @($entries)
    }
    Write-Utf8 (Join-Path $runtime "manifest.json") (($manifest | ConvertTo-Json -Depth 6 -Compress) + "`n")
    $manifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $runtime "manifest.json")).Hash.ToLowerInvariant()
    Write-Utf8 (Join-Path $root "internal\telemetryanalysis\duckdbadapter\runtime_trust_generated.go") `
        "package duckdbadapter`n`nconst productionManifestSHA256 = `"$manifestHash`"`n"
    return $root
}

function Invoke-PortableZip {
    param([string]$FixtureRoot)
    & $releaseScript -Operation portable-zip -RepoRoot $FixtureRoot -BinDir "bin"
}

function Invoke-ReleaseVerify {
    param([string]$FixtureRoot)
    & $releaseScript -Operation verify -RepoRoot $FixtureRoot -BinDir "bin"
}

function Expand-PortableForEdit {
    param([string]$FixtureRoot, [string]$EditName)
    $editRoot = Join-Path $FixtureRoot $EditName
    New-Item -ItemType Directory -Path $editRoot | Out-Null
    Expand-Archive -LiteralPath (Join-Path $FixtureRoot "bin\vantare-portable-amd64.zip") -DestinationPath $editRoot
    return $editRoot
}

function Compress-EditedPortable {
    param([string]$FixtureRoot, [string]$EditRoot)
    $zip = Join-Path $FixtureRoot "bin\vantare-portable-amd64.zip"
    Remove-Item -LiteralPath $zip -Force
    Compress-Archive -Path (Join-Path $EditRoot "*") -DestinationPath $zip -CompressionLevel Optimal
}

function Get-ZipEntryNames {
    param([string]$ZipPath)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        return @($archive.Entries | ForEach-Object { $_.FullName.Replace("/", "\").TrimEnd("\") } | Where-Object { $_ })
    } finally {
        $archive.Dispose()
    }
}

try {
    New-Item -ItemType Directory -Path $tempRoot | Out-Null

    Invoke-Case "portable contains the exact trusted runtime path and unit" {
        $fixture = New-TestRepo "portable-good"
        Invoke-PortableZip $fixture
        $names = Get-ZipEntryNames (Join-Path $fixture "bin\vantare-portable-amd64.zip")
        $actual = @($names | Where-Object { $_ -like "$runtimeRelative\*" } | Sort-Object)
        $expected = @($runtimeMembers | ForEach-Object { "$runtimeRelative\$_" } | Sort-Object)
        Assert-True ([string]::Join("`n", $actual) -ceq [string]::Join("`n", $expected)) `
            "Portable runtime inventory/path differs. Expected $($expected -join ', '); got $($actual -join ', ')."
    }

    Invoke-Case "portable fails closed when the runtime is absent" {
        $fixture = New-TestRepo "portable-absent"
        Remove-Item -LiteralPath (Join-Path $fixture "bin\runtime\telemetry\duckdb-v1") -Recurse -Force
        Assert-Throws { Invoke-PortableZip $fixture } "portable-zip accepted an absent runtime."
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $fixture "bin\vantare-portable-amd64.zip"))) `
            "portable-zip emitted an artifact after rejecting an absent runtime."
    }

    Invoke-Case "portable fails closed when a runtime member is tampered" {
        $fixture = New-TestRepo "portable-tampered"
        Add-Content -LiteralPath (Join-Path $fixture "bin\runtime\telemetry\duckdb-v1\duckdb.dll") -Value "tampered"
        Assert-Throws { Invoke-PortableZip $fixture } "portable-zip accepted a tampered runtime."
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $fixture "bin\vantare-portable-amd64.zip"))) `
            "portable-zip emitted an artifact after rejecting a tampered runtime."
    }

    Invoke-Case "portable fails closed when the runtime has an extra member" {
        $fixture = New-TestRepo "portable-extra"
        Write-Utf8 (Join-Path $fixture "bin\runtime\telemetry\duckdb-v1\unexpected.txt") "extra"
        Assert-Throws { Invoke-PortableZip $fixture } "portable-zip accepted an extra runtime member."
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $fixture "bin\vantare-portable-amd64.zip"))) `
            "portable-zip emitted an artifact after rejecting an extra runtime member."
    }

    Invoke-Case "release verify rejects tamper and extra members inside an existing portable zip" {
        $fixture = New-TestRepo "portable-verify"
        Write-Utf8 (Join-Path $fixture "bin\vantare-amd64-installer.exe") "fixture-v1.2.3.4"
        Invoke-PortableZip $fixture
        Invoke-ReleaseVerify $fixture

        $tampered = Expand-PortableForEdit $fixture "edit-tampered"
        Add-Content -LiteralPath (Join-Path $tampered "runtime\telemetry\duckdb-v1\duckdb.dll") -Value "tampered"
        Compress-EditedPortable $fixture $tampered
        Assert-Throws { Invoke-ReleaseVerify $fixture } "release verify accepted a tampered member inside the zip."

        Invoke-PortableZip $fixture
        $extra = Expand-PortableForEdit $fixture "edit-extra"
        Write-Utf8 (Join-Path $extra "runtime\telemetry\duckdb-v1\unexpected.txt") "extra"
        Compress-EditedPortable $fixture $extra
        Assert-Throws { Invoke-ReleaseVerify $fixture } "release verify accepted an extra runtime member inside the zip."
    }

    Invoke-Case "NSIS includes the five exact members and transactional runtime rollback" {
        $nsi = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "build\windows\nsis\project.nsi")
        foreach ($member in $runtimeMembers) {
            Assert-True ($nsi -match [regex]::Escape("`${VANTARE_TELEMETRY_RUNTIME}\$member")) "NSIS does not File the exact runtime member $member."
        }
        Assert-True ($nsi -match '!define\s+TELEMETRY_RUNTIME_DIR\s+"\$INSTDIR\\runtime\\telemetry\\duckdb-v1"') `
            "NSIS runtime destination is not the exact ProductionTrust path."
        Assert-True ($nsi -match 'Rename\s+"\$\{TELEMETRY_RUNTIME_DIR\}"\s+"\$\{TELEMETRY_RUNTIME_BACKUP\}"') `
            "NSIS does not back up the installed runtime as one directory."
        Assert-True ($nsi -match 'IfFileExists\s+"\$\{TELEMETRY_RUNTIME_DIR\}\\\*\.\*"\s+0\s+extract_files') `
            "NSIS only backs up a runtime with a valid manifest and could mix an incomplete old unit."
        Assert-True ($nsi -match 'IfFileExists\s+"\$\{TELEMETRY_RUNTIME_BACKUP\}\\\*\.\*"') `
            "NSIS cannot restore an incomplete previous runtime as the same unit."
        Assert-True ($nsi -match 'Function\s+RestoreRuntimeBackup') "NSIS has no runtime rollback function."
        Assert-True ($nsi -match 'RMDir\s+/r\s+"\$\{TELEMETRY_RUNTIME_DIR\}"') `
            "NSIS rollback/uninstall does not remove the new runtime as one directory."
    }

    Invoke-Case "packaging surfaces accept an explicit DuckDB archive and runtime path" {
        $buildNsis = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "tools\build_nsis.ps1")
        $prepareRuntime = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "build\windows\telemetry-reader\prepare-runtime.ps1")
        $taskfile = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "build\windows\Taskfile.yml")
        Assert-True ($buildNsis -match '\$RuntimeDirectory') "build_nsis.ps1 has no explicit runtime directory parameter."
        Assert-True ($buildNsis -match 'VANTARE_TELEMETRY_RUNTIME') "build_nsis.ps1 does not pass the staged runtime to NSIS."
        Assert-True ($buildNsis -match '\$RepoRoot\s*=\s*\[System\.IO\.Path\]::GetFullPath\(\$RepoRoot\)') `
            "build_nsis.ps1 does not normalize RepoRoot before changing the NSIS working directory."
        Assert-True ($taskfile -match 'DUCKDB_ARCHIVE_PATH') "Taskfile has no reproducible DuckDB archive variable."
        Assert-True ($taskfile -match 'build-runtime\.ps1|prepare-runtime\.ps1') "Taskfile does not prepare the TA-03C runtime."
        Assert-True ($taskfile -match '(?m)^\s+- pwsh .*prepare-runtime\.ps1') `
            "Taskfile does not use the PowerShell 7 serializer required by the trusted TA-03C runtime."
        Assert-True ($prepareRuntime -match '&\s+\$buildScript\s+@buildParameters') `
            "prepare-runtime.ps1 does not forward named build-runtime parameters safely."
    }

    Invoke-Case "all runtime packaging scripts parse in Windows PowerShell" {
        $scripts = @(
            "build\windows\telemetry-reader\build-runtime.ps1",
            "build\windows\telemetry-reader\prepare-runtime.ps1",
            "build\windows\telemetry-reader\verify-runtime.ps1",
            "build\windows\telemetry-reader\smoke-runtime.ps1",
            "tools\build_nsis.ps1",
            "tools\release_artifacts.ps1"
        )
        foreach ($relative in $scripts) {
            $tokens = $null
            $parseErrors = $null
            [void][System.Management.Automation.Language.Parser]::ParseFile(
                (Join-Path $repoRoot $relative), [ref]$tokens, [ref]$parseErrors
            )
            Assert-True ($parseErrors.Count -eq 0) "$relative has parser errors: $($parseErrors.Message -join '; ')"
        }
        $smoke = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "build\windows\telemetry-reader\smoke-runtime.ps1")
        Assert-True ($smoke -notmatch 'OperatingSystem\]::IsWindows') `
            "smoke-runtime.ps1 calls a .NET Core-only API and cannot run in Windows PowerShell 5.1."
    }

    Invoke-Case "packaged path matches ProductionTrust" {
        $production = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "internal\telemetryanalysis\duckdbadapter\production.go")
        Assert-True ($production -match 'filepath\.Join\(applicationDirectory,\s*"runtime",\s*"telemetry",\s*runtimeVersionDirectory\)') `
            "ProductionTrust no longer anchors runtime/telemetry/<version>."
        Assert-True ($production -match 'runtimeVersionDirectory\s*=\s*"duckdb-v1"') `
            "ProductionTrust no longer uses duckdb-v1."
    }

    Invoke-Case "package all Taskfile renders with its default runtime parameters" {
        & wails3 task -dry windows:package:all | Out-Null
        Assert-True ($LASTEXITCODE -eq 0) "windows:package:all dry-run failed."
    }
} finally {
    $tempFull = [System.IO.Path]::GetFullPath($tempRoot)
    $systemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd("\") + "\"
    if ($tempFull.StartsWith($systemTemp, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $tempFull).StartsWith("vantare-ta03f-tests-", [System.StringComparison]::Ordinal)) {
        if (Test-Path -LiteralPath $tempFull) { Remove-Item -LiteralPath $tempFull -Recurse -Force }
    } else {
        throw "Refusing unsafe test cleanup outside the expected temp path: $tempFull"
    }
}

if ($failures.Count -ne 0) {
    Write-Host "`n$($failures.Count) runtime packaging test(s) failed:" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
}
Write-Host "`nAll runtime packaging tests passed."
