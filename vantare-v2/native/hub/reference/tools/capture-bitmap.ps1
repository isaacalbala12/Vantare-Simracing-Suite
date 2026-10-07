# DIB nativo: Graphics.GetHdc/ReleaseHdc pierde el color centinela RGB(13,11,12).
# Conserva BGRA de PrintWindow, incluido su alfa; no compone ni normaliza píxeles.
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public sealed class HubCaptureBitmap : IDisposable {
    [StructLayout(LayoutKind.Sequential)]
    struct BitmapInfo {
        public uint Size;
        public int Width, Height;
        public ushort Planes, BitCount;
        public uint Compression, SizeImage;
        public int XPelsPerMeter, YPelsPerMeter;
        public uint ClrUsed, ClrImportant;
    }
    [DllImport("gdi32.dll", SetLastError=true)] static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll", SetLastError=true)] static extern IntPtr CreateDIBSection(IntPtr dc, ref BitmapInfo info, uint usage, out IntPtr bits, IntPtr section, uint offset);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] static extern bool GdiFlush();
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd, IntPtr dc, uint flags);
    public IntPtr Hdc { get; private set; }
    public IntPtr Bits { get; private set; }
    public int Width { get; private set; }
    public int Height { get; private set; }
    IntPtr bitmap, previous;
    public HubCaptureBitmap(int width, int height) {
        if (width <= 0 || height <= 0 || width > 8192 || height > 8192) throw new ArgumentOutOfRangeException("width/height");
        Width = width; Height = height;
        try {
            Hdc = CreateCompatibleDC(IntPtr.Zero);
            if (Hdc == IntPtr.Zero) throw new InvalidOperationException("GDI capture allocation failed: " + Marshal.GetLastWin32Error());
            // Top-down BI_RGB de 32 bits; el stride es exactamente width * 4.
            var info = new BitmapInfo { Size = 40, Width = width, Height = -height, Planes = 1, BitCount = 32 };
            IntPtr bits;
            bitmap = CreateDIBSection(Hdc, ref info, 0, out bits, IntPtr.Zero, 0);
            if (bitmap == IntPtr.Zero) throw new InvalidOperationException("GDI capture allocation failed: " + Marshal.GetLastWin32Error());
            Bits = bits;
            previous = SelectObject(Hdc, bitmap);
            if (previous == IntPtr.Zero || previous == new IntPtr(-1)) throw new InvalidOperationException("GDI capture allocation failed: " + Marshal.GetLastWin32Error());
        } catch { Dispose(); throw; }
    }
    public bool Capture(IntPtr hwnd) { return PrintWindow(hwnd, Hdc, 3); }
    public void Flush() {
        // CreateDIBSection exige completar GDI antes de leer el puntero BGRA.
        if (!GdiFlush()) throw new InvalidOperationException("GdiFlush failed");
    }
    public void Dispose() {
        if (previous != IntPtr.Zero && previous != new IntPtr(-1)) { SelectObject(Hdc, previous); previous = IntPtr.Zero; }
        if (bitmap != IntPtr.Zero) { DeleteObject(bitmap); bitmap = IntPtr.Zero; Bits = IntPtr.Zero; }
        if (Hdc != IntPtr.Zero) { DeleteDC(Hdc); Hdc = IntPtr.Zero; }
    }
}
'@


function Save-HubCaptureBitmap([HubCaptureBitmap]$Buffer, [string]$Path) {
    if ($Buffer.Bits -eq [IntPtr]::Zero) { throw 'Bitmap de captura ya liberado' }
    $Buffer.Flush()
    $image = [Drawing.Bitmap]::new($Buffer.Width, $Buffer.Height, $Buffer.Width * 4, [Drawing.Imaging.PixelFormat]::Format32bppArgb, $Buffer.Bits)
    try { $image.Save($Path, [Drawing.Imaging.ImageFormat]::Png) }
    finally { $image.Dispose() }
}
