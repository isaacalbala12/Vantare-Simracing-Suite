<#
Workshop de desarrollo: abre vantare-workshop con una escena fija y, cada vez que
guardas un fichero de ui/src (o ui/fixtures), recompila en incremental y reabre el
binario con los mismos argumentos (misma escena, mismos widgets, misma posición).
Si la compilación falla, se muestran los errores y sigue abierta la última versión
buena. Ctrl+C para salir.

Windows no deja sobrescribir un .exe en marcha, así que se ejecuta una copia: la
versión nueva arranca (y se ve) antes de cerrar la vieja, sin parpadeo.

  .\workshop.ps1                                            # los tres widgets, escena LMU por defecto
  .\workshop.ps1 -WorkshopArgs '--widgets','standings','--pos','100,80'
  .\workshop.ps1 -WorkshopArgs '--escena','C:\otra.json'

Por cada ciclo imprime el tiempo desde que guardaste el fichero hasta que se
compiló y hasta que la ventana nueva es visible.
#>
param(
    [string[]]$WorkshopArgs = @(),
    [int]$Jobs = 4
)
$ErrorActionPreference = 'Stop'
# Sin información de depuración el enlazado es más rápido (ciclo ~1,5 s más corto);
# es un perfil aparte: la primera vez recompila las dependencias.
if (-not $env:CARGO_PROFILE_DEV_DEBUG) { $env:CARGO_PROFILE_DEV_DEBUG = '0' }
$ui = $PSScriptRoot
$native = Split-Path $ui
$built = Join-Path $native 'target\debug\vantare-workshop.exe'
$runDir = Join-Path $env:TEMP 'vantare-workshop'
New-Item -ItemType Directory -Force $runDir | Out-Null

Add-Type @"
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public class WorkshopWin {
  public delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(Cb cb, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  public struct R { public int l, t, r, b; }
  // ¿Tiene el proceso alguna ventana visible y con tamaño?
  public static bool Visible(uint pid) {
    bool found = false;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) { R r; GetWindowRect(h, out r); if (r.r > r.l && r.b > r.t) found = true; }
      return true; }, IntPtr.Zero);
    return found; }
}
"@

function Get-Latest {
    Get-ChildItem (Join-Path $ui 'src'), (Join-Path $ui 'fixtures') -Recurse -File |
        Where-Object { $_.Extension -in '.rs', '.json' } |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
}

$script:running = $null
$script:n = 0

# Copia el .exe recién compilado, lo arranca y espera a que su ventana sea visible.
function Start-Copy {
    $script:n++
    $copy = Join-Path $runDir "run-$($script:n).exe"
    Copy-Item $built $copy -Force
    $start = @{ FilePath = $copy; PassThru = $true }
    if ($WorkshopArgs) { $start.ArgumentList = $WorkshopArgs }
    $p = Start-Process @start
    while (-not $p.HasExited -and -not [WorkshopWin]::Visible([uint32]$p.Id)) { Start-Sleep -Milliseconds 20 }
    if ($p.HasExited) { throw "vantare-workshop terminó al arrancar (código $($p.ExitCode))" }
    if ($script:running) { Stop-Process -Id $script:running.Id -ErrorAction SilentlyContinue }
    $script:running = $p
}

function Build {
    # cargo escribe su progreso por stderr: no debe abortar el script.
    $ErrorActionPreference = 'Continue'
    $out = & cargo build -p vantare-ui --bin vantare-workshop -j $Jobs --manifest-path (Join-Path $native 'Cargo.toml') 2>&1 | ForEach-Object { "$_" } | Where-Object { $_ -notlike 'System.Management.Automation*' }
    # Solo se devuelve el booleano: los errores van a la consola, no al resultado.
    if ($LASTEXITCODE -ne 0) { $out | Select-Object -Last 40 | Write-Host; return $false }
    return $true
}

try {
    "Compilando y abriendo el workshop... (Ctrl+C para salir)"
    if (-not (Build)) { throw 'la primera compilación falló' }
    Start-Copy
    $seen = (Get-Latest).LastWriteTimeUtc
    "Listo. Guarda un fichero de ui/src para recompilar."
    while ($true) {
        Start-Sleep -Milliseconds 150
        $latest = Get-Latest
        if ($latest.LastWriteTimeUtc -le $seen) { continue }
        # Debounce: espera a que el editor termine de escribir.
        do { $stamp = $latest.LastWriteTimeUtc; Start-Sleep -Milliseconds 200; $latest = Get-Latest } while ($latest.LastWriteTimeUtc -ne $stamp)
        $saved = $latest.LastWriteTimeUtc
        $seen = $saved
        "Cambio en $($latest.Name); compilando..."
        if (-not (Build)) { "Error de compilación: sigue abierta la versión anterior."; continue }
        $compiled = [datetime]::UtcNow
        Start-Copy
        $visible = [datetime]::UtcNow
        'guardar -> compilado {0:N1} s | guardar -> ventana visible {1:N1} s' -f ($compiled - $saved).TotalSeconds, ($visible - $saved).TotalSeconds
    }
} finally {
    if ($script:running) { Stop-Process -Id $script:running.Id -ErrorAction SilentlyContinue }
    Get-ChildItem $runDir -Filter 'run-*.exe' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
}
