#requires -Version 5.1
# Test-only guard. Never resolves a missing argument to a product installation.
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
