param([string]$EvidenceDirectory = '')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script = Join-Path $PSScriptRoot 'comprobar.ps1'

function Get-Selection([string]$line, [string]$kind) {
    $pattern = if ($kind -eq 'lint') { '^Comprobar: ([^(]+) \(tests:' } else { '\(tests: ([^)]*)\)' }
    if ($line -notmatch $pattern) { throw "Sin selección de ${kind}: $line" }
    return @($Matches[1].Trim().Split(',') | Where-Object { $_ })
}

$warnings = @()
$fast = & $script ipc -ListOnly -WarningVariable warnings
if ($LASTEXITCODE) { throw 'comprobar -ListOnly falló' }
$fastLint = @(Get-Selection $fast 'lint')
$fastTests = @(Get-Selection $fast 'tests')
if ($fastLint.Count -ne 1 -or $fastLint[0] -ne 'vantare-ipc') {
    throw "Clippy rápido inesperado: $($fastLint -join ',')"
}
if ($fastTests.Count -ne 1 -or $fastTests[0] -ne 'vantare-ipc') {
    throw "Tests rápidos inesperados: $($fastTests -join ',')"
}
if (($warnings -join ' ') -notmatch 'faltan Clippy y tests de dependientes') {
    throw 'Falta el aviso de gate rápido para ipc'
}

$full = & $script ipc -Full -ListOnly
if ($LASTEXITCODE) { throw 'comprobar -Full -ListOnly falló' }
$fullLint = @(Get-Selection $full 'lint')
$fullTests = @(Get-Selection $full 'tests')
if ($fullLint -notcontains 'vantare-ipc' -or $fullLint.Count -le 1) {
    throw "Clippy completo incompleto: $($fullLint -join ',')"
}
if ($fullTests -notcontains 'vantare-ipc' -or $fullTests.Count -le 1) {
    throw "Tests completos incompletos: $($fullTests -join ',')"
}
if (($fullLint -join ',') -ne ($fullTests -join ',')) {
    throw 'Full debe usar la misma selección para Clippy y tests'
}

$other = & $script hub-host -ListOnly
if ($LASTEXITCODE) { throw 'comprobar -ListOnly de hub-host falló' }
$otherTests = @(Get-Selection $other 'tests')
if ($otherTests.Count -ne 1 -or $otherTests[0] -ne 'vantare-hub-host') {
    throw "Selección de hub-host inesperada: $($otherTests -join ',')"
}

if ($EvidenceDirectory) {
    New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
    [ordered]@{ fast_lint = $fastLint; fast_tests = $fastTests; full_lint = $fullLint; full_tests = $fullTests; other = $otherTests } |
        ConvertTo-Json | Set-Content (Join-Path $EvidenceDirectory 'comprobar-scope.json') -Encoding utf8
}
Write-Host 'comprobar ok'
