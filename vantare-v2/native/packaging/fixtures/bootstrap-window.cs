// Invisible, owned process for exercising the actual bootstrap signal and image guard.
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class BootstrapFixture {
    delegate IntPtr WndProc(IntPtr hwnd, uint message, UIntPtr wp, IntPtr lp);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct WindowClass {
        public uint style; public WndProc proc; public int classExtra, windowExtra;
        public IntPtr instance, icon, cursor, background;
        public string menu, name;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct Message {
        public IntPtr hwnd; public uint message; public UIntPtr wp; public IntPtr lp;
        public uint time; public int x, y; public uint privateData;
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern ushort RegisterClass(ref WindowClass wc);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex, string cls, string title, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr data);
    [DllImport("user32.dll")] static extern IntPtr DefWindowProc(IntPtr hwnd, uint message, UIntPtr wp, IntPtr lp);
    [DllImport("user32.dll")] static extern int GetMessage(out Message msg, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Message msg);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint message, UIntPtr wp, IntPtr lp);
    [DllImport("user32.dll")] static extern void PostQuitMessage(int code);
    static WndProc procedure;
    public static int Main(string[] args) {
        bool hung = args.Length > 0 && args[0] == "hung";
        procedure = delegate(IntPtr hwnd, uint message, UIntPtr wp, IntPtr lp) {
            if (message == 0x8000 + 107 || (message == 0x8000 + 106 && !hung)) {
                PostQuitMessage(0);
                return IntPtr.Zero;
            }
            return DefWindowProc(hwnd, message, wp, lp);
        };
        var wc = new WindowClass { name = "VantareStartupIndicator", proc = procedure };
        if (RegisterClass(ref wc) == 0) return 2;
        var window = CreateWindowEx(0, wc.name, "", 0, 0, 0, 0, 0, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
        if (window == IntPtr.Zero) return 3;
        // Never ShowWindow: this fixture cannot disturb the user's desktop.
        Console.WriteLine(window.ToInt64());
        Console.Out.Flush();
        var cleanup = new Thread(delegate() {
            Console.In.ReadToEnd();
            PostMessage(window, 0x8000 + 107, UIntPtr.Zero, IntPtr.Zero);
        });
        cleanup.IsBackground = true;
        cleanup.Start();
        Message msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) DispatchMessage(ref msg);
        GC.KeepAlive(procedure);
        return 0;
    }
}
