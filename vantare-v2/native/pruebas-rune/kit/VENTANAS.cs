using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace Vantare141 {
 public static class Windows {
  delegate bool Visitor(IntPtr hwnd, IntPtr state);
  [DllImport("user32.dll")] static extern bool EnumWindows(Visitor visitor, IntPtr state);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
  [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out Rect rect);
  delegate bool MonitorVisitor(IntPtr monitor, IntPtr dc, ref Rect rect, IntPtr state);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc,IntPtr clip,MonitorVisitor visitor,IntPtr state);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr monitor,ref MonitorInfo info);
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct MonitorInfo {
   public uint Size; public Rect Monitor,Work; public uint Flags;
   [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string Device;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
  public sealed class Description { public long Handle; public uint Dpi; public int Width,Height; }
  public static bool LayoutsMatchSdk() {
   return Marshal.SizeOf(typeof(Rect))==16 && Marshal.SizeOf(typeof(MonitorInfo))==104;
  }
  public sealed class MonitorDescription { public string Device; public int X,Y,Width,Height; public bool Primary; }
  public static MonitorDescription[] Monitors() {
   var found=new List<MonitorDescription>();
   MonitorVisitor visitor=(IntPtr monitor,IntPtr dc,ref Rect rect,IntPtr state)=> {
    var info=new MonitorInfo {Size=(uint)Marshal.SizeOf(typeof(MonitorInfo))};
    if(!GetMonitorInfo(monitor,ref info)) throw new InvalidOperationException("GetMonitorInfo");
    found.Add(new MonitorDescription {Device=info.Device,X=rect.Left,Y=rect.Top,
     Width=rect.Right-rect.Left,Height=rect.Bottom-rect.Top,Primary=(info.Flags&1)!=0});
    return true;
   };
   if(!EnumDisplayMonitors(IntPtr.Zero,IntPtr.Zero,visitor,IntPtr.Zero)) throw new InvalidOperationException("EnumDisplayMonitors");
   GC.KeepAlive(visitor);return found.ToArray();
  }
  public static Description[] Visible(int processId) {
   var found=new List<Description>();
   Visitor visitor=(hwnd,state)=> {
    uint pid; GetWindowThreadProcessId(hwnd,out pid);
    if(pid==(uint)processId && IsWindowVisible(hwnd)) {
     Rect r; if(!GetClientRect(hwnd,out r)) throw new InvalidOperationException("GetClientRect");
     found.Add(new Description {Handle=hwnd.ToInt64(),Dpi=GetDpiForWindow(hwnd),Width=r.Right-r.Left,Height=r.Bottom-r.Top});
    }
    return true;
   };
   if(!EnumWindows(visitor,IntPtr.Zero)) throw new InvalidOperationException("EnumWindows");
   GC.KeepAlive(visitor); return found.ToArray();
  }
  public static void HideShow(int processId,long handle,bool hidden) {
   var hwnd=new IntPtr(handle); uint pid; GetWindowThreadProcessId(hwnd,out pid);
   if(pid!=(uint)processId) throw new InvalidOperationException("Ventana ajena");
   ShowWindow(hwnd,hidden?0:4); // SW_SHOWNOACTIVATE
  }
 }
}
