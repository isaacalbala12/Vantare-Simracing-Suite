param(
 [Parameter(Mandatory)][string]$Script,
 [string]$LaunchLog='C:\VantareServer\ops\as\vantare-svc\workers-launch.out'
)
$ErrorActionPreference='Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WorkersSvcProcess {
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint id);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool DuplicateTokenEx(IntPtr token,uint access,IntPtr attrs,int level,int type,out IntPtr duplicate);
 [DllImport("advapi32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool CreateProcessAsUserW(IntPtr token,string app,string cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFO startup,out PROCESS_INFORMATION process);
 [DllImport("userenv.dll",SetLastError=true)] static extern bool CreateEnvironmentBlock(out IntPtr env,IntPtr token,bool inherit);
 [DllImport("userenv.dll")] static extern bool DestroyEnvironmentBlock(IntPtr env);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STARTUPINFO { public int cb; public string reserved,desktop,title; public uint x,y,xs,ys,xc,yc,fill,flags; public short show,reserved2; public IntPtr res,stdin,stdout,stderr; }
 [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process,thread; public uint processId,threadId; }
 public static uint Run(uint id,string command) {
  IntPtr p=IntPtr.Zero,t=IntPtr.Zero,d=IntPtr.Zero,e=IntPtr.Zero;
  try {
   p=OpenProcess(0x1000,false,id); if(p==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"OpenProcess");
   if(!OpenProcessToken(p,0xA,out t))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"OpenProcessToken");
   if(!DuplicateTokenEx(t,0x02000000,IntPtr.Zero,2,1,out d))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"DuplicateTokenEx");
   if(!CreateEnvironmentBlock(out e,d,false))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"CreateEnvironmentBlock");
   var s=new STARTUPINFO(); s.cb=Marshal.SizeOf(s); s.desktop=""; var pi=new PROCESS_INFORMATION();
   if(!CreateProcessAsUserW(d,null,command,IntPtr.Zero,IntPtr.Zero,false,0x08000400,e,@"C:\Windows\Temp",ref s,out pi))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"CreateProcessAsUserW");
   CloseHandle(pi.process); CloseHandle(pi.thread); return pi.processId;
  } finally { if(e!=IntPtr.Zero)DestroyEnvironmentBlock(e); if(d!=IntPtr.Zero)CloseHandle(d); if(t!=IntPtr.Zero)CloseHandle(t); if(p!=IntPtr.Zero)CloseHandle(p); }
 }
}
"@
$svc=Get-CimInstance Win32_Process -Filter "name='wsl.exe'" | Where-Object {$_.CommandLine -match '-d vantare-svc ' } | Select-Object -First 1
if(-not $svc){throw 'No hay proceso WSL de vantare-svc'}
$cmd='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$Script+'"'
[WorkersSvcProcess]::Run($svc.ProcessId,('C:\Windows\System32\cmd.exe /d /c '+$cmd+' > "'+$LaunchLog+'" 2>&1'))
