param([Parameter(Mandatory)][string]$Config)
$ErrorActionPreference='Stop'
$configuration=Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
if ($configuration.runs -ne 5) { throw 'This first measurement requires five alternating pairs' }
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class FirstHubMeasure {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Entry {
  public uint size,usage,pid; public UIntPtr heap; public uint module,threads,parent; public int priority; public uint flags;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string exe;
 }
 [StructLayout(LayoutKind.Sequential)] struct Rect { public int left,top,right,bottom; }
 delegate bool Visitor(IntPtr window,IntPtr data);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Process32FirstW(IntPtr h,ref Entry e);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Process32NextW(IntPtr h,ref Entry e);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("user32.dll")] static extern bool EnumWindows(Visitor visitor,IntPtr data);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window,out Rect rect);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect rect);
 [DllImport("user32.dll",SetLastError=true)] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
 [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SendMessageTimeoutW(IntPtr window,uint message,UIntPtr wparam,IntPtr lparam,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll",SetLastError=true)] static extern bool PostMessageW(IntPtr window,uint message,UIntPtr wparam,IntPtr lparam);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 public static void Dpi() { SetThreadDpiAwarenessContext(new IntPtr(-4)); }
 public static int[] Family(int root) {
  var parents=new Dictionary<int,int>(); var h=CreateToolhelp32Snapshot(2,0);
  if(h==new IntPtr(-1)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  try { var e=new Entry {size=(uint)Marshal.SizeOf<Entry>()}; if(Process32FirstW(h,ref e)) do {parents[(int)e.pid]=(int)e.parent;} while(Process32NextW(h,ref e)); } finally {CloseHandle(h);}
  var found=new HashSet<int>{root}; bool added;
  do {added=false;foreach(var pair in parents) if(found.Contains(pair.Value)&&found.Add(pair.Key)) added=true;} while(added);
  var result=new List<int>();foreach(int pid in found) if(parents.ContainsKey(pid)) result.Add(pid);return result.ToArray();
 }
 public static long Visible(int root) {
  var family=new HashSet<int>(Family(root)); IntPtr found=IntPtr.Zero;
  Visitor visitor=(window,data)=> {uint pid;Rect r;GetWindowThreadProcessId(window,out pid);if(family.Contains((int)pid)&&IsWindowVisible(window)&&GetClientRect(window,out r)&&r.right>500&&r.bottom>300){found=window;return false;}return true;};
  EnumWindows(visitor,IntPtr.Zero);GC.KeepAlive(visitor);return found.ToInt64();
 }
 public static bool Responsive(long handle) { UIntPtr result;return SendMessageTimeoutW(new IntPtr(handle),0,UIntPtr.Zero,IntPtr.Zero,2,1000,out result)!=IntPtr.Zero; }
 public static void Resize(long handle) {var window=new IntPtr(handle);Rect outer,client;if(!GetWindowRect(window,out outer)||!GetClientRect(window,out client)||!SetWindowPos(window,IntPtr.Zero,0,0,1440+outer.right-outer.left-client.right,900+outer.bottom-outer.top-client.bottom,2|4|16))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
 public static void Home(long handle) {var window=new IntPtr(handle);var point=new IntPtr((73<<16)|38);foreach(uint message in new uint[]{0x200,0x201,0x202})if(!PostMessageW(window,message,new UIntPtr(message==0x201 ? 1u:0u),point))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
 public static bool Activate(long handle) {var window=new IntPtr(handle);SetForegroundWindow(window);return GetForegroundWindow()==window;}
 public static void Tab(long handle,int x) {var window=new IntPtr(handle);var point=new IntPtr((25<<16)|x);foreach(uint message in new uint[]{0x200,0x201,0x202}){UIntPtr result;if(SendMessageTimeoutW(window,message,new UIntPtr(message==0x201 ? 1u:0u),point,2,1000,out result)==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}}
 public static int[] Size(long handle) {Rect rect;if(!GetClientRect(new IntPtr(handle),out rect))throw new InvalidOperationException("Client bounds");return new int[]{rect.right,rect.bottom};}
}
'@
[FirstHubMeasure]::Dpi()
. (Join-Path $PSScriptRoot '../../native/hub/reference/tools/capture-bitmap.ps1')
function Save-Window([long]$Handle,[string]$Path) {
    $size=[FirstHubMeasure]::Size($Handle)
    $bitmap=[HubCaptureBitmap]::new($size[0],$size[1])
    try { if(-not $bitmap.Capture([IntPtr]$Handle)){throw 'Measurement screenshot failed'}; Save-HubCaptureBitmap $bitmap $Path } finally { $bitmap.Dispose() }
}
function Wait-NativeTab([long]$Handle,[int]$UnderlineX,[bool]$General) {
    $buffer=[HubCaptureBitmap]::new(1440,900)
    $deadline=[Diagnostics.Stopwatch]::StartNew()
    try {
        do {
            if(-not $buffer.Capture([IntPtr]$Handle)){throw 'Readiness capture failed'}
            $buffer.Flush()
            $offset=(50*1440+$UnderlineX)*4
            $blue=[Runtime.InteropServices.Marshal]::ReadByte($buffer.Bits,$offset)
            $green=[Runtime.InteropServices.Marshal]::ReadByte($buffer.Bits,$offset+1)
            $red=[Runtime.InteropServices.Marshal]::ReadByte($buffer.Bits,$offset+2)
            $painted=$true
            if($General){
                $surface=(195*1440+108)*4
                $painted=[Runtime.InteropServices.Marshal]::ReadByte($buffer.Bits,$surface+2) -ge 32 -and [Runtime.InteropServices.Marshal]::ReadByte($buffer.Bits,$surface+1) -ge 26
            }
            if($red -gt 140 -and $green -lt 70 -and $blue -lt 70 -and $painted){return}
            if($deadline.Elapsed.TotalSeconds -gt 15){throw "GPUI readiness unavailable at x=$UnderlineX rgb=$red,$green,$blue surface=$painted; sample rejected"}
            Start-Sleep -Milliseconds 5
        } while($true)
    } finally { $buffer.Dispose() }
}
function Get-CpuSnapshot([int[]]$Family) {
    $result=@{}
    foreach($entry in (Get-CimInstance Win32_PerfRawData_PerfProc_Process -Property IDProcess,PercentProcessorTime,Timestamp_Sys100NS -ErrorAction Stop)) {
        if($Family -contains [int]$entry.IDProcess){$result[[int]$entry.IDProcess]=$entry}
    }
    foreach($id in $Family){if(-not $result.ContainsKey($id)){throw "CPU counter missing for measured PID $id"}}
    return $result
}
for($iteration=0;$iteration -lt 5;$iteration++) {
    $applications=@($configuration.apps)
    if($iteration % 2){[array]::Reverse($applications)}
    foreach($application in $applications) {
        @{phase='before';app=$application.name;iteration=$iteration} | ConvertTo-Json -Compress | Write-Output
        if([Console]::ReadLine() -ne 'launch'){throw 'Missing launch acknowledgement'}
        $info=[Diagnostics.ProcessStartInfo]::new($application.exe)
        $info.UseShellExecute=$false;$info.RedirectStandardInput=$true;$info.RedirectStandardError=$true;$info.CreateNoWindow=$true
        $info.WorkingDirectory=[IO.Path]::GetDirectoryName($application.exe)
        foreach($argument in $application.arguments){$info.ArgumentList.Add($argument)}
        foreach($property in $application.environment.PSObject.Properties){$info.Environment[$property.Name]=[string]$property.Value}
        $process=[Diagnostics.Process]::new();$process.StartInfo=$info
        $clock=[Diagnostics.Stopwatch]::StartNew()
        if(-not $process.Start()){throw 'Process failed to start'}
        $stderr=$process.StandardError.ReadToEndAsync()
        try {
            $window=0L
            while(-not $window) {
                if($process.HasExited){throw "Process exited before showing: $($stderr.GetAwaiter().GetResult())"}
                if($clock.Elapsed.TotalSeconds -gt 60){throw 'Visible window deadline'}
                $window=[FirstHubMeasure]::Visible($process.Id)
                if(-not $window){Start-Sleep -Milliseconds 5}
            }
            $visibleMs=$clock.Elapsed.TotalMilliseconds
            [FirstHubMeasure]::Resize($window)
            if(-not [FirstHubMeasure]::Responsive($window)){throw 'Window did not answer WM_NULL'}
            $responsiveMs=$clock.Elapsed.TotalMilliseconds
            $foreground=[FirstHubMeasure]::Activate($window)
            $controlProof='Playwright: Apariencia to General, heading and focus verified'
            if($application.name -eq 'gpui') {
                [FirstHubMeasure]::Tab($window,280)
                Wait-NativeTab $window 280 $true
                [FirstHubMeasure]::Tab($window,370)
                Wait-NativeTab $window 370 $false
                [FirstHubMeasure]::Tab($window,280)
                Wait-NativeTab $window 280 $true
                $controlProof='Win32: Apariencia to General; active underline and General card painted'
            }
            @{phase='visible';app=$application.name;iteration=$iteration;pid=$process.Id;window=$window;visibleMs=$visibleMs;responsiveMs=$responsiveMs;controlProof=$controlProof;foreground=$foreground} | ConvertTo-Json -Compress | Write-Output
            if([Console]::ReadLine() -ne 'ready'){throw 'Missing renderer ready acknowledgement'}
            $verifiedMs=$clock.Elapsed.TotalMilliseconds
            foreach($section in @('settings','home')) {
                if($section -eq 'home') {
                    if($application.name -eq 'gpui'){[FirstHubMeasure]::Home($window)}
                    @{phase='navigate';app=$application.name;iteration=$iteration;section=$section} | ConvertTo-Json -Compress | Write-Output
                    if([Console]::ReadLine() -ne 'ready'){throw 'Missing navigation acknowledgement'}
                }
                Start-Sleep -Seconds 3 # Fixed idle settling interval, not a readiness condition.
                $family=[FirstHubMeasure]::Family($process.Id)
                $metrics=@();$private=0L;$working=0L
                foreach($id in $family){$item=Get-Process -Id $id -ErrorAction Stop;$private+=$item.PrivateMemorySize64;$working+=$item.WorkingSet64;$metrics+=@{pid=$id;name=$item.ProcessName;privateBytes=$item.PrivateMemorySize64;workingSetBytes=$item.WorkingSet64}}
                $cpuBefore=Get-CpuSnapshot $family
                Start-Sleep -Seconds 5 # Defined idle CPU observation interval.
                $cpuAfter=Get-CpuSnapshot $family
                $cpu=0.0;$cpuMilliseconds=0.0
                foreach($metric in $metrics){
                    $id=$metric.pid
                    $ticks=[long]$cpuAfter[$id].PercentProcessorTime-[long]$cpuBefore[$id].PercentProcessorTime
                    $interval=[long]$cpuAfter[$id].Timestamp_Sys100NS-[long]$cpuBefore[$id].Timestamp_Sys100NS
                    if($ticks -lt 0 -or $interval -le 0){throw 'Invalid CPU counter interval'}
                    $cpu+=100.0*$ticks/$interval
                    $cpuMilliseconds=[Math]::Max($cpuMilliseconds,$interval/10000.0)
                    $metric.cpuBefore100ns=[string]$cpuBefore[$id].PercentProcessorTime
                    $metric.cpuAfter100ns=[string]$cpuAfter[$id].PercentProcessorTime
                    $metric.cpuInterval100ns=[string]$interval
                }
                Save-Window $window (Join-Path $configuration.evidence "$($application.name)-$section-$iteration.png")
                @{phase='idle';app=$application.name;iteration=$iteration;section=$section;verifiedMs=$verifiedMs;privateBytes=$private;workingSetBytes=$working;cpuOneCorePercent=$cpu;cpuSource='CIM PerfProc raw';cpuSampleMilliseconds=$cpuMilliseconds;processMetrics=$metrics;familyAfter=@([FirstHubMeasure]::Family($process.Id))} | ConvertTo-Json -Depth 5 -Compress | Write-Output
                if([Console]::ReadLine() -ne 'next'){throw 'Missing sample acknowledgement'}
            }
            $process.StandardInput.Close()
            if(-not $process.WaitForExit(10000)){throw 'Controlled close deadline'}
            @{phase='closed';app=$application.name;iteration=$iteration;stderr=$stderr.GetAwaiter().GetResult();survivors=@([FirstHubMeasure]::Family($process.Id))} | ConvertTo-Json -Compress | Write-Output
        } catch {
            if($window -and -not $process.HasExited) { Save-Window $window (Join-Path $configuration.evidence "$($application.name)-unavailable-$iteration.png") }
            throw
        } finally { if(-not $process.HasExited){$process.Kill($true);$process.WaitForExit()};[IO.File]::WriteAllText((Join-Path $configuration.evidence "$($application.name)-$iteration.stderr.log"),$stderr.GetAwaiter().GetResult());$process.Dispose() }
    }
}
