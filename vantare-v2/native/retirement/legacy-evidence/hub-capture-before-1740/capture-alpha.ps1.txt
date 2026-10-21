# Batería de alfa del Hub: PNG originales, sin normalización ni fondo añadido.
param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [string[]]$Scene = (Get-Content "$PSScriptRoot/alpha-scenes.json" -Raw | ConvertFrom-Json),
    [string[]]$Size = @('1920x1080', '1440x900', '1280x800')
)
$ErrorActionPreference = 'Stop'
$Executable = (Resolve-Path -LiteralPath $Executable).Path
$evidence = [IO.Path]::GetFullPath($EvidenceDirectory)
$repo = (& git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE) { throw 'No se pudo localizar la raíz Git' }
$repo = [IO.Path]::GetFullPath($repo)
if ($evidence.Equals($repo, [StringComparison]::OrdinalIgnoreCase) -or
    $evidence.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'La evidencia debe quedar fuera del repo'
}
foreach ($dimensions in $Size) {
    if ($dimensions -notmatch '^(1920x1080|1440x900|1280x800)$') { throw "Tamaño no admitido: $dimensions" }
}
[void][IO.Directory]::CreateDirectory($evidence)
& "$PSScriptRoot/capture-bitmap-tests.ps1"
& "$PSScriptRoot/assert-opaque-tests.ps1"
$entries = @()
foreach ($dimensions in $Size) {
    $w,$h = $dimensions.Split('x') | ForEach-Object { [int]$_ }
    foreach ($name in $Scene) {
        if ($name -notmatch '^[a-z][a-z0-9-]+$') { throw 'Nombre de escena inválido' }
        $entries += @{scene=$name; size=@($w,$h); output=(Join-Path $evidence "$dimensions-$name.png")}
    }
}
$manifest = Join-Path $evidence 'capture-batch.json'
ConvertTo-Json -InputObject $entries -Depth 20 | Set-Content -LiteralPath $manifest -Encoding utf8
& $Executable --capture-batch $manifest *> (Join-Path $evidence 'capture-batch.log')
if ($LASTEXITCODE) { throw "Captura en lote falló: $LASTEXITCODE" }
$results = @($entries | ForEach-Object {
    & "$PSScriptRoot/assert-opaque.ps1" -Path $_.output
    [pscustomobject]@{ scene=$_.scene; size=$_.size; sha256=(Get-FileHash -LiteralPath $_.output).Hash }
})
ConvertTo-Json -InputObject $results -Depth 20 | Set-Content -LiteralPath (Join-Path $evidence 'alpha-results.json')
"PASS alfa: $($results.Count) capturas opacas"
