#requires -Version 5.1
# Test-only guard. Never resolves a missing argument to a product installation.
function Assert-MatrixSourceBytes([string]$Source) {
    if ([string]::IsNullOrWhiteSpace($Source)) { throw 'MATRIX_SOURCE_REQUIRED' }
    # The baseline pins script bytes. Match the repository's eol=lf policy;
    # never silently normalize installed code in snapshot.py.
    foreach ($name in @('candidate.ps1','beta.ps1','installer-driver.ps1')) {
        if ([IO.File]::ReadAllBytes((Join-Path $Source $name)) -contains [byte]13) {
            throw ('MATRIX_SOURCE_EOL: '+$name+' must use LF as required by .gitattributes')
        }
    }
}

function Assert-MatrixRoot([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { throw 'MATRIX_ROOT_REQUIRED' }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    $prefix = [IO.Path]::GetFullPath('D:/VantareServer/qa/').TrimEnd('\', '/') + '\'
    # RUNNER_TEMP remains stable when child TEMP/TMP are isolated per row.
    $ciTemp = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
    $ciPrefix = [IO.Path]::GetFullPath($ciTemp).TrimEnd('\', '/') + '\'
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -and
        -not ($env:CI -ceq 'true' -and $full.StartsWith($ciPrefix, [StringComparison]::OrdinalIgnoreCase))) {
        throw 'MATRIX_ROOT_REJECTED'
    }
    for ($ancestor = $full; $ancestor; $ancestor = [IO.Path]::GetDirectoryName($ancestor)) {
        if (Test-Path -LiteralPath $ancestor) {
            if ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw 'MATRIX_REPARSE_REJECTED'
            }
        }
    }
    $full
}
