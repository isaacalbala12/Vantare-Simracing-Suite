param([Parameter(Mandatory=$true)][string]$Run,[Parameter(Mandatory=$true)][string]$Output,[string]$Repo='C:\VantareServer\wt\isa-1638\vantare-v2',[switch]$Widgets)
$ErrorActionPreference='Stop'
$env:VANTARE_CARGO_MIN_GB='0'
Push-Location -LiteralPath $Repo
try {
    & pwsh -NoProfile -File native/scripts/compilar.ps1 python -I "$PSScriptRoot/analyze_ab.py" $Run --output $Output
    if ($LASTEXITCODE -ne 0) { throw 'Análisis incompleto/no comparable; revisa analysis.json y los archivos antes de certificar.' }
    if ($Widgets) {
        $manifest=Get-Content -LiteralPath (Join-Path $Run 'run.json') -Raw | ConvertFrom-Json
        foreach ($block in $manifest.blocks) {
            if ($block.mode -eq 'C') { continue }
            & pwsh -NoProfile -File native/scripts/compilar.ps1 python -I native/scripts/verify-lmu-widget-coverage.py --target-dir C:/VantareServer/targets/isa-1638 --recording (Join-Path $Run "$($block.name)/sesion.lmu.gz") --recording-scope practice-only --output-dir (Join-Path $Output "$($block.name)-widgets")
            if ($LASTEXITCODE -ne 0) { throw "Falló verificación de widgets en $($block.name)" }
        }
    }
} finally { Pop-Location }
