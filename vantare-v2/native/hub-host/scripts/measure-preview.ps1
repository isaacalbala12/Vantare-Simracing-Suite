# PC de juego autorizado solamente: ejecuta el pintor real de B.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$SceneRoot,
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:VANTARE_SIN_GRAFICOS -eq '1' -or
    [Environment]::GetEnvironmentVariable('VANTARE_SIN_GRAFICOS', 'Machine') -eq '1') {
    throw 'Medición gráfica prohibida en esta máquina.'
}
$binary = (Resolve-Path -LiteralPath $Executable).Path
if ([IO.Path]::GetFileName($binary) -ne 'vantare-overlays-rune.exe') {
    throw 'Usa el ejecutable de captura Rune aprobado.'
}
$scenes = (Resolve-Path -LiteralPath $SceneRoot).Path
$output = [IO.Path]::GetFullPath($OutputDirectory)
$null = [IO.Directory]::CreateDirectory($output)
$results = foreach ($scene in @('standings-expanded', 'delta-history', 'fuel-460x440')) {
    $directory = Join-Path $scenes $scene
    $layout = (Resolve-Path -LiteralPath (Join-Path $directory 'layout.json')).Path
    $snapshot = Join-Path $directory 'snapshot.json'
    $sequence = Join-Path $directory 'sequence.tsv'
    $hasSnapshot = Test-Path -LiteralPath $snapshot
    $hasSequence = Test-Path -LiteralPath $sequence
    if ($hasSnapshot -eq $hasSequence) { throw "$scene exige snapshot.json XOR sequence.tsv." }
    $stem = "$scene-$([Guid]::NewGuid().ToString('N'))"
    $png = Join-Path $output "$stem.png"
    $stderr = Join-Path $output "$stem.stderr"
    $info = [Diagnostics.ProcessStartInfo]::new($binary)
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $info.WorkingDirectory = Split-Path $binary
    $info.RedirectStandardError = $true
    foreach ($argument in @('--capture-scene', '--layout', $layout, '--scale', '1.5', '--output', $png)) {
        $info.ArgumentList.Add($argument)
    }
    $info.ArgumentList.Add($(if ($hasSnapshot) { '--snapshot' } else { '--sequence' }))
    $info.ArgumentList.Add($(if ($hasSnapshot) { $snapshot } else { $sequence }))
    $capture = [Diagnostics.Process]::new()
    $capture.StartInfo = $info
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $started = $false
    try {
        $started = $capture.Start()
        if (-not $started) { throw 'No se inició la captura.' }
        # Drain asynchronously so a full stderr pipe cannot block the measured child.
        $errorText = $capture.StandardError.ReadToEndAsync()
        if (-not $capture.WaitForExit(15000)) {
            $capture.Kill($true)
            $capture.WaitForExit()
            throw "$scene superó 15 s; hijo cerrado."
        }
        $watch.Stop()
        $capture.Refresh()
        [IO.File]::WriteAllText($stderr, $errorText.GetAwaiter().GetResult())
        $size = if (Test-Path -LiteralPath $png) { (Get-Item -LiteralPath $png).Length } else { 0 }
        $width = 0; $height = 0
        if ($size -ge 24) {
            $stream = [IO.File]::OpenRead($png)
            try {
                $header = [byte[]]::new(24)
                $stream.ReadExactly($header, 0, 24)
                $width = [uint32]($header[16] * 16777216 + $header[17] * 65536 + $header[18] * 256 + $header[19])
                $height = [uint32]($header[20] * 16777216 + $header[21] * 65536 + $header[22] * 256 + $header[23])
            } finally { $stream.Dispose() }
        }
        [pscustomobject]@{
            scene = $scene; scale = 1.5; exitCode = $capture.ExitCode
            elapsedMs = [math]::Round($watch.Elapsed.TotalMilliseconds, 2)
            cpuMs = [math]::Round($capture.TotalProcessorTime.TotalMilliseconds, 2)
            peakMemoryBytes = $capture.PeakWorkingSet64
            pngBytes = $size; width = $width; height = $height
            exceedsHostLimit = $size -gt 524288
        }
    } finally {
        if ($started -and -not $capture.HasExited) {
            $capture.Kill($true)
            $capture.WaitForExit()
        }
        $capture.Dispose()
    }
}
$report = Join-Path $output "preview-$([Guid]::NewGuid().ToString('N')).json"
$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $report -Encoding utf8
$results | Format-Table
Write-Host "Informe: $report"
if ($results | Where-Object { $_.exceedsHostLimit }) {
    throw 'PNG por encima de 512 KiB: consultar a la raíz antes de subir el límite.'
}
if ($results | Where-Object { $_.exitCode -ne 0 -or $_.pngBytes -eq 0 }) {
    throw 'Captura incompleta: conservar informe y stderr; no declarar la medición válida.'
}
