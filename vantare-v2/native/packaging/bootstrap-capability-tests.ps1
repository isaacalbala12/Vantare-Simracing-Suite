#requires -Version 5.1
param([Parameter(Mandatory)][string]$GuiExecutable, [Parameter(Mandatory)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'beta.ps1') -Library -Root $PSScriptRoot
$evidence = Assert-NativePath $EvidenceDirectory
[IO.Directory]::CreateDirectory($evidence) | Out-Null
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class BootstrapDesktop {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct Startup {
        public int cb; public string reserved, desktop, title;
        public int x,y,width,height,columns,rows,fill,flags;
        public short show,reservedCount; public IntPtr reservedBytes,input,output,error;
    }
    [StructLayout(LayoutKind.Sequential)] public struct ProcessInfo {
        public IntPtr process, thread; public uint pid, tid;
    }
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr CreateDesktop(string name,IntPtr device,IntPtr mode,uint flags,uint access,IntPtr attributes);
    [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CreateProcess(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref Startup startup,out ProcessInfo process);
    [DllImport("kernel32.dll")] public static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll")] public static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] public static extern bool TerminateProcess(IntPtr process,uint code);
}
'@
foreach ($case in @(
    @{ Capable = $false; Background = $false },
    @{ Capable = $true; Background = $false },
    @{ Capable = $true; Background = $true }
)) {
    $capable = $case.Capable
    $background = $case.Background
    $expectedIndicator = $capable -and -not $background
    $root = Join-Path $evidence ([guid]::NewGuid().ToString('N'))
    $bin = Join-Path $root ('generations/' + [guid]::NewGuid().ToString('N') + '/bin')
    [IO.Directory]::CreateDirectory($bin) | Out-Null
    $exe = Join-Path $bin 'vantare.exe'
    [IO.File]::Copy((Assert-NativePath $GuiExecutable), $exe)
    # Workspace builds also provide the installed Hub resource fallback.
    $hub = Join-Path ([IO.Path]::GetDirectoryName($GuiExecutable)) 'vantare-hub.exe'
    if (Test-Path -LiteralPath $hub) { [IO.File]::Copy((Assert-NativePath $hub), (Join-Path $bin 'vantare-hub.exe')) }
    $eventName = 'Local\VantareBootstrapTest' + [guid]::NewGuid().ToString('N')
    $done = [Threading.EventWaitHandle]::new($false, [Threading.EventResetMode]::ManualReset, $eventName)
    $script = @'
param([string]$Root)
$ErrorActionPreference='Stop'
$result=@{ok=$false;indicator=$false;guard=$false}
try {
    . '__PRODUCT_BETA__' -Root $Root -Library
    $expected=[IO.File]::ReadAllText((Join-Path $Root 'expected')) -ceq 'True'
    $result.indicator= -not [string]::IsNullOrEmpty($env:VANTARE_STARTUP_WINDOW)
    if($expected -ne $result.indicator){throw 'Capability and actual indicator disagree.'}
    $background=[IO.File]::ReadAllText((Join-Path $Root 'background')) -ceq 'True'
    if(($env:VANTARE_INTERACTIVE_STARTUP -ceq '1') -eq $background){throw 'Interactive startup environment does not match background mode.'}
    if(($env:VANTARE_BACKGROUND_STARTUP -ceq '1') -ne $background){throw 'Background startup environment was not propagated.'}
    if($expected){
        Add-Type 'using System; using System.Runtime.InteropServices; public static class VisibleBootstrap { [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd); [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] public static extern IntPtr Style(IntPtr hwnd,int index); }'
        $window=[IntPtr][long]$env:VANTARE_STARTUP_WINDOW
        if(-not [VisibleBootstrap]::IsWindowVisible($window)){throw 'Indicator window is not visible.'}
        $result.style=[VisibleBootstrap]::Style($window,-20).ToInt64()
        if(($result.style -band 0x08000080) -ne 0x08000080 -or ($result.style -band 0x00040000) -ne 0){throw 'Indicator must not activate or create a taskbar entry.'}
        Complete-BetaBootstrap $Root
    }else{
        # Synchronize with the exact bootstrap created by the test, never sleeps.
        try {
            $bootstrap=[Diagnostics.Process]::GetProcessById([int][IO.File]::ReadAllText((Join-Path $Root 'bootstrap-pid')))
            try {if(-not $bootstrap.WaitForExit(10000)){throw 'Legacy bootstrap retained its image.'}}
            finally {$bootstrap.Dispose()}
        }catch [ArgumentException]{}
    }
    $handles=Open-NativeBinaryGuard $Root
    foreach($handle in $handles.Values){$handle.Dispose()}
    $result.guard=$true
    $result.ok=$true
}catch{$result.error=$_.Exception.Message}
finally{
    [IO.File]::WriteAllText((Join-Path $Root 'result.json'),($result|ConvertTo-Json))
    $event=[Threading.EventWaitHandle]::OpenExisting([IO.File]::ReadAllText((Join-Path $Root 'event-name')))
    $null=$event.Set();$event.Dispose()
}
'@
    $product = (Join-Path $PSScriptRoot 'beta.ps1').Replace("'", "''")
    $script = $script.Replace('__PRODUCT_BETA__', $product)
    if ($capable) { $script = "# vantare-boot-capabilities: indicator-handshake-v1`n" + $script }
    [IO.File]::WriteAllText((Join-Path $root 'beta.ps1'), $script, [Text.UTF8Encoding]::new($true))
    [IO.File]::WriteAllText((Join-Path $root 'expected'), $expectedIndicator.ToString())
    [IO.File]::WriteAllText((Join-Path $root 'background'), $background.ToString())
    [IO.File]::WriteAllText((Join-Path $root 'event-name'), $eventName)
    $name = 'VantareBootstrap' + [guid]::NewGuid().ToString('N')
    $desktop = [BootstrapDesktop]::CreateDesktop($name, [IntPtr]::Zero, [IntPtr]::Zero, 0, 0x10000000, [IntPtr]::Zero)
    if ($desktop -eq [IntPtr]::Zero) { throw 'CreateDesktop failed.' }
    $startup = [BootstrapDesktop+Startup]::new()
    $startup.cb = [Runtime.InteropServices.Marshal]::SizeOf($startup)
    $startup.desktop = 'WinSta0\' + $name
    $process = [BootstrapDesktop+ProcessInfo]::new()
    try {
        # Suspended only until its exact PID is stored; all windows remain private.
        $command = [Text.StringBuilder]::new('"' + $exe + '" --beta -Root "' + $root + '"')
        if ($background) { $null = $command.Append(' --background') }
        if (-not [BootstrapDesktop]::CreateProcess($exe, $command, [IntPtr]::Zero, [IntPtr]::Zero, $false, 0x08000004, [IntPtr]::Zero, $root, [ref]$startup, [ref]$process)) { throw 'CreateProcess failed.' }
        [IO.File]::WriteAllText((Join-Path $root 'bootstrap-pid'), $process.pid.ToString())
        $null = [BootstrapDesktop]::ResumeThread($process.thread)
        if (-not $done.WaitOne(30000)) { throw "Capability fixture timed out: $root" }
        if ([BootstrapDesktop]::WaitForSingleObject($process.process, 10000) -ne 0) { throw 'Bootstrap did not exit.' }
        $result = [IO.File]::ReadAllText((Join-Path $root 'result.json')) | ConvertFrom-Json
        if (-not $result.ok -or -not $result.guard -or $result.indicator -ne $expectedIndicator) { throw ($result | ConvertTo-Json -Compress) }
        Write-Output "PASS capability=$capable background=$background actual indicator and exclusive image guard"
    } finally {
        if ($process.thread -ne [IntPtr]::Zero) { $null = [BootstrapDesktop]::CloseHandle($process.thread) }
        if ($process.process -ne [IntPtr]::Zero) {
            # Failure cleanup only: the pinned handle is the exact private test child.
            # Production Apply/rollback never terminates the bootstrap on timeout.
            if ([BootstrapDesktop]::WaitForSingleObject($process.process, 0) -eq 258) {
                $null = [BootstrapDesktop]::TerminateProcess($process.process, 99)
                $null = [BootstrapDesktop]::WaitForSingleObject($process.process, 5000)
            }
            $null = [BootstrapDesktop]::CloseHandle($process.process)
        }
        $null = [BootstrapDesktop]::CloseDesktop($desktop)
        $done.Dispose()
    }
}
