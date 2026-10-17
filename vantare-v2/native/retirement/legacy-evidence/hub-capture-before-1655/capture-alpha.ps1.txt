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
$marker = 'C:/tmp/fase2/pantalla-ocupada'
$turn = "alfa-$PID-$([guid]::NewGuid())"
$previousTurn = $env:VANTARE_CAPTURE_TURN
$ownsTurn = $false
$results = @()
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    while (-not $ownsTurn) {
        if ([DateTime]::UtcNow -ge $deadline) { throw 'Turno de pantalla excedió 90 s' }
        try {
            $stream = [IO.File]::Open($marker, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
            try {
                $bytes = [Text.Encoding]::UTF8.GetBytes($turn)
                $stream.Write($bytes, 0, $bytes.Length)
                $ownsTurn = $true
            } finally { $stream.Dispose() }
        } catch [IO.IOException] { Start-Sleep -Seconds 1 }
    }
    # El helper del Hub toma el mutex global; no tomarlo por segunda vez aquí.
    $env:VANTARE_CAPTURE_TURN = $turn
    foreach ($dimensions in $Size) {
        foreach ($name in $Scene) {
            if ($name -notmatch '^[a-z][a-z0-9-]+$') { throw 'Nombre de escena inválido' }
            $notes = 'C:/tmp/fase2/notas-1479.md'
            if (Test-Path -LiteralPath $notes) { Get-Content -LiteralPath $notes }
            $png = Join-Path $evidence "$dimensions-$name.png"
            $process = Start-Process -FilePath $Executable -ArgumentList @('--capture', $name, '--out', ('"' + $png + '"'), '--demo', '--size', $dimensions) -WindowStyle Normal -PassThru `
                -RedirectStandardOutput (Join-Path $evidence "$dimensions-$name.stdout.log") `
                -RedirectStandardError (Join-Path $evidence "$dimensions-$name.stderr.log")
            if (-not $process.WaitForExit(90000)) {
                Stop-Process -Id $process.Id -Force
                throw "Captura $name excedió 90 s"
            }
            $process.Refresh()
            if ($process.ExitCode) { throw "Captura $name falló: $($process.ExitCode)" }
            & "$PSScriptRoot/assert-opaque.ps1" -Path $png
            $results += [pscustomobject]@{ scene = $name; size = $dimensions; sha256 = (Get-FileHash -LiteralPath $png).Hash }
            $results | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'alpha-results.json')
        }
    }
    "PASS alfa: $($results.Count) capturas opacas"
} finally {
    $env:VANTARE_CAPTURE_TURN = $previousTurn
    if ($ownsTurn -and (Get-Content -LiteralPath $marker -Raw).Trim() -ceq $turn) { Remove-Item -LiteralPath $marker }
}
