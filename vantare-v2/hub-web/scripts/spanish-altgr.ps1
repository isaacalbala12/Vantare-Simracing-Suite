param([Parameter(Mandatory)][int]$ProcessId,[Parameter(Mandatory)][string]$Executable)
$ErrorActionPreference='Stop'
$process=Get-Process -Id $ProcessId
if($process.Path -ne [IO.Path]::GetFullPath($Executable)){throw 'Unexpected QA image'}
$folder='D:/VantareServer/qa/isa-1995-dialog-topbar/tools'
New-Item -ItemType Directory -Path $folder -Force|Out-Null
$dll=Join-Path $folder 'SpanishKeyboardV1.dll'
if(-not(Test-Path -LiteralPath $dll)) {
Add-Type -OutputAssembly $dll -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SpanishKeyboardV1 {
 public delegate bool Callback(IntPtr window,IntPtr data);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback,IntPtr data);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
 [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint thread);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr LoadKeyboardLayoutW(string layout,uint flags);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowTextW(IntPtr window,StringBuilder text,int length);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern void keybd_event(byte vk,byte scan,uint flags,UIntPtr extra);
 [DllImport("user32.dll")] static extern IntPtr SendMessageTimeoutW(IntPtr window,uint msg,IntPtr wp,IntPtr lp,uint flags,uint timeout,out IntPtr result);
 static IntPtr Find(int process) {
  IntPtr found=IntPtr.Zero;
  Callback callback=(window,data)=>{uint pid;GetWindowThreadProcessId(window,out pid);var text=new StringBuilder(256);GetWindowTextW(window,text,text.Capacity);if(pid==process&&text.ToString()=="Vantare · Hub"){found=window;return false;}return true;};
  EnumWindows(callback,IntPtr.Zero);GC.KeepAlive(callback);
  if(found==IntPtr.Zero)throw new Exception("QA HWND unavailable");return found;
 }
 static void Layout(IntPtr window,IntPtr layout) {IntPtr result;if(SendMessageTimeoutW(window,0x50,IntPtr.Zero,layout,2,5000,out result)==IntPtr.Zero)throw new Exception("Input language request timed out");}
 public static string Press(int process) {
  var window=Find(process);uint pid;uint thread=GetWindowThreadProcessId(window,out pid);
  var previousWindow=GetForegroundWindow();var previousLayout=GetKeyboardLayout(thread);
  var spanish=LoadKeyboardLayoutW("0000040A",0);if(spanish==IntPtr.Zero)throw new Exception("Spanish keyboard unavailable");
  try {
   Layout(window,spanish);SetForegroundWindow(window);
   if(!System.Threading.SpinWait.SpinUntil(()=>GetForegroundWindow()==window&&((long)GetKeyboardLayout(thread)&0xffff)==0x040a,5000))throw new Exception("Spanish QA window could not receive native input");
   keybd_event(0xA5,0x38,1,UIntPtr.Zero); // Right Alt, extended scan: real AltGr in the Spanish layout.
   keybd_event(0x32,0x03,0,UIntPtr.Zero);keybd_event(0x32,0x03,2,UIntPtr.Zero);
   keybd_event(0xA5,0x38,3,UIntPtr.Zero);
   Console.WriteLine("INPUT_READY");
   var acknowledged=Console.In.ReadLineAsync();
   if(!acknowledged.Wait(10000)||acknowledged.Result!="ACK")throw new Exception("Native keyboard acknowledgement timed out");
   return "Spanish 0000040A; native RightAlt+Digit2; QA thread "+thread;
  } finally {
   keybd_event(0x32,0x03,2,UIntPtr.Zero);keybd_event(0xA5,0x38,3,UIntPtr.Zero);
   Layout(window,previousLayout);
   if(previousWindow!=IntPtr.Zero)SetForegroundWindow(previousWindow);
  }
 }
}
"@
}
Add-Type -Path $dll
[SpanishKeyboardV1]::Press($ProcessId)
