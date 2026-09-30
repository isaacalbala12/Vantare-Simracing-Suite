param(
    [Parameter(Mandatory, ParameterSetName = 'Pantalla')][string]$Pantalla,
    [Parameter(Mandatory, ParameterSetName = 'Todas')][switch]$Todas,
    [switch]$VerificarDeterminismo
)
$ErrorActionPreference = 'Stop'
$repo = (& git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repo) { throw 'No se pudo localizar la raíz Git' }
$project = Join-Path $repo 'vantare-v2'
$tool = Join-Path $project 'native\ui\diff.py'
$manifest = Join-Path $PSScriptRoot 'tools\demo-states.json'
$references = Join-Path $PSScriptRoot 'wails'
$evidence = 'C:\tmp\hub-banco-evidence'
$null = New-Item -ItemType Directory -Path $evidence -Force

if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Falta el comparador: $tool" }
if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { throw "Falta el índice de pantallas: $manifest" }
if (-not (Test-Path -LiteralPath $references -PathType Container)) { throw "Faltan referencias locales: $references" }
$python = Get-Command python -ErrorAction Stop

$metadataPath = Join-Path $evidence 'cargo-metadata.json'
$metadataError = Join-Path $evidence 'cargo-metadata.stderr.log'
Push-Location (Join-Path $project 'native')
try {
    cargo metadata --no-deps --format-version 1 1> $metadataPath 2> $metadataError
    if ($LASTEXITCODE -ne 0) { throw "No se pudo leer target_directory de Cargo; log: $metadataError" }
} finally {
    Pop-Location
}
$targetDirectory = (Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json).target_directory
$hub = Join-Path $targetDirectory 'debug\vantare-hub.exe'

$buildLog = Join-Path $evidence 'cargo-build-parity-capture.log'
Push-Location (Join-Path $project 'native')
try {
    cargo build -p vantare-hub --features parity-capture -j 2 *> $buildLog
    if ($LASTEXITCODE -ne 0) {
        Get-Content -LiteralPath $buildLog -Tail 80
        throw "No se pudo compilar vantare-hub; log: $buildLog"
    }
} finally {
    Pop-Location
}
if (-not (Test-Path -LiteralPath $hub -PathType Leaf)) { throw "No existe el ejecutable: $hub" }

function Invoke-NativeCapture([string]$Name, [string]$Label) {
    $png = Join-Path $evidence "$Label-$Name.png"
    $log = Join-Path $evidence "$Label-$Name.log"
    & $hub --capture $Name --out $png --demo *> $log
    if ($LASTEXITCODE -ne 0) {
        $tail = (Get-Content -LiteralPath $log -Tail 30) -join [Environment]::NewLine
        throw "Captura $Name fallida (exit $LASTEXITCODE). Log: $log`n$tail"
    }
    if (-not (Test-Path -LiteralPath $png -PathType Leaf)) { throw "Captura sin PNG: $png" }
    return $png
}

function Compare-Screen([string]$Name) {
    $reference = Join-Path $references "$Name.png"
    if (-not (Test-Path -LiteralPath $reference -PathType Leaf)) { throw "Falta la referencia Wails: $reference" }
    $candidate = Invoke-NativeCapture $Name 'native'
    $diff = Join-Path $evidence "diff-$Name.png"
    $report = Join-Path $evidence "diff-$Name.txt"
    $summary = Join-Path $evidence "diff-$Name.json"
    $errorLog = Join-Path $evidence "diff-$Name.stderr.log"
    & $python.Source $tool $candidate $reference --threshold 8 --max-percent 100 --out $diff 1> $report 2> $errorLog
    if ($LASTEXITCODE -ne 0) {
        $tail = (Get-Content -LiteralPath $errorLog -Tail 30 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
        throw "Comparación $Name fallida (exit $LASTEXITCODE). Log: $errorLog`n$tail"
    }
    $line = Select-String -LiteralPath $report -Pattern '^\s*\d+/\d+ px distintos \(([0-9.]+) %\)' | Select-Object -First 1
    if (-not $line -or $line.Line -notmatch '^\s*\d+/\d+ px distintos \(([0-9.]+) %\)') {
        throw "El informe de $Name no contiene el porcentaje de píxeles distintos: $report"
    }
    $percent = [double]::Parse($Matches[1], [Globalization.CultureInfo]::InvariantCulture)
    [pscustomobject]@{
        pantalla = $Name
        width = 1440
        height = 900
        threshold = 8
        different_percent = $percent
        diff_png = $diff
        resumen = $line.Line
    } | ConvertTo-Json | Set-Content -LiteralPath $summary -Encoding utf8
    [pscustomobject]@{
        Pantalla = $Name
        PorcentajeDistinto = $percent
        Captura = $candidate
        Diferencias = $diff
        Referencia = $reference
    }
}

$allNames = @(Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json | ForEach-Object { $_.name })
if ($allNames.Count -ne 48 -or ($allNames | Select-Object -Unique).Count -ne 48) {
    throw "El manifiesto debe contener 48 pantallas únicas; contiene $($allNames.Count)"
}
$names = if ($Todas) { $allNames } else { @($Pantalla) }
if (-not $names) { throw 'Indica -Pantalla nombre o -Todas' }
$unknown = @($names | Where-Object { $_ -notin $allNames })
if ($unknown.Count -gt 0) { throw "Pantalla fuera del manifiesto Wails: $($unknown -join ', ')" }

$results = @()
foreach ($name in $names) { $results += Compare-Screen $name }
$sorted = @($results | Sort-Object PorcentajeDistinto -Descending)
$csv = Join-Path $evidence 'comparacion-inicial.csv'
$table = Join-Path $evidence 'comparacion-inicial.txt'
$sorted | Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding utf8
$sorted | Select-Object Pantalla, PorcentajeDistinto | Format-Table -AutoSize | Out-String -Width 160 | Set-Content -LiteralPath $table -Encoding utf8
Get-Content -LiteralPath $table
Write-Output "Capturas, mapas y salidas: $evidence"

if ($VerificarDeterminismo) {
    $determinismScreen = if ($Todas) { 'inicio-base' } else { $Pantalla }
    $first = Invoke-NativeCapture $determinismScreen 'determinismo-a'
    $second = Invoke-NativeCapture $determinismScreen 'determinismo-b'
    $hashA = (Get-FileHash -LiteralPath $first -Algorithm SHA256).Hash
    $hashB = (Get-FileHash -LiteralPath $second -Algorithm SHA256).Hash
    [pscustomobject]@{
        Pantalla = $determinismScreen
        HashA = $hashA
        HashB = $hashB
        Idénticas = ($hashA -eq $hashB)
        CapturaA = $first
        CapturaB = $second
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'determinismo.json') -Encoding utf8
    if ($hashA -ne $hashB) { throw "Las dos capturas de $determinismScreen no son idénticas; consulte determinismo.json" }
}
