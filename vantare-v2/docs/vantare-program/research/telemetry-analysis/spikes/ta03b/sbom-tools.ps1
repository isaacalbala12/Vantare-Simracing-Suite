function Assert-ExactGoModuleInventory {
    param(
        [Parameter(Mandatory = $true)][string[]]$BuildInfoLines,
        [Parameter(Mandatory = $true)][object[]]$ExpectedModules
    )

    $expected = @{}
    foreach ($module in $ExpectedModules) {
        $key = [string]$module.module
        if ($expected.ContainsKey($key)) {
            throw "Duplicate expected Go module: $key."
        }
        $expected[$key] = [string]$module.version
    }

    $actual = @{}
    foreach ($line in $BuildInfoLines) {
        if ($line -match '^\s*=>\s+') {
            throw "Unexpected Go module replacement in build information: $($line.Trim())."
        }
        if ($line -notmatch '^\s*dep\s+(\S+)\s+(\S+)(?:\s+.*)?$') {
            continue
        }
        $module = $Matches[1]
        $version = $Matches[2]
        if ($actual.ContainsKey($module)) {
            throw "Duplicate Go module in build information: $module."
        }
        $actual[$module] = $version
    }

    $missing = @(
        $expected.Keys |
            Where-Object { -not $actual.ContainsKey($_) } |
            Sort-Object
    )
    $unexpected = @(
        $actual.Keys |
            Where-Object { -not $expected.ContainsKey($_) } |
            Sort-Object
    )
    $versionMismatches = @(
        $expected.Keys |
            Where-Object { $actual.ContainsKey($_) -and $actual[$_] -ne $expected[$_] } |
            Sort-Object |
            ForEach-Object { "$_ expected=$($expected[$_]) actual=$($actual[$_])" }
    )

    if ($missing.Count -gt 0 -or $unexpected.Count -gt 0 -or $versionMismatches.Count -gt 0) {
        $details = @()
        if ($missing.Count -gt 0) {
            $details += "missing=[$($missing -join ', ')]"
        }
        if ($unexpected.Count -gt 0) {
            $details += "unexpected=[$($unexpected -join ', ')]"
        }
        if ($versionMismatches.Count -gt 0) {
            $details += "version-mismatch=[$($versionMismatches -join '; ')]"
        }
        throw "Go module inventory mismatch: $($details -join '; ')."
    }
}
