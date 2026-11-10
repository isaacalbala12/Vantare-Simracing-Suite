# Affected-crate selection (#2003) invokes cargo metadata before acquiring the
# build queue. This read-only command must not be mistaken for a compiler.
function Test-MeasurementCompilerProcess {
    param([string]$Name, [AllowNull()][string]$CommandLine)
    if ($Name -ine 'cargo.exe') { return $true }
    if (!$CommandLine) { return $true }
    $compile = '(?i)(?:^|\s)"?(?:build|check|clippy|test|nextest|run|rustc|bench|doc|install|package)"?(?:\s|$)'
    if ($CommandLine -match $compile) { return $true }
    if ($CommandLine -match '(?i)(?:^|\s)fmt(?:\s|$)' -and $CommandLine -match '(?:^|\s)--check(?:\s|$)') { return $false }
    # Unknown Cargo commands remain conservative; only the selector's known
    # metadata operation is allowed. No command-line arguments are logged.
    return $CommandLine -notmatch '(?i)(?:^|\s)"?metadata"?(?:\s|$)'
}

function Get-MeasurementProcesses {
    Get-CimInstance Win32_Process -Filter "Name = 'cargo.exe' OR Name = 'rustc.exe' OR Name = 'clippy-driver.exe' OR Name = 'cargo-clippy.exe' OR Name = 'cargo-nextest.exe'"
}
