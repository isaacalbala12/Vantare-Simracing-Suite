function ConvertTo-CgoFlagPath {
    param([Parameter(Mandatory = $true)][string]$Directory)

    $full = [System.IO.Path]::GetFullPath($Directory)
    if ($full.Contains('"')) {
        throw "CGO path cannot contain a quote: $full"
    }
    return $full
}

function New-CgoIncludeFlags {
    param([Parameter(Mandatory = $true)][string]$Directory)

    return '"-I' + (ConvertTo-CgoFlagPath -Directory $Directory) + '"'
}

function New-CgoLinkerFlags {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [AllowEmptyString()][string]$LibraryName = 'duckdb'
    )

    $flags = '"-L' + (ConvertTo-CgoFlagPath -Directory $Directory) + '"'
    if ($LibraryName) { $flags += " -l$LibraryName" }
    return $flags
}
