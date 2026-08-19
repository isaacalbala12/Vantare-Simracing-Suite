# Arrastre de la ventana real de Vantare, en dos modos.
#
#   -Mode api   SetWindowPos programatico. Redimensiona sin entrar en el bucle
#               modal de Windows: mide el coste puro del contenido web.
#   -Mode drag  Arrastre real de la esquina inferior derecha: se entra en el
#               bucle modal de Windows con WM_SYSCOMMAND SC_SIZE|WMSZ_BOTTOMRIGHT
#               y se mueve el cursor paso a paso. Es el unico modo que reproduce
#               el gesto del usuario (WM_ENTERSIZEMOVE bloquea la cola de la app
#               y WebView2 pasa a presentar el contenido de forma diferida).
#               `mouse_event`/WM_NCLBUTTONDOWN sinteticos NO agarran el borde.
param(
  [ValidateSet('api', 'drag')][string]$Mode = 'api',
  [int]$FromWidth = 1900,
  [int]$FromHeight = 1020,
  [int]$ToWidth = 900,
  [int]$ToHeight = 700,
  [int]$Steps = 40,
  [int]$DurationMs = 700
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class VantareWin32 {
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);
  [DllImport("user32.dll")]
  public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$proc = Get-Process vantare -ErrorAction Stop | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { throw 'no vantare window' }
$h = $proc.MainWindowHandle

# La app puede arrancar minimizada (bandeja): con la ventana oculta WebView2
# limita rAF a 1 Hz y no emite `resize`, y la medicion sale falseada.
if ([VantareWin32]::IsIconic($h)) { [void][VantareWin32]::ShowWindow($h, 9) }
[void][VantareWin32]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 400

$SWP_NOZORDER = 0x0004
$SWP_NOACTIVATE = 0x0010
$flags = $SWP_NOZORDER -bor $SWP_NOACTIVATE

# Origen en (0,0) y tamano inicial dentro del area de trabajo: en `drag` la
# esquina inferior derecha tiene que ser alcanzable por el cursor, y SetCursorPos
# recorta a la pantalla (con 1920x1080 arrancando en (40,40) la esquina caia
# fuera y el arrastre no llegaba a agarrar el borde).
$x = 0
$y = 0
[void][VantareWin32]::SetWindowPos($h, [IntPtr]::Zero, $x, $y, $FromWidth, $FromHeight, $flags)
Start-Sleep -Milliseconds 900

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$perStep = $DurationMs / $Steps

if ($Mode -eq 'api') {
  for ($i = 1; $i -le $Steps; $i++) {
    $t = $i / $Steps
    $w = [int]($FromWidth + ($ToWidth - $FromWidth) * $t)
    $ht = [int]($FromHeight + ($ToHeight - $FromHeight) * $t)
    [void][VantareWin32]::SetWindowPos($h, [IntPtr]::Zero, $x, $y, $w, $ht, $flags)
    $target = $perStep * $i
    while ($sw.Elapsed.TotalMilliseconds -lt $target) { }
  }
} else {
  $MOUSEEVENTF_LEFTDOWN = 0x0002
  $MOUSEEVENTF_LEFTUP = 0x0004
  $WM_SYSCOMMAND = 0x0112
  $SC_SIZE_BOTTOMRIGHT = 0xF008
  $x0 = $x + $FromWidth - 2
  $y0 = $y + $FromHeight - 2
  $x1 = $x + $ToWidth - 2
  $y1 = $y + $ToHeight - 2
  [void][VantareWin32]::SetForegroundWindow($h)
  [void][VantareWin32]::SetCursorPos($x0, $y0)
  Start-Sleep -Milliseconds 300
  # Entra en el bucle modal de redimension anclado a la esquina inferior derecha.
  [void][VantareWin32]::PostMessage($h, $WM_SYSCOMMAND, [IntPtr]$SC_SIZE_BOTTOMRIGHT, [IntPtr]0)
  Start-Sleep -Milliseconds 350
  $sw.Restart()
  for ($i = 1; $i -le $Steps; $i++) {
    $t = $i / $Steps
    [void][VantareWin32]::SetCursorPos([int]($x0 + ($x1 - $x0) * $t), [int]($y0 + ($y1 - $y0) * $t))
    $target = $perStep * $i
    while ($sw.Elapsed.TotalMilliseconds -lt $target) { }
  }
  # Clic para confirmar y salir del bucle modal (WM_EXITSIZEMOVE).
  [VantareWin32]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [VantareWin32]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [IntPtr]::Zero)
}
$sw.Stop()

Start-Sleep -Milliseconds 200
$rect = New-Object VantareWin32+RECT
[void][VantareWin32]::GetWindowRect($h, [ref]$rect)
$finalW = $rect.Right - $rect.Left
$finalH = $rect.Bottom - $rect.Top
# El gesto tiene que haber movido la ventana de verdad: si el bucle modal no
# llego a arrancar la medicion seria un cero enganoso.
if ([Math]::Abs($finalW - $ToWidth) -gt 40 -or [Math]::Abs($finalH - $ToHeight) -gt 40) {
  Write-Error ("gesture did not resize: final={0}x{1} expected~{2}x{3}" -f $finalW, $finalH, $ToWidth, $ToHeight)
  exit 2
}
Write-Output ("mode={0} gesture_ms={1} final={2}x{3}" -f $Mode, [int]$sw.Elapsed.TotalMilliseconds, $finalW, $finalH)
