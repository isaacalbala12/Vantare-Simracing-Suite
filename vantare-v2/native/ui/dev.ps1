<#
Workshop GPUI con recarga: .\ui\dev.ps1 [-Widget radar] [-Escena <foto.json>].
Sondea domain/src y ui/src; JSON lo recarga la ventana sin compilar.
Ctrl+C cierra solo los procesos y copias de esta sesión. No cambia perfiles Cargo.
#>
[CmdletBinding()]
param(
    [string]$Widget,
    [string]$Escena
)
$ErrorActionPreference = 'Stop'
$native = Split-Path $PSScriptRoot
$runDir = Join-Path ([IO.Path]::GetTempPath()) ('vantare-workshop-dev-' + [guid]::NewGuid())
$state = Join-Path $runDir 'selection.txt'
$built = Join-Path $native 'target/debug/vantare-workshop.exe'
$running = $null
$sequence = 0
New-Item -ItemType Directory -Path $runDir | Out-Null
# Resolver antes de cambiar el directorio de trabajo del hijo.
if ($Escena) { $Escena = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Escena) }

# Solo consulta las ventanas de nuestros hijos. No instala módulos ni modifica el escritorio.
if (-not ('VantareWorkshopDevWindow' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class VantareWorkshopDevWindow {
    delegate bool Callback(IntPtr hwnd, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr data);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    public static bool Visible(uint process) {
        bool found = false;
        EnumWindows((hwnd, data) => {
            uint pid; GetWindowThreadProcessId(hwnd, out pid);
            if (pid == process && IsWindowVisible(hwnd)) found = true;
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
'@
}

function Get-Sources {
    # Comparar el conjunto completo detecta también borrados y renombrados, sin máximo mtime.
    $files = Get-ChildItem (Join-Path $native 'domain/src'), (Join-Path $native 'ui/src') -Recurse -File -Filter '*.rs' |
        Sort-Object FullName
    $signature = ($files | ForEach-Object { '{0}|{1}|{2}' -f $_.FullName, $_.LastWriteTimeUtc.Ticks, $_.Length }) -join "`n"
    $latest = ($files | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
    return @{ Signature = $signature; Saved = $latest }
}

function Build-Workshop {
    # rustup resuelve rust-toolchain.toml desde el cwd, no desde --manifest-path.
    Push-Location $native
    try {
        & cargo build -p vantare-ui --bin vantare-workshop -j 2 | Out-Host
        return $LASTEXITCODE -eq 0
    } finally { Pop-Location }
}

function Start-Workshop {
    $script:sequence++
    $copy = Join-Path $runDir "workshop-$sequence.exe"
    Copy-Item -LiteralPath $built -Destination $copy
    # ArgumentList de .NET preserva rutas con espacios y caracteres de shell.
    $info = [Diagnostics.ProcessStartInfo]::new($copy)
    $info.UseShellExecute = $false
    $info.WorkingDirectory = $native
    $info.Environment['VANTARE_WORKSHOP_STATE'] = $state
    $info.ArgumentList.Add('--dev')
    if (Test-Path -LiteralPath $state) {
        $selection = @(Get-Content -LiteralPath $state)
        if ($selection.Count -ne 2) { throw 'Selección guardada incompleta; se conserva la ventana anterior.' }
        $info.ArgumentList.Add('--widget'); $info.ArgumentList.Add($selection[0])
        $info.ArgumentList.Add('--escena'); $info.ArgumentList.Add($selection[1])
    } else {
        if ($Widget) { $info.ArgumentList.Add('--widget'); $info.ArgumentList.Add($Widget) }
        if ($Escena) { $info.ArgumentList.Add('--escena'); $info.ArgumentList.Add($Escena) }
    }
    $candidate = [Diagnostics.Process]::Start($info)
    $deadline = [datetime]::UtcNow.AddSeconds(20)
    while (-not $candidate.HasExited -and -not [VantareWorkshopDevWindow]::Visible([uint32]$candidate.Id)) {
        if ([datetime]::UtcNow -ge $deadline) {
            $candidate.Kill()
            [void]$candidate.WaitForExit(5000)
            throw 'La nueva ventana no apareció en 20 s; se conserva la anterior.'
        }
        Start-Sleep -Milliseconds 20
    }
    if ($candidate.HasExited) { throw "Workshop terminó al arrancar: $($candidate.ExitCode); se conserva la ventana anterior." }
    if ($script:running) {
        if (-not $script:running.HasExited) { $script:running.Kill(); [void]$script:running.WaitForExit(5000) }
        Remove-Item -LiteralPath $script:running.StartInfo.FileName -ErrorAction SilentlyContinue
    }
    $script:running = $candidate
}

try {
    $seen = (Get-Sources).Signature
    if (-not (Build-Workshop)) { throw 'Falló la compilación inicial.' }
    Start-Workshop
    Write-Host 'Listo: guarda Rust para recompilar, JSON para recargar en vivo. Ctrl+C para salir.'
    while (-not $running.HasExited) {
        Start-Sleep -Milliseconds 150
        $current = Get-Sources
        if ($current.Signature -eq $seen) { continue }
        $detected = [datetime]::UtcNow
        do {
            $current = Get-Sources
            Start-Sleep -Milliseconds 200
            $stable = Get-Sources
        } while ($current.Signature -ne $stable.Signature)
        # Fija lo compilado ANTES del build: un guardado durante cargo dispara otro ciclo.
        $seen = $stable.Signature
        $saved = $stable.Saved
        if ($saved -gt $detected -or $saved -lt $detected.AddSeconds(-2)) { $saved = $detected }
        if (-not (Build-Workshop)) {
            Write-Host 'Error de compilación: sigue abierta la versión anterior.'
            continue
        }
        $compiled = [datetime]::UtcNow
        if ($running.HasExited) { break }
        try {
            Start-Workshop
            Write-Host ('guardar -> compilado {0:N3} s | guardar -> ventana visible {1:N3} s (no mide presentación de píxel)' -f
                ($compiled - $saved).TotalSeconds, ([datetime]::UtcNow - $saved).TotalSeconds)
        } catch { Write-Warning $_ }
    }
} finally {
    if ($running -and -not $running.HasExited) { $running.Kill(); [void]$running.WaitForExit(5000) }
    # Solo ficheros de esta sesión; nunca limpieza recursiva del TEMP compartido.
    Get-ChildItem -LiteralPath $runDir -File | Remove-Item -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $runDir -ErrorAction SilentlyContinue
}
