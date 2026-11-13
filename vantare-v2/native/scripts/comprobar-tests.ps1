param([string]$EvidenceDirectory = '')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script = Join-Path $PSScriptRoot 'comprobar.ps1'

function Get-TestSelection([string]$line) {
    if ($line -notmatch '\(tests: ([^)]*)\)') { throw "Sin selección de tests: $line" }
    return @($Matches[1].Split(',') | Where-Object { $_ })
}

$warnings = @()
$fast = & $script ipc -ListOnly -WarningVariable warnings
if ($LASTEXITCODE) { throw 'comprobar -ListOnly falló' }
$fastTests = @(Get-TestSelection $fast)
if ($fastTests.Count -ne 1 -or $fastTests[0] -ne 'vantare-ipc') {
    throw "Selección rápida inesperada: $($fastTests -join ',')"
}
if (($warnings -join ' ') -notmatch 'faltan tests de dependientes') {
    throw 'Falta el aviso de gate rápido para ipc'
}

$full = & $script ipc -Full -ListOnly
if ($LASTEXITCODE) { throw 'comprobar -Full -ListOnly falló' }
$fullTests = @(Get-TestSelection $full)
if ($fullTests -notcontains 'vantare-ipc') {
    throw "La selección completa no incluye ipc: $($fullTests -join ',')"
}
if ($fullTests.Count -le $fastTests.Count) { throw 'Full no amplió los tests' }

$other = & $script hub-host -ListOnly
if ($LASTEXITCODE) { throw 'comprobar -ListOnly de hub-host falló' }
$otherTests = @(Get-TestSelection $other)
if ($otherTests.Count -ne 1 -or $otherTests[0] -ne 'vantare-hub-host') {
    throw "Selección de hub-host inesperada: $($otherTests -join ',')"
}

if ($EvidenceDirectory) {
    New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
    [ordered]@{ fast = $fastTests; full = $fullTests; other = $otherTests } |
        ConvertTo-Json | Set-Content (Join-Path $EvidenceDirectory 'comprobar-scope.json') -Encoding utf8
}
Write-Host 'comprobar ok'

