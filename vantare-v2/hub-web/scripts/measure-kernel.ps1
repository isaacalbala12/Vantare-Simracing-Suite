# Measurement helper only; no product changes. Its lifetime owns both compiler slots.
param([Parameter(Mandatory)][string]$Config)
$ErrorActionPreference='Stop'
$leases=@()
$mutexes=@()
try {
    $configuration=Get-Content -Raw -LiteralPath $Config | ConvertFrom-Json
    foreach($slot in 0..1){
        $mutexes+=,[Threading.Mutex]::new($false,"Global\VantareCargoSlot$slot")
    }
    @{phase='queue';waitMilliseconds=$configuration.waitMilliseconds} | ConvertTo-Json -Compress | Write-Output
    if(-not [Threading.WaitHandle]::WaitAll([Threading.WaitHandle[]]$mutexes,[int]$configuration.waitMilliseconds)){throw 'Compilation queue stayed busy; measurement refused'}
    $leases=$mutexes
    if(Get-Process cargo,rustc -ErrorAction SilentlyContinue){throw 'Compiler process remains active despite slot reservation'}
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class HubMeasure {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Entry {
    public uint size, usage, pid; public UIntPtr heap; public uint module, threads, parent; public int priority; public uint flags;
    [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string exe;
  }
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int left,top,right,bottom; }
  [StructLayout(LayoutKind.Sequential)] struct Luid { public uint low; public int high; }
  [StructLayout(LayoutKind.Sequential)] struct Privilege { public uint count; public Luid luid; public uint attributes; }
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Process32FirstW(IntPtr h,ref Entry e);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Process32NextW(IntPtr h,ref Entry e);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  delegate bool Callback(IntPtr window,IntPtr value);
  [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback,IntPtr value);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect rect);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window,out Rect rect);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  public static void Dpi() { SetThreadDpiAwarenessContext(new IntPtr(-4)); }
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool LookupPrivilegeValueW(string system,string name,out Luid luid);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool AdjustTokenPrivileges(IntPtr token,bool disable,ref Privilege privilege,uint length,IntPtr previous,IntPtr returned);
  [DllImport("ntdll.dll")] static extern int NtSetSystemInformation(int kind,ref int value,int length);
  public static void Cold() {
    IntPtr token;
    if(!OpenProcessToken(Process.GetCurrentProcess().Handle,0x28,out token)) throw new System.ComponentModel.Win32Exception();
    try {
      Luid luid;
      if(!LookupPrivilegeValueW(null,"SeProfileSingleProcessPrivilege",out luid)) throw new System.ComponentModel.Win32Exception();
      var privilege=new Privilege { count=1,luid=luid,attributes=2 };
      if(!AdjustTokenPrivileges(token,false,ref privilege,0,IntPtr.Zero,IntPtr.Zero)||Marshal.GetLastWin32Error()!=0) throw new System.ComponentModel.Win32Exception();
      int command=4;
      int status=NtSetSystemInformation(80,ref command,4);
      if(status!=0) throw new InvalidOperationException("Standby purge failed: 0x"+status.ToString("x"));
    } finally { CloseHandle(token); }
  }
  public static int[] Family(int root) {
    var parents=new Dictionary<int,int>(); var h=CreateToolhelp32Snapshot(2,0);
    if(h==new IntPtr(-1)) throw new System.ComponentModel.Win32Exception();
    try { var e=new Entry { size=(uint)Marshal.SizeOf<Entry>() }; if(Process32FirstW(h,ref e)) do { parents[(int)e.pid]=(int)e.parent; } while(Process32NextW(h,ref e)); }
    finally { CloseHandle(h); }
    var found=new HashSet<int> {root}; bool added;
    do { added=false; foreach(var pair in parents) if(found.Contains(pair.Value)&&found.Add(pair.Key)) added=true; } while(added);
    var values=new List<int>(); foreach(var pid in found) if(parents.ContainsKey(pid)) values.Add(pid); return values.ToArray();
  }
  public static long Visible(int root) {
    var ids=new HashSet<int>(Family(root)); IntPtr result=IntPtr.Zero;
    EnumWindows((window,value)=> { uint pid; GetWindowThreadProcessId(window,out pid); Rect rect;
      if(ids.Contains((int)pid)&&IsWindowVisible(window)&&GetWindowRect(window,out rect)&&rect.right-rect.left>200&&rect.bottom-rect.top>100) {result=window;return false;} return true; },IntPtr.Zero);
    return result.ToInt64();
  }
  [DllImport("user32.dll",SetLastError=true)] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
  public static void Resize(long handle,int width,int height) {
    var window=new IntPtr(handle);Rect outer,client;
    if(!GetWindowRect(window,out outer)||!GetClientRect(window,out client)) throw new System.ComponentModel.Win32Exception();
    if(!SetWindowPos(window,IntPtr.Zero,0,0,width+outer.right-outer.left-client.right,height+outer.bottom-outer.top-client.bottom,2|4|16)) throw new System.ComponentModel.Win32Exception();
  }
  public static int[] Size(long handle) { Rect rect; if(!GetClientRect(new IntPtr(handle),out rect)) throw new InvalidOperationException("Client bounds"); return new int[] {rect.right,rect.bottom}; }
}
'@
    [HubMeasure]::Dpi()
    . (Join-Path $PSScriptRoot '../../native/hub/reference/tools/capture-bitmap.ps1')
    function Save-OwnMeasuredWindow([long]$Handle,[string]$Name){
      $size=[HubMeasure]::Size($Handle)
      $bitmap=[HubCaptureBitmap]::new($size[0],$size[1])
      try{if(-not $bitmap.Capture([IntPtr]$Handle)){throw 'Measured window capture failed'};Save-HubCaptureBitmap $bitmap (Join-Path $configuration.evidence $Name)}finally{$bitmap.Dispose()}
    }
    for($iteration=0;$iteration -lt $configuration.runs;$iteration++){
      $ordered=@($configuration.apps)
      if($iteration%2){[array]::Reverse($ordered)}
      foreach($application in $ordered){
        foreach($mode in @('cold','warm')){
          @{phase='before';app=$application.name;mode=$mode;iteration=$iteration} | ConvertTo-Json -Compress | Write-Output
          if([Console]::ReadLine() -ne 'launch'){throw 'Driver did not prepare the run'}
          if($mode -eq 'cold'){[HubMeasure]::Cold()}
          $info=[Diagnostics.ProcessStartInfo]::new($application.exe)
          $info.UseShellExecute=$false;$info.RedirectStandardInput=$true;$info.RedirectStandardError=$true;$info.CreateNoWindow=$true
          $info.WorkingDirectory=[IO.Path]::GetDirectoryName($application.exe)
          foreach($argument in $application.arguments){$info.ArgumentList.Add($argument)}
          foreach($property in $application.environment.PSObject.Properties){$info.Environment[$property.Name]=[string]$property.Value}
          $process=[Diagnostics.Process]::new();$process.StartInfo=$info
          if(-not $process.Start()){throw 'Process did not start'}
          $stderr=$process.StandardError.ReadToEndAsync()
          try {
            $deadline=[Diagnostics.Stopwatch]::StartNew();$handle=0
            while(-not $handle){
              if($process.HasExited){throw ('Measured process exited before showing: '+$stderr.GetAwaiter().GetResult())}
              if($deadline.Elapsed.TotalSeconds -gt 30){throw 'Visible-window deadline'}
              $handle=[HubMeasure]::Visible($process.Id)
              if(-not $handle){Start-Sleep -Milliseconds 5}
            }
            $visibleMs=([DateTime]::UtcNow-$process.StartTime.ToUniversalTime()).TotalMilliseconds
            [HubMeasure]::Resize($handle,1440,900)
            $settingsVerification='Playwright'
            if($application.name -eq 'gpui'){
              if(-not $application.initialSettings){throw 'GPUI measurement requires its explicit QA bank'}
              if(-not $process.WaitForInputIdle(10000)){throw 'GPUI input-idle deadline'}
              $settingsVerification='QA bank starts in Settings; verify saved screenshots'
            }
            @{phase='visible';app=$application.name;mode=$mode;iteration=$iteration;pid=$process.Id;window=$handle;visibleMs=$visibleMs;settingsVerification=$settingsVerification} | ConvertTo-Json -Compress | Write-Output
            if([Console]::ReadLine() -ne 'ready'){throw 'Driver did not confirm Settings'}
            Start-Sleep -Seconds 10 # Defined idle settling period, not a readiness heuristic.
            $family=[HubMeasure]::Family($process.Id)
            $before=@{};$workingSet=0L;$details=@()
            foreach($id in $family){$item=Get-Process -Id $id -ErrorAction Stop;$before[$id]=$item.TotalProcessorTime.TotalMilliseconds;$workingSet+=$item.WorkingSet64;$details+=@{pid=$id;name=$item.ProcessName;workingSetBytes=$item.WorkingSet64}}
            $cpuWatch=[Diagnostics.Stopwatch]::StartNew()
            Start-Sleep -Seconds 5 # Defined idle CPU sampling window.
            $cpu=0.0
            foreach($id in $family){$item=Get-Process -Id $id -ErrorAction Stop;$cpu+=$item.TotalProcessorTime.TotalMilliseconds-$before[$id]}
            @{phase='idle';app=$application.name;mode=$mode;iteration=$iteration;workingSetBytes=$workingSet;processes=@($family);processMetrics=$details;cpuOneCorePercent=100*$cpu/$cpuWatch.Elapsed.TotalMilliseconds} | ConvertTo-Json -Depth 5 -Compress | Write-Output
            if([Console]::ReadLine() -ne 'stop'){throw 'Driver did not confirm metrics'}
            if($application.name -eq 'gpui'){Save-OwnMeasuredWindow $handle ('gpui-'+$mode+'-'+$iteration+'.png')}
            $process.StandardInput.Close()
            if(-not $process.WaitForExit(10000)){throw 'Controlled close deadline'}
            @{phase='closed';app=$application.name;mode=$mode;iteration=$iteration;stderr=$stderr.GetAwaiter().GetResult();survivors=@([HubMeasure]::Family($process.Id))} | ConvertTo-Json -Compress | Write-Output
          } finally {if(-not $process.HasExited){$process.Kill($true);$process.WaitForExit()};$process.Dispose()}
        }
      }
    }
} finally {foreach($mutex in $leases){$mutex.ReleaseMutex()};foreach($mutex in $mutexes){$mutex.Dispose()}}
