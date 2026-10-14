# Smoke de proceso GPUI/EOF; no prueba LMU, DPI, OBS, paridad ni rendimiento.
# Ejecutar desde native con el binario construido (cargo build --offline -j 2 -p vantare-hub).
[CmdletBinding()]
param([string]$Executable = (Join-Path $PSScriptRoot '../target/debug/vantare-hub.exe'))
$ErrorActionPreference = 'Stop'
$binary = (Resolve-Path -LiteralPath $Executable).Path
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$probeDirectory = Join-Path $temporaryRoot ('vantare-hub-eof-' + [Guid]::NewGuid().ToString('N'))
$resolvedProbe = [IO.Path]::GetFullPath($probeDirectory)
if (-not $resolvedProbe.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Directorio de prueba fuera del temporal propio'
}
[IO.Directory]::CreateDirectory($probeDirectory) | Out-Null
$probeExe = Join-Path $probeDirectory 'vantare-hub.exe'
Copy-Item -LiteralPath $binary -Destination $probeExe
$process = [Diagnostics.Process]::new()
$started = $false
try {
    $process.StartInfo = [Diagnostics.ProcessStartInfo]::new($probeExe)
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $process.StartInfo.RedirectStandardInput = $true
    $process.StartInfo.RedirectStandardError = $true
    $process.StartInfo.ArgumentList.Add('--pipe')
    $process.StartInfo.ArgumentList.Add('vantare-hub-smoke-' + [Guid]::NewGuid().ToString('N'))
    $process.StartInfo.ArgumentList.Add('--control-stdin')
    $process.StartInfo.ArgumentList.Add('--workshop')
    $process.StartInfo.ArgumentList.Add('--layout')
    $process.StartInfo.ArgumentList.Add((Join-Path $probeDirectory 'layout.json'))
    $process.StartInfo.ArgumentList.Add('--data-dir')
    $process.StartInfo.ArgumentList.Add($probeDirectory)
    if (-not $process.Start()) { throw 'No se inició el Hub' }
    $started = $true
    $stderr = $process.StandardError.ReadToEndAsync()
    # Espera acotada a arranque real; no se usa como medición de rendimiento.
    if ($process.WaitForExit(1500)) { throw ('Salida prematura: ' + $stderr.Result) }
    $probePid = $process.Id
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(10000)) { throw 'Hub no terminó tras EOF' }
    if ($process.ExitCode -ne 0) { throw ('Hub devolvió error: ' + $stderr.Result) }
    if (-not (Test-Path -LiteralPath (Join-Path $probeDirectory 'workshop-selection.json'))) {
        throw 'No se guardó la selección al cerrar'
    }
    [pscustomobject]@{ Result = 'PASS'; PID = $probePid; ExitCode = $process.ExitCode; Check = 'Proceso vivo antes de EOF, guardado y salida completa tras EOF'; Limits = 'Sin prueba física de juego o paridad' }
} finally {
    if ($started -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit(10000) | Out-Null }
    $process.Dispose()
    # Solo los ficheros propios, sin borrado recursivo.
    foreach ($name in @('workshop-selection.json', 'layout.json', 'layout.json.lock', 'layout.json.bak', 'vantare-hub.exe')) {
        $file = Join-Path $resolvedProbe $name
        if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
    }
    if ([IO.Directory]::GetFileSystemEntries($resolvedProbe).Count -eq 0) {
        Remove-Item -LiteralPath $resolvedProbe
    }
}
