<#
Comprueba con EnumWindows/GetWindowRect que las ventanas de vantare-overlays
quedan exactamente donde y del tamaño que toca, en los dos modos (4 widgets,
100 % de DPI, un solo monitor): por-widget = una ventana por widget en su
posición; una = una ventana del tamaño del monitor en su esquina. Falla (exit 1)
ante cualquier diferencia, p. ej. el desfase de 4 px que GPUI metía en Y.

  .\check-windows.ps1 [-Exe ..\target\debug\vantare-overlays.exe]
#>
param([string]$Exe = "$PSScriptRoot\..\target\debug\vantare-overlays.exe")
$ErrorActionPreference = 'Stop'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public class Win {
  public delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(Cb cb, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  public struct R { public int l, t, r, b; }
  public static List<string> Rects(uint pid) {
    var o = new List<string>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) { R r; GetWindowRect(h, out r);
        // GPUI deja alguna ventana auxiliar visible de 0x0: no es un overlay.
        if (r.r > r.l && r.b > r.t) o.Add(String.Format("{0}x{1}@{2},{3}", r.r - r.l, r.b - r.t, r.l, r.t)); }
      return true; }, IntPtr.Zero);
    o.Sort(); return o; }
}
"@
Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
# Standings, radar, pedales, standings: origin_of / wanted_size de app.rs.
$sizes = @('474x364', '220x220', '120x160', '474x364')
$expected = @{
    'por-widget' = (0..3 | ForEach-Object { "$($sizes[$_])@$(20 + ($_ % 4) * 470),$(20 + [math]::Floor($_ / 4) * 60)" } | Sort-Object)
    'una'        = @("$($screen.Width)x$($screen.Height)@$($screen.X),$($screen.Y)")
}
$failed = $false
foreach ($mode in 'por-widget', 'una') {
    $p = Start-Process $Exe -ArgumentList 4, '--ventanas', $mode -PassThru
    try {
        Start-Sleep 6
        $got = [Win]::Rects([uint32]$p.Id)
    } finally { Stop-Process -Id $p.Id -ErrorAction SilentlyContinue }
    $ok = ($got -join ';') -eq ($expected[$mode] -join ';')
    "{0,-10} {1}  obtenido: {2}" -f $mode, $(if ($ok) { 'OK' } else { 'FALLA' }), ($got -join ' ')
    if (-not $ok) { "           esperado: $($expected[$mode] -join ' ')"; $failed = $true }
}
exit ([int]$failed)
