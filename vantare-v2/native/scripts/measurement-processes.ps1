# Affected-crate selection (#2003) invokes cargo metadata before acquiring the
# build queue. This read-only command must not be mistaken for a compiler.
function Test-MeasurementCompilerProcess {
    param([string]$Name, [AllowNull()][string]$CommandLine)
    if ($Name -ine 'cargo.exe') { return $true }
    if (!$CommandLine) { return $true }
    $compile = '(?i)(?:^|\s)"?(?:build|check|clippy|test|nextest|run|rustc|bench|doc|install|package)"?(?:\s|$)'
    if ($CommandLine -match $compile) { return $true }
    # Formatting another worktree is not compilation. The collector separately
    # verifies its own clean revision before and after every observation.
    if ($CommandLine -match '(?i)(?:^|\s)fmt(?:\s|$)') { return $false }
    # Unknown Cargo commands remain conservative; only the selector's known
    # metadata operation is allowed. No command-line arguments are logged.
    return $CommandLine -notmatch '(?i)(?:^|\s)"?metadata"?(?:\s|$)'
}

function Get-MeasurementSourceRevision([string]$Root) {
    $revision=(& git -C $Root rev-parse HEAD).Trim()
    if ($LASTEXITCODE -or $revision -notmatch '^[a-f0-9]{40}$') { throw 'Cannot identify collector source' }
    $changes=@(& git -C $Root status --porcelain)
    if ($LASTEXITCODE -or $changes.Count) { throw 'Collector source changed or is dirty' }
    return $revision
}

function Assert-MeasurementSourceRevision([string]$Root,[string]$Expected) {
    if ((Get-MeasurementSourceRevision $Root) -ne $Expected) { throw 'Collector source revision changed during observation' }
}

function Get-MeasurementProcesses {
    Get-CimInstance Win32_Process -Filter "Name = 'cargo.exe' OR Name = 'rustc.exe' OR Name = 'clippy-driver.exe' OR Name = 'cargo-clippy.exe' OR Name = 'cargo-nextest.exe'"
}

# A short Cargo command can exit between CIM enumeration and command-line read.
# Requery only missing command lines; an active unidentified process stays unsafe.
function Resolve-MeasurementProcessSnapshot($Snapshot) {
    if ($Snapshot.CommandLine) { return $Snapshot }
    $live=Get-CimInstance Win32_Process -Filter "ProcessId = $([uint32]$Snapshot.ProcessId)" -ErrorAction Stop
    if (!$live -or $live.Name -ine $Snapshot.Name) { return $null }
    if ($Snapshot.CreationDate -and $live.CreationDate -and $Snapshot.CreationDate -ne $live.CreationDate) { return $null }
    return $live
}
