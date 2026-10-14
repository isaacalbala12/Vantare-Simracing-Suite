$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/capture-bitmap.ps1"
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class HubCaptureBitmapTest {
    [DllImport("gdi32.dll")] public static extern uint SetPixel(IntPtr dc, int x, int y, uint color);
}
'@
$root = Join-Path ([IO.Path]::GetTempPath()) ('hub-dib-test-' + [guid]::NewGuid())
[void][IO.Directory]::CreateDirectory($root)
$legacy = [Drawing.Bitmap]::new(1,1)
$graphics = [Drawing.Graphics]::FromImage($legacy)
$native = [HubCaptureBitmap]::new(3,1)
try {
    # Reproduce la colisión de GDI+, sin ventana ni renderer: RGB(13,11,12).
    $hdc = $graphics.GetHdc()
    try {
        if ([HubCaptureBitmapTest]::SetPixel($hdc,0,0,0x000c0b0d) -ne 0x000c0b0d) { throw 'GDI no escribió el píxel centinela' }
    }
    finally { $graphics.ReleaseHdc($hdc) }
    if ($legacy.GetPixel(0,0).A -ne 0) { throw 'La reproducción del centinela GDI+ cambió' }

    # El DIB conserva los bytes reales y también alfa 254/0: no fuerza opacidad.
    $bytes = [byte[]]@(12,11,13,255, 12,11,13,254, 12,11,13,0)
    [Runtime.InteropServices.Marshal]::Copy($bytes,0,$native.Bits,$bytes.Length)
    $png = Join-Path $root 'raw.png'
    Save-HubCaptureBitmap $native $png
    $saved = [Drawing.Bitmap]::new($png)
    try {
        foreach ($x in 0..2) {
            $pixel = $saved.GetPixel($x,0)
            if ($pixel.R -ne 13 -or $pixel.G -ne 11 -or $pixel.B -ne 12 -or $pixel.A -ne $bytes[$x*4+3]) {
                throw "BGRA alterado en píxel $x"
            }
        }
    } finally { $saved.Dispose() }
    $rejected = $false
    try { & "$PSScriptRoot/assert-opaque.ps1" -Path $png | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw 'El guard debe rechazar alfa 254/0 del DIB' }
    'PASS centinela GDI+ reproducido; DIB conserva RGB y alfa 255/254/0; guard rechaza transparencia'
} finally {
    $native.Dispose(); $graphics.Dispose(); $legacy.Dispose()
    [IO.File]::Delete((Join-Path $root 'raw.png'))
    [IO.Directory]::Delete($root)
}
