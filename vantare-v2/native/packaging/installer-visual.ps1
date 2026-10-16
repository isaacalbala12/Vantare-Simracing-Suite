#requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$Snapshot,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [string[]]$Screens=@('welcome','installing','done','error','installed','uninstall','options','uninstalled')
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'candidate.ps1')
$exe=Assert-NativePath $Executable
$snapshot=Assert-NativePath $Snapshot
$evidence=Assert-NativePath $EvidenceDirectory
$prefix=[IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa/')
if(-not $evidence.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or -not $snapshot.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Captura fuera de QA.'}
if(Test-Path -LiteralPath 'C:/tmp/fase2/pantalla-ocupada'){throw 'Pantalla ocupada; no se abren ventanas.'}
[IO.Directory]::CreateDirectory($evidence)|Out-Null
Add-Type -AssemblyName System.Drawing
if(-not ('InstallerCapture1591' -as [type])){
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class InstallerCapture1591 {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd,out RECT rect);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd,ref POINT point);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
}
'@
}
$mutex=[Threading.Mutex]::new($false,'Global\VantareParityCapture')
$held=$false
try{
    try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
    if(-not $held){throw 'Otra captura tiene el mutex.'}
    foreach($screen in $Screens){
        if($screen -cnotin @('welcome','installing','done','error','installed','uninstall','options','uninstalled')){throw 'Estado de captura desconocido.'}
        if(Test-Path -LiteralPath 'C:/tmp/fase2/pantalla-ocupada'){throw 'Pantalla ocupada antes de abrir QA.'}
        $png=Join-Path $evidence ($screen+'.png'); $ready=[IO.Path]::ChangeExtension($png,'ready')
        if((Test-Path -LiteralPath $png) -or (Test-Path -LiteralPath $ready)){throw 'No sobrescribir capturas previas.'}
        $arguments='"--capture='+$png+'" "--snapshot='+$snapshot+'" "--screen='+$screen+'"'
        $process=Start-Process -FilePath $exe -ArgumentList $arguments -PassThru
        try{
            $watch=[Diagnostics.Stopwatch]::StartNew()
            while(-not (Test-Path -LiteralPath $ready) -and -not $process.HasExited -and $watch.Elapsed.TotalSeconds -lt 30){Start-Sleep -Milliseconds 25}
            if($process.HasExited -or -not (Test-Path -LiteralPath $ready)){throw "La ventana QA no confirmó un frame: $screen"}
            $process.Refresh(); $handle=$process.MainWindowHandle
            if($handle -eq [IntPtr]::Zero){throw 'No hay HWND propio para capturar.'}
            $null=[InstallerCapture1591]::SetForegroundWindow($handle)
            $rect=[InstallerCapture1591+RECT]::new(); $point=[InstallerCapture1591+POINT]::new()
            if(-not [InstallerCapture1591]::GetClientRect($handle,[ref]$rect) -or -not [InstallerCapture1591]::ClientToScreen($handle,[ref]$point)){throw 'Área cliente no disponible.'}
            $width=$rect.Right-$rect.Left; $height=$rect.Bottom-$rect.Top; $dpi=[InstallerCapture1591]::GetDpiForWindow($handle)
            if($dpi -ne 96 -or $width -ne 720 -or $height -ne 460){throw "QA exige 100% en la sesión de prueba; actual ${width}x${height}, DPI=$dpi. No se cambia el DPI de Isaac."}
            $bitmap=[Drawing.Bitmap]::new($width,$height,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
            $graphics=[Drawing.Graphics]::FromImage($bitmap)
            try{$graphics.CopyFromScreen($point.X,$point.Y,0,0,[Drawing.Size]::new($width,$height));$bitmap.Save($png,[Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$bitmap.Dispose()}
            [IO.File]::WriteAllText((Join-Path $evidence ($screen+'.json')),(@{screen=$screen;pid=$process.Id;width=$width;height=$height;dpi=$dpi;capture='real GPUI client area';snapshot=$snapshot}|ConvertTo-Json))
            "CAPTURE $screen ${width}x${height} DPI=$dpi"
        }finally{
            if(-not $process.HasExited){$null=$process.CloseMainWindow();if(-not $process.WaitForExit(10000)){throw "QA no cerró PID $($process.Id); no se mata el proceso."}}
            $process.Dispose()
        }
    }
}finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
