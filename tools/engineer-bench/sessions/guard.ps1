param([string]$Output, [string]$StopFile, [string]$AbortFile)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BenchMemory {
    [StructLayout(LayoutKind.Sequential)] public struct State {
        public uint length, load;
        public ulong totalPhysical, availablePhysical, totalPage, availablePage;
        public ulong totalVirtual, availableVirtual, availableExtended;
    }
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool GlobalMemoryStatusEx(ref State state);
    public static ulong Available() {
        var state = new State(); state.length = (uint)Marshal.SizeOf<State>();
        if (!GlobalMemoryStatusEx(ref state)) throw new Exception("memory query failed");
        return state.availablePhysical;
    }
}
'@
$writer = [IO.StreamWriter]::new($Output, $false, [Text.UTF8Encoding]::new($false))
try {
    while (-not (Test-Path -LiteralPath $StopFile)) {
        $compilers = @(Get-Process -Name cargo,rustc,link,cl -ErrorAction SilentlyContinue | Select-Object Id,ProcessName)
        $available = [BenchMemory]::Available()
        $point = [ordered]@{ utc = [DateTime]::UtcNow.ToString('o'); available_bytes = $available; compilers = $compilers }
        $writer.WriteLine(($point | ConvertTo-Json -Compress -Depth 4)); $writer.Flush()
        if ($available -lt 536870912 -or $compilers.Count -gt 0) {
            $point | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $AbortFile -Encoding utf8
            break
        }
        Start-Sleep -Milliseconds 500
    }
} catch {
    @{ error = $_.Exception.GetType().Name } | ConvertTo-Json | Set-Content -LiteralPath $AbortFile -Encoding utf8
} finally { $writer.Dispose() }
